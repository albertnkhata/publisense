-- 0047: the visibility helpers stop being an oracle (#179). Same approach as 0042.
-- Approved by Albert on 2026-10-27 (11:53 CAT).
--
-- The problem. These SECURITY DEFINER helpers lived in `public`, so PostgREST exposed
-- them as RPCs, and each took the user to ask about as an argument (`uid`, defaulting
-- to auth.uid()):
--   can_see_post, v2_board_visible, v2_board_open, v2_hub_visible, is_board_team,
--   is_board_admin, is_scope_team, is_scope_admin, v2_scope_role, is_blocked
-- A signed-out visitor holding two UUIDs could ask "can user X see board Y?" (true
-- for a pending board's creator) or "is X on team Z?". post_board(post) also returned
-- the board id of any post, visible or not. Metadata only, but a yes/no oracle.
--
-- The fix.
--   1. Each helper moves to schema `private` (PostgREST does not expose it; the exposed
--      schemas are public and graphql_public) with ALTER FUNCTION ... SET SCHEMA. That
--      keeps its OID, body, owner and grants, so every RLS policy that used it (board,
--      post, reply, vote, hub, hub_domain, hub_name, block, join_request, membership,
--      storage.objects, ...) now points at private.<helper> with no policy rewrite and
--      no change in meaning. The `uid` argument stays on the private version, because
--      definer RPCs and triggers legitimately ask about a specific user.
--   2. Every function in public or private that calls a helper by name is rewritten to
--      call private.<helper> (from pg_get_functiondef, so it follows what is deployed;
--      CREATE OR REPLACE keeps owner and grants). That includes the helpers calling each
--      other, private.can_read_post (0043) and the insert triggers on post/reply/vote.
--   3. public keeps thin wrappers with the same names minus `uid`, which always ask
--      about auth.uid(). The client RPCs (is_board_team, v2_scope_role) and any policy
--      or migration written by name keep working, and nobody can pass someone else's id.
--      An extra `uid` in an RPC call now matches no function.
--   4. public.post_board answers only for a post the caller can read
--      (private.can_read_post, the post read rule); the policy keeps the private copy.
--   5. EXECUTE on the private copies: RLS policies and the invoker-rights insert
--      triggers run as the caller, so anon/authenticated keep EXECUTE where those use a
--      helper. private.v2_scope_role is used only by definer RPCs, so the API roles lose
--      it there. private.is_blocked stays signed-in only, as before.
--
-- What does NOT change: who can read or write anything. Feeds, boards, posts, merged
-- reads (0043), status notes (0044), the edit window (0045) and decisions (0046) use the
-- same rules through the same function OIDs.
--
-- CI: supabase/tests/v2_definer_grants_test.sql fails if a public definer function the
-- API roles can execute takes a `uid` argument, if a public two-argument helper comes
-- back, or if anything calls a helper outside private; supabase/tests/v2_helper_oracle_test.sql
-- proves the oracle is closed for anon and for another signed-in member.
-- Rollback: supabase/rollback/0047_down.sql.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- 1. Move the helpers (keeps OIDs, so policies follow).
do $move$
declare
  sig text;
begin
  foreach sig in array array[
    'public.can_see_post(uuid,uuid)',
    'public.v2_board_visible(uuid,uuid)',
    'public.v2_board_open(uuid,uuid)',
    'public.v2_hub_visible(uuid,uuid)',
    'public.is_board_team(uuid,uuid)',
    'public.is_board_admin(uuid,uuid)',
    'public.is_scope_team(public.v2_scope,uuid,uuid)',
    'public.is_scope_admin(public.v2_scope,uuid,uuid)',
    'public.v2_scope_role(public.v2_scope,uuid,uuid)',
    'public.is_blocked(uuid,uuid)',
    'public.post_board(uuid)']
  loop
    if to_regprocedure(sig) is null then
      raise exception '0047: % not found; is this database at 0046?', sig;
    end if;
    execute format('alter function %s set schema private', sig);
  end loop;
end
$move$;

-- 2. Re-point every caller (public and private) at private.<helper>.
do $repoint$
declare
  names constant text := 'can_see_post|v2_board_visible|v2_board_open|v2_hub_visible|is_board_team|is_board_admin|is_scope_team|is_scope_admin|v2_scope_role|is_blocked|post_board';
  pat   text := '(?<!private\.)(\mpublic\.)?\m(' || names || ')(\s*\()';
  fn    oid;
  def   text;
  n     int := 0;
begin
  for fn in
    select p.oid from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and p.prokind = 'f'
       and p.prosrc ~ pat
  loop
    def := pg_get_functiondef(fn);
    def := regexp_replace(def, pat, 'private.\2\3', 'g');
    execute def;
    n := n + 1;
  end loop;
  raise notice '0047: re-pointed % function(s) at the private helpers', n;

  if exists (select 1 from pg_proc p
              where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                and p.prosrc ~ pat) then
    raise exception '0047: a function still calls a visibility helper outside private';
  end if;
end
$repoint$;

-- 5. Grants on the private copies (ACLs moved with the functions; set them explicitly).
revoke all on function private.can_see_post(uuid, uuid), private.v2_board_visible(uuid, uuid),
  private.v2_board_open(uuid, uuid), private.v2_hub_visible(uuid, uuid),
  private.is_board_team(uuid, uuid), private.is_board_admin(uuid, uuid),
  private.is_scope_team(public.v2_scope, uuid, uuid), private.is_scope_admin(public.v2_scope, uuid, uuid),
  private.v2_scope_role(public.v2_scope, uuid, uuid), private.is_blocked(uuid, uuid),
  private.post_board(uuid)
  from public, anon, authenticated;
-- Used inside RLS policies (which run as the caller, signed in or not).
grant execute on function private.can_see_post(uuid, uuid), private.v2_board_visible(uuid, uuid),
  private.v2_board_open(uuid, uuid), private.v2_hub_visible(uuid, uuid),
  private.is_board_team(uuid, uuid), private.is_board_admin(uuid, uuid),
  private.is_scope_team(public.v2_scope, uuid, uuid), private.is_scope_admin(public.v2_scope, uuid, uuid),
  private.post_board(uuid)
  to anon, authenticated;
-- Used by the post/reply/vote insert triggers (invoker rights, signed in only).
grant execute on function private.is_blocked(uuid, uuid) to authenticated;
-- private.v2_scope_role: definer RPCs only, no API-role grant.
grant execute on function private.can_see_post(uuid, uuid), private.v2_board_visible(uuid, uuid),
  private.v2_board_open(uuid, uuid), private.v2_hub_visible(uuid, uuid),
  private.is_board_team(uuid, uuid), private.is_board_admin(uuid, uuid),
  private.is_scope_team(public.v2_scope, uuid, uuid), private.is_scope_admin(public.v2_scope, uuid, uuid),
  private.v2_scope_role(public.v2_scope, uuid, uuid), private.is_blocked(uuid, uuid),
  private.post_board(uuid)
  to service_role;

-- 3./4. Public wrappers: same names, no uid, always about the caller.
create function public.can_see_post(p_post uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.can_see_post(p_post, auth.uid()) $$;
create function public.v2_board_visible(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.v2_board_visible(p_board, auth.uid()) $$;
create function public.v2_board_open(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.v2_board_open(p_board, auth.uid()) $$;
create function public.v2_hub_visible(p_hub uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.v2_hub_visible(p_hub, auth.uid()) $$;
create function public.is_board_team(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.is_board_team(p_board, auth.uid()) $$;
create function public.is_board_admin(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.is_board_admin(p_board, auth.uid()) $$;
create function public.is_scope_team(p_scope public.v2_scope, p_id uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.is_scope_team(p_scope, p_id, auth.uid()) $$;
create function public.is_scope_admin(p_scope public.v2_scope, p_id uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.is_scope_admin(p_scope, p_id, auth.uid()) $$;
create function public.v2_scope_role(p_scope public.v2_scope, p_id uuid) returns public.v2_role
  language sql stable security definer set search_path = ''
  as $$ select private.v2_scope_role(p_scope, p_id, auth.uid()) $$;
create function public.is_blocked(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.is_blocked(p_board, auth.uid()) $$;
create function public.post_board(p_post uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select p.board_id from public.post p where p.id = p_post and private.can_read_post(p.id, auth.uid()) $$;

revoke all on function public.can_see_post(uuid), public.v2_board_visible(uuid), public.v2_board_open(uuid),
  public.v2_hub_visible(uuid), public.is_board_team(uuid), public.is_board_admin(uuid),
  public.is_scope_team(public.v2_scope, uuid), public.is_scope_admin(public.v2_scope, uuid),
  public.v2_scope_role(public.v2_scope, uuid), public.is_blocked(uuid), public.post_board(uuid)
  from public, anon, authenticated;
grant execute on function public.can_see_post(uuid), public.v2_board_visible(uuid), public.v2_board_open(uuid),
  public.v2_hub_visible(uuid), public.is_board_team(uuid), public.is_board_admin(uuid),
  public.is_scope_team(public.v2_scope, uuid), public.is_scope_admin(public.v2_scope, uuid),
  public.v2_scope_role(public.v2_scope, uuid), public.post_board(uuid)
  to anon, authenticated, service_role;
grant execute on function public.is_blocked(uuid) to authenticated, service_role;

comment on function public.can_see_post(uuid) is 'Can the caller (auth.uid()) see this post? Wrapper over private.can_see_post (#179).';
comment on function public.v2_board_visible(uuid) is 'Can the caller see this board? Wrapper over private.v2_board_visible (#179).';
comment on function public.v2_board_open(uuid) is 'Can the caller post on this board? Wrapper over private.v2_board_open (#179).';
comment on function public.v2_hub_visible(uuid) is 'Can the caller see this company? Wrapper over private.v2_hub_visible (#179).';
comment on function public.is_board_team(uuid) is 'Is the caller on this board''s team? Client RPC; wrapper over private.is_board_team (#179).';
comment on function public.is_board_admin(uuid) is 'Is the caller an admin of this board? Wrapper over private.is_board_admin (#179).';
comment on function public.is_scope_team(public.v2_scope, uuid) is 'Is the caller on this board/company team? Wrapper (#179).';
comment on function public.is_scope_admin(public.v2_scope, uuid) is 'Is the caller an admin of this board/company? Wrapper (#179).';
comment on function public.v2_scope_role(public.v2_scope, uuid) is 'The caller''s role on a board/company. Client RPC; wrapper over private.v2_scope_role (#179).';
comment on function public.is_blocked(uuid) is 'Is the caller blocked on this board? Wrapper over private.is_blocked (#179).';
comment on function public.post_board(uuid) is 'Board of a post the caller can read; null otherwise (#179). Policies use private.post_board.';

-- Sanity: no public definer function the API roles can execute takes a uid argument.
do $check$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and 'uid' = any(coalesce(p.proargnames, '{}'))
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if bad is not null then raise exception '0047: public definer functions still take a caller-chosen uid: %', bad; end if;
end
$check$;
