-- Rollback for 0047_v2_private_visibility_helpers.sql. Run inside one transaction:
--   begin; <this file>; delete from supabase_migrations.schema_migrations where version = '0047'; commit;
-- Puts the visibility helpers back in public exactly as before 0047 (same OIDs, so
-- the RLS policies follow them back), re-points their callers at the public names,
-- drops the one-argument wrappers and restores the pre-0047 EXECUTE grants
-- (taken from a database at 0046: PUBLIC, anon, authenticated and service_role on all
-- of them except is_blocked, which was authenticated and service_role only).
-- This re-opens the #179 oracle; use it only if 0047 breaks something.

-- 1. Drop the wrappers (different signatures, but nothing should keep calling them).
drop function if exists public.can_see_post(uuid);
drop function if exists public.v2_board_visible(uuid);
drop function if exists public.v2_board_open(uuid);
drop function if exists public.v2_hub_visible(uuid);
drop function if exists public.is_board_team(uuid);
drop function if exists public.is_board_admin(uuid);
drop function if exists public.is_scope_team(public.v2_scope, uuid);
drop function if exists public.is_scope_admin(public.v2_scope, uuid);
drop function if exists public.v2_scope_role(public.v2_scope, uuid);
drop function if exists public.is_blocked(uuid);
drop function if exists public.post_board(uuid);

-- 2. Move the helpers back (keeps OIDs, so policies follow).
do $move$
declare
  sig text;
begin
  foreach sig in array array[
    'private.can_see_post(uuid,uuid)',
    'private.v2_board_visible(uuid,uuid)',
    'private.v2_board_open(uuid,uuid)',
    'private.v2_hub_visible(uuid,uuid)',
    'private.is_board_team(uuid,uuid)',
    'private.is_board_admin(uuid,uuid)',
    'private.is_scope_team(public.v2_scope,uuid,uuid)',
    'private.is_scope_admin(public.v2_scope,uuid,uuid)',
    'private.v2_scope_role(public.v2_scope,uuid,uuid)',
    'private.is_blocked(uuid,uuid)',
    'private.post_board(uuid)']
  loop
    if to_regprocedure(sig) is null then
      raise exception '0047 rollback: % not found; is 0047 applied?', sig;
    end if;
    execute format('alter function %s set schema public', sig);
  end loop;
end
$move$;

-- 3. Re-point callers at public.<helper> (works for search_path=public and for the
--    empty search_path of private.can_read_post).
do $repoint$
declare
  pat constant text := '\mprivate\.(can_see_post|v2_board_visible|v2_board_open|v2_hub_visible|is_board_team|is_board_admin|is_scope_team|is_scope_admin|v2_scope_role|is_blocked|post_board)(\s*\()';
  fn  oid;
  def text;
  n   int := 0;
begin
  for fn in
    select p.oid from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and p.prokind = 'f'
       and p.prosrc ~ pat
  loop
    def := pg_get_functiondef(fn);
    def := regexp_replace(def, pat, 'public.\1\2', 'g');
    execute def;
    n := n + 1;
  end loop;
  raise notice '0047 rollback: re-pointed % function(s) at the public helpers', n;
  if exists (select 1 from pg_proc p
              where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosrc ~ pat) then
    raise exception '0047 rollback: a function still calls a private visibility helper';
  end if;
end
$repoint$;

-- 4. Pre-0047 grants.
revoke all on function public.can_see_post(uuid, uuid), public.v2_board_visible(uuid, uuid),
  public.v2_board_open(uuid, uuid), public.v2_hub_visible(uuid, uuid),
  public.is_board_team(uuid, uuid), public.is_board_admin(uuid, uuid),
  public.is_scope_team(public.v2_scope, uuid, uuid), public.is_scope_admin(public.v2_scope, uuid, uuid),
  public.v2_scope_role(public.v2_scope, uuid, uuid), public.is_blocked(uuid, uuid), public.post_board(uuid)
  from public, anon, authenticated;
grant execute on function public.can_see_post(uuid, uuid), public.v2_board_visible(uuid, uuid),
  public.v2_board_open(uuid, uuid), public.v2_hub_visible(uuid, uuid),
  public.is_board_team(uuid, uuid), public.is_board_admin(uuid, uuid),
  public.is_scope_team(public.v2_scope, uuid, uuid), public.is_scope_admin(public.v2_scope, uuid, uuid),
  public.v2_scope_role(public.v2_scope, uuid, uuid), public.post_board(uuid)
  to public, anon, authenticated, service_role;
grant execute on function public.is_blocked(uuid, uuid) to authenticated, service_role;
