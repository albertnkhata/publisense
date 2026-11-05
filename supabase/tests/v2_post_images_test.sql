-- Post images (0060). Runs as the real API roles inside a transaction that ROLLS BACK:
-- the post-images bucket and its policies, the four-image cap and path shape, that a
-- post only carries its author's own uploads, and that images follow the edit window.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_post_images_test.sql

\set ON_ERROR_STOP 1
begin;
set local statement_timeout = '60s';

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
  end if;
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.expect_error(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok   % (refused: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % : statement succeeded but should have been refused', label;
end $$;

-- ------------------------------------------------------------ fixtures

create temp table f as
  select gen_random_uuid() as ann, gen_random_uuid() as bea, gen_random_uuid() as board,
         gen_random_uuid() as i1, gen_random_uuid() as i2, gen_random_uuid() as i3,
         gen_random_uuid() as i4, gen_random_uuid() as i5;
grant select on f to anon, authenticated;
create temp table r (k text primary key, id uuid);
grant all on r to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ann, 'ann-' || left(ann::text, 8) || '@img-ci.dev', now(), '{"full_name":"Ann"}'::jsonb from f
union all select bea, 'bea-' || left(bea::text, 8) || '@img-ci.dev', now(), '{"full_name":"Bea"}'::jsonb from f;
insert into public.board (id, slug, name, site, claimed_at)
select board, 'imgci-' || left(board::text, 6), 'Img CI', 'imgci.dev', null from f;

select pg_temp.expect('0060: post-images bucket is public, 3 MB, png/jpeg/webp',
  exists (select 1 from storage.buckets where id = 'post-images' and public and file_size_limit = 3145728
           and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp'] and cardinality(allowed_mime_types) = 3));
select pg_temp.expect('0060: post.images is not null and defaults to empty',
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'post'
           and column_name = 'images' and is_nullable = 'NO' and column_default like '''{}''%'));

-- ------------------------------------------------------------ storage

select pg_temp.as_user((select ann from f));
insert into storage.objects (bucket_id, name, owner)
select 'post-images', ann || '/' || i1 || '.png', ann from f;
select pg_temp.expect('0060: you can upload under your own id', true);
select pg_temp.expect_error('0060: you cannot upload under someone else''s id',
  $q$ insert into storage.objects (bucket_id, name) select 'post-images', bea || '/' || i2 || '.png' from f $q$);
select pg_temp.expect_error('0060: only png, jpg and webp names',
  $q$ insert into storage.objects (bucket_id, name) select 'post-images', ann || '/' || i2 || '.gif' from f $q$);
select pg_temp.expect_error('0060: no nested folders',
  $q$ insert into storage.objects (bucket_id, name) select 'post-images', ann || '/x/' || i2 || '.png' from f $q$);
select pg_temp.as_user(null);
select pg_temp.expect_error('0060: signed out cannot upload',
  $q$ insert into storage.objects (bucket_id, name) select 'post-images', ann || '/' || i3 || '.png' from f $q$);
select pg_temp.expect('0060: anyone can read post images',
  exists (select 1 from storage.objects o, f where o.bucket_id = 'post-images' and o.name = f.ann || '/' || f.i1 || '.png'));
select pg_temp.as_user((select bea from f));
delete from storage.objects o using f where o.bucket_id = 'post-images' and o.name = f.ann || '/' || f.i1 || '.png';
select pg_temp.as_owner();
select pg_temp.expect('0060: you cannot delete someone else''s upload',
  exists (select 1 from storage.objects o, f where o.bucket_id = 'post-images' and o.name = f.ann || '/' || f.i1 || '.png'));

-- ------------------------------------------------------------ posts

select pg_temp.as_user((select ann from f));
insert into public.post (board_id, type, title, body, images)
select board, 'bug', 'Crash on save', 'See screenshots', array[ann || '/' || i1 || '.png', ann || '/' || i2 || '.webp'] from f;
insert into r select 'p1', id from public.post where title = 'Crash on save' and author_id = (select ann from f);
select pg_temp.expect('0060: a post keeps its images in order',
  (select images from public.post where id = (select id from r where k = 'p1'))
    = (select array[ann || '/' || i1 || '.png', ann || '/' || i2 || '.webp'] from f));
select pg_temp.expect_error('0060: at most four images',
  $q$ insert into public.post (board_id, type, title, body, images)
      select board, 'bug', 'Too many', '', array[ann||'/'||i1||'.png', ann||'/'||i2||'.png', ann||'/'||i3||'.png', ann||'/'||i4||'.png', ann||'/'||i5||'.png'] from f $q$);
select pg_temp.expect_error('0060: paths must be bucket paths, not URLs',
  $q$ insert into public.post (board_id, type, title, body, images)
      select board, 'bug', 'A URL', '', array['https://evil.example/x.png'] from f $q$);
select pg_temp.expect_error('0060: you cannot attach someone else''s upload',
  $q$ insert into public.post (board_id, type, title, body, images)
      select board, 'bug', 'Borrowed', '', array[bea || '/' || i3 || '.png'] from f $q$);

-- Editing: your own paths within the window; never someone else's.
update public.post set images = (select array[ann || '/' || i2 || '.webp'] from f) where id = (select id from r where k = 'p1');
select pg_temp.expect('0060: the author can change images in the edit window',
  cardinality((select images from public.post where id = (select id from r where k = 'p1'))) = 1);
select pg_temp.expect_error('0060: an edit cannot swap in someone else''s upload',
  $q$ update public.post set images = (select array[bea || '/' || i3 || '.png'] from f) where id = (select id from r where k = 'p1') $q$);
select pg_temp.as_user((select bea from f));
update public.post set images = '{}' where id = (select id from r where k = 'p1');
select pg_temp.as_owner();
select pg_temp.expect('0060: nobody else can change a post''s images',
  cardinality((select images from public.post where id = (select id from r where k = 'p1'))) = 1);

update public.post set created_at = now() - interval '2 days' where id = (select id from r where k = 'p1');
select pg_temp.as_user((select ann from f));
select pg_temp.expect_error('0060: images are locked once the edit window closes',
  $q$ update public.post set images = '{}' where id = (select id from r where k = 'p1') $q$);

select pg_temp.as_owner();
rollback;
