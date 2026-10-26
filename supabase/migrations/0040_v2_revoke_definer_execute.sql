-- 0040: SECURITY DEFINER helpers no longer callable by the API roles through PUBLIC (#139).
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and anon/authenticated
-- inherit it. Earlier migrations wrote `revoke ... from anon, authenticated`
-- without `from public`, which has no effect, so helpers meant to be internal were
-- callable by anyone over PostgREST RPC (QA 2026-10-26: rename_hub,
-- v2_hub_sync_name, v2_hub_slug, board_role, hub_role, ...). Nothing exploitable was
-- found (each guards itself), but every new definer function added the same way
-- would be exposed too. The CI gate in supabase/tests/v2_definer_grants_test.sql
-- now fails on any definer function anon can execute that is not on its allow-list.
--
-- Three groups:
--   1. Internal only (no client calls them, no policy uses them): revoked from
--      PUBLIC, anon and authenticated. Includes the definer trigger functions
--      (Postgres does not check EXECUTE when a trigger fires, so the triggers keep
--      working).
--   2. Signed-in only: client RPCs for team/admin actions, plus is_blocked (called
--      by the invoker BEFORE INSERT triggers on post/reply/vote, which run as the
--      signed-in user). Revoked from PUBLIC and anon; authenticated keeps EXECUTE.
--   3. Unchanged (stay callable by anon): helpers used inside RLS policies, which
--      run as the caller (can_see_post, is_board_admin, is_board_team,
--      is_platform_admin, is_scope_admin, is_scope_team, post_board, v2_board_open,
--      v2_board_visible, v2_hub_visible), and the public RPCs resolve_hub_slug,
--      unsubscribe and v2_scope_role.
--
-- Written so it can be applied to a database that drifted: a function that does
-- not exist is skipped with a NOTICE.

do $grants$
declare
  f text;
  internal text[] := array[
    'public.board_role(uuid,uuid)',
    'public.hub_role(uuid,uuid)',
    'public.v2_has_verified(text,uuid)',
    'public.v2_is_shared_domain(text)',
    'public.v2_scope_claimed(public.v2_scope,uuid)',
    'public.v2_scope_domain(public.v2_scope,uuid)',
    'public.v2_hub_slug(text,uuid)',
    'public.v2_hub_sync_name(uuid)',
    -- trigger functions
    'public.v2_handle_new_user()',
    'public.v2_guard_verified_domain()',
    'public.v2_guard_last_owner()',
    'public.v2_vote_after()',
    'public.v2_post_after()',
    'public.v2_reply_after()',
    'public.v2_follow_after()',
    'public.v2_hub_name_guard()',
    'public.v2_hub_name_changed()',
    'public.v2_hub_named()'
  ];
  signed_in text[] := array[
    'public.rename_hub(uuid,text,text,text,text)',
    'public.set_post_status(uuid,public.v2_post_status,text)',
    'public.set_post_hidden(uuid,boolean)',
    'public.set_reply_hidden(uuid,boolean)',
    'public.is_blocked(uuid,uuid)'
  ];
begin
  foreach f in array internal loop
    if to_regprocedure(f) is null then raise notice '0040: % not found, skipped', f; continue; end if;
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array signed_in loop
    if to_regprocedure(f) is null then raise notice '0040: % not found, skipped', f; continue; end if;
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;
