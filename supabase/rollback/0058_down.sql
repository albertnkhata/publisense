-- Rollback for 0058 (direct messages). Drops the DM tables, RPCs, helpers, the
-- person-to-person block table and profile.dm_policy. Every message and block is lost.
begin;
drop function if exists public.dm_conversations();
drop function if exists public.dm_mute(uuid, boolean);
drop function if exists public.dm_mark_read(uuid);
drop function if exists public.dm_delete(uuid);
drop function if exists public.dm_accept(uuid);
drop function if exists public.dm_start(uuid, text);
drop function if exists public.dm_send(uuid, text);
drop function if exists public.blocked_users();
drop function if exists public.unblock_user(uuid);
drop function if exists public.block_user(uuid);
drop function if exists public.set_dm_policy(public.v2_dm_policy);
drop function if exists private.dm_message_limit(uuid);
drop table if exists public.dm_message;
drop table if exists public.dm_member;
drop table if exists public.dm_conversation;
drop table if exists public.user_block;
drop function if exists private.dm_follows(uuid, uuid);
drop function if exists private.dm_blocked_between(uuid, uuid);
drop function if exists private.dm_cleared_at(uuid, uuid);
drop function if exists private.dm_is_member(uuid, uuid);
alter table public.profile drop column if exists dm_policy;
drop type if exists public.v2_dm_state;
drop type if exists public.v2_dm_policy;
commit;
notify pgrst, 'reload schema';
