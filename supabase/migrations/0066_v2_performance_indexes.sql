-- 0066_v2_performance_indexes.sql
--
-- Partial indexes covering the hot read paths:
--   1. Board / hub / related / roadmap "Top" sort:
--      WHERE board_id = ... AND hidden_at IS NULL AND status <> 'merged'
--      ORDER BY vote_count DESC, created_at DESC, id DESC
--   2. Home feed "Top" sort and Explore "Most wanted":
--      WHERE hidden_at IS NULL AND status <> 'merged'
--      ORDER BY vote_count DESC, created_at DESC, id DESC
--   3. Home feed "New" sort and Explore 7-day "Trending" window:
--      WHERE hidden_at IS NULL AND status <> 'merged'
--      ORDER BY created_at DESC, id DESC
--   4. Feed card official-reply decoration (decorate() in web/src/api/posts.ts):
--      WHERE is_official = true AND parent_id IS NULL AND hidden_at IS NULL
--        AND post_id IN (...)
--      ORDER BY created_at DESC
--   5. Unread notification badge count and mark-all-read:
--      WHERE recipient = ... AND read_at IS NULL

create index if not exists post_board_top_idx
  on public.post (board_id, vote_count desc, created_at desc, id desc)
  where hidden_at is null and status <> 'merged';

create index if not exists post_live_top_idx
  on public.post (vote_count desc, created_at desc, id desc)
  where hidden_at is null and status <> 'merged';

create index if not exists post_live_created_idx
  on public.post (created_at desc, id desc)
  where hidden_at is null and status <> 'merged';

create index if not exists reply_official_top_idx
  on public.reply (post_id, created_at desc)
  where is_official and parent_id is null and hidden_at is null;

create index if not exists notification_unread_idx
  on public.notification (recipient)
  where read_at is null;
