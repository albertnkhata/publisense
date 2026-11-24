-- Rollback for 0072 (per-category email unsubscribe links).
-- Re-apply v2_email_send from 0071, v2_dm_email_flush from 0059, and
-- v2_weekly_digest_send from 0070 to remove `&kind=` from email links/headers.
begin;
-- See supabase/migrations/0071_v2_new_post_notifications.sql (v2_email_send),
-- supabase/migrations/0059_v2_dm_email.sql (v2_dm_email_flush), and
-- supabase/migrations/0070_v2_weekly_digest.sql (v2_weekly_digest_send).
commit;
notify pgrst, 'reload schema';
