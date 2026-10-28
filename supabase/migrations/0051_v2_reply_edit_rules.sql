-- 0051: reply edit rules (#181, D-015). Approved by Albert on 2026-10-28 (07:14 CAT),
-- as recommended in the issue.
--
-- Before: the author of a reply could change its body at any time, on any post status,
-- so a thread could be rewritten after others answered it or after the post shipped.
--
-- Now a BEFORE UPDATE trigger on reply refuses an API caller's change to the body when:
--   * the post is shipped, closed or merged (hint 'edit_locked_status'), for every
--     reply, official ones included: the thread freezes with the outcome; or
--   * it is a community reply (is_official = false) written more than
--     public.v2_post_edit_window() ago (hint 'edit_window_closed'). The window is the
--     one posts use (0045), so posts and replies share one setting. Official team
--     replies are exempt from the window while the post is open, so a team can correct
--     an answer it gave days ago (the "edited" label keeps that honest).
-- Both raise 42501, so PostgREST answers 403 and nothing is written.
--
-- Unchanged (no RLS, grant or auth change):
--   * Only the author edits a reply: "v2 reply author update" (0017) already limits the
--     row to author_id = auth.uid() and the column grant to body. No team edits of
--     someone else's reply.
--   * Deleting your own reply, at any time (its branch goes with it, 0050).
--   * Hide/unhide and other moderation run through SECURITY DEFINER RPCs (current_user is
--     the owner, not an API role), so the trigger does not apply to them.
--
-- The client mirrors these rules in web/src/api/posts.ts (replyEditLockReason) so the
-- reply's Edit is disabled with the reason before anyone tries.
--
-- Rollback: supabase/rollback/0051_down.sql (drops the trigger and its function).

-- SECURITY INVOKER on purpose: current_user must be the caller's role, as in
-- v2_post_author_edit_guard (0045). The post lookup runs as the caller; a reply the
-- caller may update is on a post they can read (the reply read policy requires it), and
-- if the post can't be read the edit is refused rather than let through.
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

drop trigger if exists v2_reply_author_edit_guard on public.reply;
create trigger v2_reply_author_edit_guard before update on public.reply
  for each row execute function public.v2_reply_author_edit_guard();
