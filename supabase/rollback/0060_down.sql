-- Rollback for 0060 (post images). Restores the post triggers as they were in prod
-- before 0060, drops post.images and its helpers, and removes the bucket policies.
-- Objects already uploaded stay in storage; empty the post-images bucket from the
-- dashboard if you want them gone (direct deletes from storage.objects are refused).
begin;
create or replace function public.v2_post_before_insert()
 returns trigger language plpgsql set search_path to 'public'
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
  end if;
  return new;
end $function$;
create or replace function public.v2_post_author_edit_guard()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if current_user in ('anon', 'authenticated')
     and (new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.type is distinct from old.type
       or new.platform is distinct from old.platform) then
    if old.status in ('shipped', 'closed', 'merged') then
      raise exception 'this post can no longer be edited (it is %)', old.status
        using errcode = '42501', hint = 'edit_locked_status';
    end if;
    if old.created_at < now() - public.v2_post_edit_window() then
      raise exception 'posts can be edited for % minutes after posting', extract(epoch from public.v2_post_edit_window())::int / 60
        using errcode = '42501', hint = 'edit_window_closed';
    end if;
  end if;
  return new;
end $function$;
alter table public.post drop constraint if exists post_images_shape;
alter table public.post drop column if exists images;
drop function if exists private.post_images_valid(text[]);
drop function if exists private.post_images_owned(text[], uuid);
drop policy if exists "v2 post-images read" on storage.objects;
drop policy if exists "v2 post-images insert" on storage.objects;
drop policy if exists "v2 post-images delete" on storage.objects;
commit;
notify pgrst, 'reload schema';
