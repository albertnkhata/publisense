-- Rollback for 0068_v2_public_follow_lists.sql
drop function if exists public.profile_following_scopes(uuid, int);
drop function if exists public.profile_following_users(uuid, int);
drop function if exists public.profile_followers(uuid, int);
drop function if exists public.profile_following_count(uuid);

notify pgrst, 'reload schema';
