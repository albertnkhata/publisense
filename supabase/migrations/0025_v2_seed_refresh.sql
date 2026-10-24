-- 0025 v2 seed refresh (2026-10-24)
--
-- Two seeded boards no longer match the products they stand for:
--   * Windsurf is now Devin Desktop. windsurf.com redirects to devin.ai/desktop,
--     where Cognition calls it "Devin Desktop". The board keeps its id, colour and
--     category; name, tagline, site and slug follow the product. canonical follows
--     site through the v2_board_canonical trigger (0024).
--   * Arc has been retired (arc.net is a farewell page). Its board is removed. It is
--     only deleted while nothing hangs off it (no posts, follows, teams, requests,
--     disputes, blocks, reports or notifications); otherwise it is left alone.
--
-- Idempotent: on a database already refreshed both statements change nothing.
-- logo_path is not touched here: logos live in Storage (board-logos bucket) and
-- are uploaded per environment.

update public.board
   set slug    = 'devin-desktop',
       name    = 'Devin Desktop',
       tagline = 'One command center for every agent and model',
       site    = 'devin.ai/desktop'
 where (slug = 'windsurf' or site = 'windsurf.com')
   and not exists (select 1 from public.board d where d.slug = 'devin-desktop');

delete from public.board b
 where b.slug = 'arc'
   and b.site = 'arc.net'
   and not exists (select 1 from public.post p where p.board_id = b.id)
   and not exists (select 1 from public.follow f where f.target_id = b.id)
   and not exists (select 1 from public.membership m where m.scope_id = b.id)
   and not exists (select 1 from public.join_request j where j.scope_id = b.id)
   and not exists (select 1 from public.ownership_dispute o where o.scope_id = b.id)
   and not exists (select 1 from public.block k where k.scope_id = b.id)
   and not exists (select 1 from public.report r where r.target_id = b.id)
   and not exists (select 1 from public.notification n where n.target_id = b.id);
