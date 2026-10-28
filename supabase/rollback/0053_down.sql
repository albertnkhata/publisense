-- Rollback for 0053 (official replies editable only by current team members). Back to
-- the 0051 rules: an official reply's author may edit it while the post is open, team
-- member or not. The trigger itself stays (it is 0051's); only the function body changes.
-- No RLS, grant or auth change to undo.
create or replace function public.v2_reply_author_edit_guard()
returns trigger language plpgsql set search_path = public as $$
declare st public.v2_post_status;
begin
  if current_user in ('anon', 'authenticated') and new.body is distinct from old.body then
    select status into st from post where id = old.post_id;
    if st is null or st in ('shipped', 'closed', 'merged') then
      raise exception 'this reply can no longer be edited (the post is %)', coalesce(st::text, 'unavailable')
        using errcode = '42501', hint = 'edit_locked_status';
    end if;
    if not old.is_official and old.created_at < now() - public.v2_post_edit_window() then
      raise exception 'replies can be edited for % minutes after posting', extract(epoch from public.v2_post_edit_window())::int / 60
        using errcode = '42501', hint = 'edit_window_closed';
    end if;
  end if;
  return new;
end $$;
comment on function public.v2_reply_author_edit_guard() is
  'Reply edit rules (0051, #181): community replies for v2_post_edit_window() after posting, official replies while the post is open; none once Shipped, Closed or Merged.';
