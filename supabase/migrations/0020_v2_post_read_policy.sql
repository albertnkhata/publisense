-- Publisense v2, step 6: let the composer read back the post it just wrote.
--
-- ADDITIVE AND NARROW. It replaces one policy, "v2 post read", with the same rule
-- written against the row itself instead of through can_see_post(id).
--
-- Why: with INSERT ... RETURNING (PostgREST `return=representation`, i.e. supabase-js
-- `insert().select()`), Postgres checks the SELECT policy against the NEW row. The old
-- policy called can_see_post(id), a STABLE function that looks the post up by id in a
-- snapshot taken before the insert, so it never found the row and the insert was
-- refused with "new row violates row-level security policy". Evaluating the same
-- conditions on the row's own columns sees the new row and changes nothing else:
--
--   live (not hidden, not merged)  OR  you wrote it  OR  you are on its board's team
--   OR  you are a platform admin
--
-- can_see_post stays: vote, reply and status_event policies still use it for their
-- parent post, which already exists when they are written.

drop policy if exists "v2 post read" on public.post;
create policy "v2 post read" on public.post for select
  using ((hidden_at is null and status <> 'merged')
         or (auth.uid() is not null and author_id = auth.uid())
         or public.is_board_team(board_id)
         or public.is_platform_admin());

-- RLS evaluates these as the calling role, and anon reads posts too. (Functions are
-- executable by PUBLIC by default; this makes the dependency explicit.)
grant execute on function public.is_board_team(uuid, uuid), public.is_platform_admin(uuid) to anon, authenticated;
