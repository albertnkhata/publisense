-- Rollback for 0061 (post drafts). Drops the table, its trigger function and policies.
-- Saved drafts are lost; their uploaded images stay in the post-images bucket.
begin;
drop table if exists public.post_draft;
drop function if exists public.v2_post_draft_before_write();
notify pgrst, 'reload schema';
commit;
