-- 0041: who voted for what is no longer public (#140). DECISION FOR ALBERT.
--
-- Until now "v2 vote read" let anyone who can see a post read its vote rows
-- (post_id, user_id, created_at), so with the public anon key anyone could list
-- which users upvoted which posts and when. The app never shows that: it needs
-- "did I vote?" and "what did I upvote?" (both filtered to the viewer), and every
-- count comes from post.vote_count, which a trigger keeps (0017).
--
-- Now a signed-in user reads only their own votes; anon reads none. Counts stay
-- public on post.vote_count. Inserting and removing your own vote is unchanged, and
-- merge_post / account deletion run as definer, so they still see every row.
--
-- Not applied to production: whether voter identity is public is a product call.

drop policy if exists "v2 vote read" on public.vote;
drop policy if exists "v2 vote read own" on public.vote;
create policy "v2 vote read own" on public.vote for select to authenticated
  using (user_id = auth.uid());
