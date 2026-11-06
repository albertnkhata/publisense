-- Post drafts (0061). Runs as the real API roles inside a transaction that ROLLS BACK:
-- drafts are owner-only, always saved as the caller, carry only the author's own
-- uploads, stamp updated_at, cap at 20 each, and go with the account.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_post_drafts_test.sql

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
         gen_random_uuid() as i1, gen_random_uuid() as i2;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ann, 'ann-' || left(ann::text, 8) || '@draft-ci.dev', now(), '{"full_name":"Ann"}'::jsonb from f
union all select bea, 'bea-' || left(bea::text, 8) || '@draft-ci.dev', now(), '{"full_name":"Bea"}'::jsonb from f;
insert into public.board (id, slug, name, site, claimed_at)
select board, 'draftci-' || left(board::text, 6), 'Draft CI', 'draftci.dev', null from f;

-- ------------------------------------------------------------ owner-only drafts

select pg_temp.as_user((select ann from f));
insert into public.post_draft (board_id, type, platform, title, body, images)
select board, 'feature', 'web', 'Half a thought', 'More later', array[ann || '/' || i1 || '.png'] from f;
select pg_temp.expect('0061: a draft is saved as its author',
  (select author_id from public.post_draft where title = 'Half a thought') = (select ann from f));
insert into public.post_draft (title) values ('');
select pg_temp.expect('0061: an empty draft is allowed (no board, type or title)',
  exists (select 1 from public.post_draft where title = '' and board_id is null and type is null));
select pg_temp.expect('0061: the author sees both drafts',
  (select count(*) from public.post_draft) = 2);
select pg_temp.expect_error('0061: a draft cannot carry someone else''s upload',
  $q$ insert into public.post_draft (title, images) select 'Borrowed', array[bea || '/' || i2 || '.png'] from f $q$);
select pg_temp.expect_error('0061: author_id is not writable',
  $q$ update public.post_draft set author_id = (select bea from f) $q$);

select pg_temp.as_user((select bea from f));
select pg_temp.expect('0061: nobody else can read your drafts',
  (select count(*) from public.post_draft) = 0);
update public.post_draft set title = 'Hijacked';
delete from public.post_draft;
select pg_temp.as_user(null);
select pg_temp.expect_error('0061: signed out cannot read drafts',
  $q$ select count(*) from public.post_draft $q$);

select pg_temp.as_user((select ann from f));
select pg_temp.expect('0061: others could not change or delete them',
  (select count(*) from public.post_draft where title = 'Half a thought') = 1
  and not exists (select 1 from public.post_draft where title = 'Hijacked'));

select pg_temp.as_owner();
alter table public.post_draft disable trigger post_draft_before_write;
update public.post_draft set updated_at = now() - interval '1 day' where title = 'Half a thought';
alter table public.post_draft enable trigger post_draft_before_write;
select pg_temp.as_user((select ann from f));
update public.post_draft set body = 'Edited' where title = 'Half a thought';
select pg_temp.expect('0061: updated_at is stamped on every change',
  (select updated_at from public.post_draft where title = 'Half a thought') > now() - interval '1 minute');

-- Up to 20 drafts each.
insert into public.post_draft (title) select 'Draft ' || g from generate_series(3, 20) g;
select pg_temp.expect_error('0061: at most 20 drafts',
  $q$ insert into public.post_draft (title) values ('Twenty-first') $q$);

delete from public.post_draft where title = 'Half a thought';
select pg_temp.expect('0061: the author can delete a draft',
  (select count(*) from public.post_draft) = 19);

-- Drafts go with the account.
select pg_temp.as_owner();
delete from public.profile where id = (select ann from f);
select pg_temp.expect('0061: deleting the account deletes its drafts',
  not exists (select 1 from public.post_draft d, f where d.author_id = f.ann));

rollback;
