-- 0053: official team replies are editable only while their author is still on the team.
-- Approved by Albert on 2026-10-28 (07:39 CAT). Builds on 0051 (#181, PR #195).
--
-- Before: under 0051 the author of an official reply (is_official = true) could edit it
-- at any time while the post was open, even after leaving the team or being removed
-- from it. The reply still speaks as "<Board> · Team", so a former teammate could
-- change what the team said.
--
-- Now the same BEFORE UPDATE trigger (v2_reply_author_edit_guard) also refuses an API
-- caller's change to an official reply's body when its author is no longer a current
-- member of the board's team (board or hub membership, private.is_board_team, the rule
-- that let them post it as official in the first place). Hint 'edit_not_team_member',
-- errcode 42501, so PostgREST answers 403 and nothing is written.
--
-- Order of checks: the status lock (edit_locked_status) first, so a frozen thread says
-- why it is frozen; then the team check (official replies); then the 1-hour window
-- (community replies). Community replies are untouched by this migration: a former
-- teammate's own community replies follow the window like anyone's.
--
-- Unchanged (no RLS, grant or auth change):
--   * Only the author edits a reply (policy "v2 reply author update", 0017; body-only
--     column grant). The team check asks about old.author_id, which RLS already makes
--     the caller.
--   * Deleting: a former member can still delete their own old official reply (the
--     reply delete policy, unchanged). Changing that would be an RLS change; reported
--     to Albert rather than made.
--   * Moderation and owner fixes run as the table owner (definer RPCs, migrations), so
--     the trigger does not apply to them.
--   * private.is_board_team and private.post_board already grant EXECUTE to
--     authenticated (0047; the reply insert trigger uses them the same way), so this
--     invoker-rights trigger needs no new grant.
--
-- The client mirrors this in web/src/api/posts.ts (replyEditLockReason): Edit shows
-- disabled with "Only current team members can edit team replies".
--
-- Rollback: supabase/rollback/0053_down.sql (restores the 0051 function body).

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
    if old.is_official and not coalesce(private.is_board_team(private.post_board(old.post_id), old.author_id), false) then
      raise exception 'only current team members can edit team replies'
        using errcode = '42501', hint = 'edit_not_team_member';
    end if;
    if not old.is_official and old.created_at < now() - public.v2_post_edit_window() then
      raise exception 'replies can be edited for % minutes after posting', extract(epoch from public.v2_post_edit_window())::int / 60
        using errcode = '42501', hint = 'edit_window_closed';
    end if;
  end if;
  return new;
end $$;
comment on function public.v2_reply_author_edit_guard() is
  'Reply edit rules (0051, #181; 0053): community replies for v2_post_edit_window() after posting, official replies while the post is open and only while their author is on the team; none once Shipped, Closed or Merged.';
