-- CI gate (#139): which SECURITY DEFINER functions in public the API roles can execute.
--
-- A definer function runs with its owner's rights, so one that anon can call is
-- part of the public API whether we meant it or not. Postgres grants EXECUTE to
-- PUBLIC by default, so a new function is exposed unless its migration says
-- `revoke execute on function ... from public, anon` (from public too!).
--
-- If this fails on a function you just added:
--   * a client RPC or a policy helper that anon really needs: add it to anon_ok below;
--   * anything else: revoke it in your migration.

\set ON_ERROR_STOP 1
begin;

create temp table anon_ok (sig text primary key);
insert into anon_ok values
  -- used inside RLS policies, which run as the caller
  ('can_see_post(uuid,uuid)'),
  ('is_board_admin(uuid,uuid)'),
  ('is_board_team(uuid,uuid)'),          -- also a client RPC
  ('is_platform_admin(uuid)'),
  ('is_scope_admin(v2_scope,uuid,uuid)'),
  ('is_scope_team(v2_scope,uuid,uuid)'),
  ('post_board(uuid)'),
  ('v2_board_open(uuid,uuid)'),
  ('v2_board_visible(uuid,uuid)'),
  ('v2_hub_visible(uuid,uuid)'),
  -- public client RPCs
  ('resolve_hub_slug(text)'),
  ('unsubscribe(uuid,v2_notification_kind)'),
  ('v2_scope_role(v2_scope,uuid,uuid)');

do $gate$
declare bad text;
begin
  select string_agg(sig, ', ' order by sig) into bad
    from (select regexp_replace(p.oid::regprocedure::text, '^public\.', '') as sig
            from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosecdef
             and has_function_privilege('anon', p.oid, 'execute')) s
   where sig not in (select sig from anon_ok);
  if bad is not null then
    raise exception 'FAIL security definer functions executable by anon but not on the allow-list: %', bad;
  end if;
  raise notice 'ok   every definer function anon can execute is on the allow-list';

  -- Internal helpers stay closed to signed-in users too.
  select string_agg(f, ', ') into bad
    from unnest(array['public.board_role(uuid,uuid)', 'public.hub_role(uuid,uuid)', 'public.v2_hub_sync_name(uuid)',
                      'public.v2_hub_slug(text,uuid)', 'public.v2_has_verified(text,uuid)',
                      'public.v2_scope_domain(public.v2_scope,uuid)']) f
   where to_regprocedure(f) is not null and has_function_privilege('authenticated', to_regprocedure(f), 'execute');
  if bad is not null then raise exception 'FAIL internal helpers executable by authenticated: %', bad; end if;
  raise notice 'ok   internal helpers are not executable by signed-in users';

  -- Signed-in actions still work for signed-in users.
  select string_agg(f, ', ') into bad
    from unnest(array['public.rename_hub(uuid,text,text,text,text)', 'public.set_post_status(uuid,public.v2_post_status,text)',
                      'public.set_post_hidden(uuid,boolean)', 'public.set_reply_hidden(uuid,boolean)',
                      'public.is_blocked(uuid,uuid)']) f
   where to_regprocedure(f) is not null and not has_function_privilege('authenticated', to_regprocedure(f), 'execute');
  if bad is not null then raise exception 'FAIL signed-in RPCs no longer executable by authenticated: %', bad; end if;
  raise notice 'ok   signed-in RPCs are still executable by authenticated';
end
$gate$;

rollback;
