-- 0042: is_platform_admin is no longer part of the public API (last leftover of #139).
--
-- public.is_platform_admin(uuid) was SECURITY DEFINER and executable by anon, and
-- PostgREST exposes every function in `public` as an RPC, so anyone with the anon
-- key could ask "is user X a Publisense admin?" (POST /rest/v1/rpc/is_platform_admin).
-- A plain REVOKE is not enough: the RLS policies that use it run as the visitor
-- (anon or authenticated), so they need EXECUTE.
--
-- Fix: the function moves to a schema PostgREST does not expose (`private`; the
-- exposed schemas are public and graphql_public). The API roles keep USAGE on the
-- schema and EXECUTE on the function so the policies still evaluate, but there is
-- no RPC route to it any more.
--
--   * ALTER FUNCTION ... SET SCHEMA keeps the function's OID, so every policy that
--     used it (board, post, reply, report, block, membership, verified_domain,
--     ownership_dispute, platform_admin, platform_admin_event, email_log) now points
--     at private.is_platform_admin with no policy rewrite.
--   * The body is re-created with a fully qualified table and an empty search_path.
--   * Functions that call it by name (can_see_post, the v2_*_visible/open helpers,
--     the moderation and admin RPCs, ...) are rewritten to call
--     private.is_platform_admin. They are all SECURITY DEFINER; the rewrite is done
--     from pg_get_functiondef so it follows whatever is deployed, and CREATE OR
--     REPLACE keeps their owner and grants.
--   * No client or serverless function calls the RPC (the app reads its own
--     platform_admin row to decide whether to show staff pages), so nothing replaces it.
--
-- CI (supabase/tests/v2_definer_grants_test.sql) now fails if a public
-- is_platform_admin comes back or anything in public still calls one.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

do $move$
begin
  if to_regprocedure('public.is_platform_admin(uuid)') is not null then
    alter function public.is_platform_admin(uuid) set schema private;
  end if;
end
$move$;

create or replace function private.is_platform_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null and exists (select 1 from public.platform_admin where user_id = uid);
$$;

comment on function private.is_platform_admin(uuid) is
  'True when uid is a Publisense platform admin. Used inside RLS policies, so anon/authenticated can execute it; it lives in `private` so PostgREST does not expose it as an RPC (#139).';

revoke all on function private.is_platform_admin(uuid) from public;
grant execute on function private.is_platform_admin(uuid) to anon, authenticated, service_role;

-- Re-point every function in public that calls it by name.
do $repoint$
declare
  fn oid;
  def text;
  n int := 0;
begin
  for fn in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and p.prosrc ~ '(?<!private\.)\mis_platform_admin\s*\('
  loop
    def := pg_get_functiondef(fn);
    def := regexp_replace(def, '(?<!private\.)(\mpublic\.)?\mis_platform_admin(\s*\()', 'private.is_platform_admin\2', 'g');
    execute def;
    n := n + 1;
  end loop;
  raise notice '0042: re-pointed % function(s) at private.is_platform_admin', n;

  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and regexp_replace(p.prosrc, 'private\.is_platform_admin', '', 'g') ~ '\mis_platform_admin\M') then
    raise exception '0042: a function in public still calls is_platform_admin without the private schema';
  end if;
  if to_regprocedure('public.is_platform_admin(uuid)') is not null then
    raise exception '0042: public.is_platform_admin still exists';
  end if;
end
$repoint$;
