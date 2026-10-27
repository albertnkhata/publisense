-- 0043: a merged post's permalink is readable by everyone, so an old shared link
-- says "Merged into …" instead of "Post not found" (QA 2026-10-27, PR #172).
-- Approved by Albert on 2026-10-27 (read-policy change).
--
-- Until now the post read policy (0020, 0024) and can_see_post hid a merged post from
-- everyone but its author, its board's team and platform admins. Votes and followers
-- had moved to the surviving post, but anyone else holding the link saw a dead page.
--
-- What changes (READS only):
--   * "v2 post read": a merged post is readable while it is not hidden. A hidden post
--     stays hidden whether or not it is merged (author, team and admins as before).
--   * "v2 reply read" and "v2 status_event read" follow the same rule, so the merged
--     page shows its timeline and its replies (read-only), through a new helper
--     private.can_read_post. It lives in `private` (not exposed by PostgREST, like
--     is_platform_admin since 0042), so it adds nothing to the public RPC surface.
--
-- What does NOT change:
--   * can_see_post keeps its meaning (live, or author/team/admin) and still guards the
--     WRITE policies: nobody new can vote on or reply to a merged post (the 0017 vote
--     trigger refuses votes on merged posts anyway).
--   * Feeds, search, the sitemap, Explore and every count already filter
--     status <> 'merged' themselves (web/src/api, web/api/sitemap.ts); board.post_count
--     is kept by trigger. The one client list that relied on RLS alone (Trending) now
--     filters merged posts itself in the same PR.
--
-- Rollback: re-create the three policies exactly as below but with
--   (hidden_at is null and status <> 'merged') in the post policy and
--   public.can_see_post(post_id) in the reply and status_event policies,
-- then `drop function private.can_read_post(uuid, uuid)`.

create schema if not exists private;

-- Who may READ a post: anyone while it is not hidden (live or merged away), on a board
-- the reader can see; its author, its team and platform admins also while hidden.
create or replace function private.can_read_post(p_post uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.post p
     where p.id = p_post
       and public.v2_board_visible(p.board_id, uid)
       and (p.hidden_at is null
         or (uid is not null and p.author_id = uid)
         or public.is_board_team(p.board_id, uid)
         or private.is_platform_admin(uid)));
$$;

comment on function private.can_read_post(uuid, uuid) is
  'Read visibility of a post for RLS (0043): not hidden (live or merged), or author/team/admin. Writes still use public.can_see_post.';

revoke all on function private.can_read_post(uuid, uuid) from public;
grant execute on function private.can_read_post(uuid, uuid) to anon, authenticated, service_role;

-- Written against the row (not through a lookup) so insert ... returning still reads
-- the new post back (0020).
drop policy if exists "v2 post read" on public.post;
create policy "v2 post read" on public.post for select
  using (public.v2_board_visible(board_id)
         and (hidden_at is null
              or (auth.uid() is not null and author_id = auth.uid())
              or public.is_board_team(board_id)
              or private.is_platform_admin()));

drop policy if exists "v2 reply read" on public.reply;
create policy "v2 reply read" on public.reply for select
  using (private.can_read_post(post_id)
         and (hidden_at is null
              or author_id = auth.uid()
              or public.is_board_team(public.post_board(post_id))
              or private.is_platform_admin()));

drop policy if exists "v2 status_event read" on public.status_event;
create policy "v2 status_event read" on public.status_event for select
  using (private.can_read_post(post_id));
