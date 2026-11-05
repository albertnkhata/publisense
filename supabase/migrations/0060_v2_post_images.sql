-- 0060: screenshots on posts. A post can carry up to four images.
--
--   post.images        text[] of object paths in the post-images bucket, in display order.
--   post-images bucket public read, png/jpeg/webp, 3 MB each.
--                      Path {author_id}/{uuid}.{ext}; you upload and delete only under your own id.
--
-- The row keeps paths, never URLs (as avatars and board logos do). A path must sit
-- under the post author's own prefix, so you can't attach someone else's upload.
-- The author may change images in the same edit window as the title and body.
-- Uploads the composer abandons stay in the bucket; they are unguessable and
-- unlisted, and a sweep can clear them later.

alter table public.post add column if not exists images text[] not null default '{}';
create or replace function private.post_images_valid(p_images text[])
returns boolean language sql immutable as $$
  select cardinality(p_images) <= 4
     and not exists (select 1 from unnest(p_images) i
                      where i is null or i !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$');
$$;
revoke all on function private.post_images_valid(text[]) from public;
grant execute on function private.post_images_valid(text[]) to anon, authenticated, service_role;
alter table public.post drop constraint if exists post_images_shape;
alter table public.post add constraint post_images_shape check (private.post_images_valid(images));
comment on column public.post.images is 'Object paths in the post-images bucket, {author_id}/{uuid}.{ext}, at most 4 (0060).';

grant insert (images) on public.post to authenticated;
grant update (images) on public.post to authenticated;

-- Plain checks (not security definer), so the API roles that insert and edit posts run them.
-- Every path must sit under the author's own prefix.
create or replace function private.post_images_owned(p_images text[], p_author uuid)
returns boolean language sql immutable as $$
  select p_author is not null
     and not exists (select 1 from unnest(coalesce(p_images, '{}')) i where split_part(i, '/', 1) <> p_author::text);
$$;
revoke all on function private.post_images_owned(text[], uuid) from public;
grant execute on function private.post_images_owned(text[], uuid) to authenticated, service_role;

create or replace function public.v2_post_before_insert()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then raise exception 'sign in to post' using errcode = '42501'; end if;
    if private.is_blocked(new.board_id) then raise exception 'blocked on this board' using errcode = '42501'; end if;
    new.author_id   := auth.uid();
    new.status      := 'open';
    new.source_url  := null;
    new.merged_into := null;
    new.hidden_at   := null;
    new.edited_at   := null;
    new.vote_count  := 0;
    new.reply_count := 0;
    new.created_at  := now();
    if not private.post_images_owned(new.images, new.author_id) then
      raise exception 'images must be your own uploads' using errcode = '42501', hint = 'images_not_owned';
    end if;
  end if;
  return new;
end $function$;

create or replace function public.v2_post_author_edit_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user in ('anon', 'authenticated')
     and (new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.type is distinct from old.type
       or new.platform is distinct from old.platform
       or new.images is distinct from old.images) then
    if old.status in ('shipped', 'closed', 'merged') then
      raise exception 'this post can no longer be edited (it is %)', old.status
        using errcode = '42501', hint = 'edit_locked_status';
    end if;
    if old.created_at < now() - public.v2_post_edit_window() then
      raise exception 'posts can be edited for % minutes after posting', extract(epoch from public.v2_post_edit_window())::int / 60
        using errcode = '42501', hint = 'edit_window_closed';
    end if;
    if new.images is distinct from old.images and not private.post_images_owned(new.images, old.author_id) then
      raise exception 'images must be your own uploads' using errcode = '42501', hint = 'images_not_owned';
    end if;
  end if;
  return new;
end $function$;

do $storage$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice '0060: no storage schema here; bucket and policies skipped';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('post-images', 'post-images', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "v2 post-images read" on storage.objects;
  drop policy if exists "v2 post-images insert" on storage.objects;
  drop policy if exists "v2 post-images delete" on storage.objects;
  execute $p$
    create policy "v2 post-images read" on storage.objects for select
      using (bucket_id = 'post-images')
  $p$;
  execute $p$
    create policy "v2 post-images insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'post-images'
                  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
                  and split_part(name, '/', 1) = auth.uid()::text)
  $p$;
  execute $p$
    create policy "v2 post-images delete" on storage.objects for delete to authenticated
      using (bucket_id = 'post-images' and split_part(name, '/', 1) = auth.uid()::text)
  $p$;
end
$storage$;

notify pgrst, 'reload schema';
