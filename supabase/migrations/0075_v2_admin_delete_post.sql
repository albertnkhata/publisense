-- 0075: Allow platform admins to permanently delete any post (regular or seeded).
--
-- Previously only post authors (via the RLS delete policy in 0017) and platform
-- admins deleting seeded posts (via delete_seeded_post in 0031) could remove a
-- post. Platform admins had no way to permanently delete a regular community
-- post authored by another user.
--
-- public.admin_delete_post(p_post uuid):
--   * Enforces private.is_platform_admin(auth.uid()) server-side.
--   * Reopens any duplicate posts merged into p_post so the
--     `(status = 'merged') = (merged_into is not null)` check constraint never
--     blocks deletion when merged_into is set to null.
--   * Cleans polymorphic reports (post + its replies) and reply notifications.
--   * Hard-deletes the post; foreign keys cascade votes, replies, status_events,
--     merge_records, and post notifications, while v2_post_after decrements
--     board.post_count and cleans post follows/notifications.
--
-- Rollback: supabase/rollback/0075_down.sql.

create or replace function public.admin_delete_post(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  p     public.post;
begin
  if v_uid is null then return public.v2_err('sign_in'); end if;
  if not private.is_platform_admin(v_uid) then return public.v2_err('not_allowed'); end if;

  select * into p from public.post where id = p_post for update;
  if not found then return public.v2_err('not_found'); end if;

  -- Unmerge any posts pointing at this target so ON DELETE SET NULL cannot
  -- violate the `(status = 'merged') = (merged_into is not null)` check.
  update public.post
     set status = 'open',
         merged_into = null
   where merged_into = p.id;

  -- Clean polymorphic references not covered by FK cascades.
  delete from public.report
   where (target = 'post' and target_id = p.id)
      or (target = 'reply' and target_id in (select id from public.reply where post_id = p.id));

  delete from public.notification
   where target_type = 'reply'
     and target_id in (select id from public.reply where post_id = p.id);

  -- Delete the post (cascades vote, reply, status_event, merge_record, notification(post_id)
  -- and fires v2_post_after to decrement board.post_count and clean post follows/notifications).
  delete from public.post where id = p.id;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.admin_delete_post(uuid) from public, anon;
grant execute on function public.admin_delete_post(uuid) to authenticated;

-- Keep delete_seeded_post aligned with the same merged-post and polymorphic cleanup.
create or replace function public.delete_seeded_post(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  p     public.post;
begin
  if v_uid is null then return public.v2_err('sign_in'); end if;
  if not private.is_platform_admin(v_uid) then return public.v2_err('not_allowed'); end if;

  select * into p
    from public.post
   where id = p_post and author_id is null and source_url is not null
   for update;
  if not found then return public.v2_err('not_found'); end if;

  update public.post
     set status = 'open',
         merged_into = null
   where merged_into = p.id;

  delete from public.report
   where (target = 'post' and target_id = p.id)
      or (target = 'reply' and target_id in (select id from public.reply where post_id = p.id));

  delete from public.notification
   where target_type = 'reply'
     and target_id in (select id from public.reply where post_id = p.id);

  delete from public.post where id = p.id;
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.delete_seeded_post(uuid) from public, anon;
grant execute on function public.delete_seeded_post(uuid) to authenticated;
