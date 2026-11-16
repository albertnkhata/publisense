-- 0067_v2_popular_by_status_index.sql
--
-- Partial index covering the Popular posts by team status read path
-- (fetchPopularByStatus in web/src/api/posts.ts):
--   WHERE status = ... AND hidden_at IS NULL AND status <> 'merged'
--   ORDER BY vote_count DESC, created_at DESC, id DESC

create index if not exists post_live_status_top_idx
  on public.post (status, vote_count desc, created_at desc, id desc)
  where hidden_at is null and status <> 'merged';
