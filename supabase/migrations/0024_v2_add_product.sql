-- Publisense v2: "Add a product". Any signed-in user can add a board; it waits in a
-- review queue until a platform admin approves it.
--
-- WHAT THIS CHANGES
--   board          + status ('pending' | 'live' | 'rejected', existing rows 'live'),
--                  + created_by, reviewed_by, reviewed_at, review_note,
--                  + canonical (the dedupe key, kept from `site` by a trigger) with a
--                    unique index over every board that is not rejected.
--   v2_notification_kind + 'product' (the creator hears about approve / reject).
--   Visibility     a pending or rejected board is visible only to its creator, its team
--                  and platform admins. Posts, votes, replies and status events on it
--                  follow the board (post read policy, can_see_post). Only the creator
--                  may post on their own pending board; nobody posts on a rejected one.
--   RPCs           check_product_link, create_board (security definer, rate-limited),
--                  decide_board (platform admins), and claim_board now refuses boards
--                  the caller cannot see.
--
-- Safe to apply once, as `postgres`, in one transaction (SQL editor or psql -1). Every
-- statement is also written to tolerate a re-run (if not exists / or replace / drop
-- policy if exists), but production tracks it once in supabase_migrations.schema_migrations.
--
-- `alter type ... add value` may run inside a transaction on Postgres 12+; the new value
-- is only used inside function bodies here, which are not executed by this file, so
-- the "unsafe use of new value" rule is never hit.

-- ================================================================ notification kind

alter type public.v2_notification_kind add value if not exists 'product';

-- ================================================================ board columns

alter table public.board add column if not exists status      text not null default 'live';
alter table public.board add column if not exists created_by  uuid;
alter table public.board add column if not exists reviewed_by uuid;
alter table public.board add column if not exists reviewed_at timestamptz;
alter table public.board add column if not exists review_note text;
alter table public.board add column if not exists canonical   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_status_check' and conrelid = 'public.board'::regclass) then
    alter table public.board add constraint board_status_check check (status in ('pending', 'live', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'board_review_note_check' and conrelid = 'public.board'::regclass) then
    alter table public.board add constraint board_review_note_check check (review_note is null or char_length(review_note) <= 500);
  end if;
  -- Named so PostgREST embeds can say which profile they mean (profile!board_created_by_fkey).
  if not exists (select 1 from pg_constraint where conname = 'board_created_by_fkey' and conrelid = 'public.board'::regclass) then
    alter table public.board add constraint board_created_by_fkey
      foreign key (created_by) references public.profile (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'board_reviewed_by_fkey' and conrelid = 'public.board'::regclass) then
    alter table public.board add constraint board_reviewed_by_fkey
      foreign key (reviewed_by) references public.profile (id) on delete set null;
  end if;
end $$;

-- ================================================================ links and the dedupe key

-- The dedupe key of a stored site: lower-case, no "www.", no trailing slash.
--   "cursor.com" -> "cursor.com"; "figma.com/figjam" -> "figma.com/figjam";
--   "github.com/vercel/next.js" -> "github.com/vercel/next.js".
create or replace function public.v2_board_canonical(p_site text)
returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(lower(btrim(coalesce(p_site, ''))), '^www\.', ''), '/+$', ''), '');
$$;

-- First path segments on github.com that are GitHub's own pages, not an owner.
create or replace function public.v2_github_reserved()
returns text[] language sql immutable as $$
  select array['about', 'apps', 'blog', 'codespaces', 'collections', 'contact', 'customer-stories', 'enterprise',
               'events', 'explore', 'features', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications',
               'orgs', 'organizations', 'pricing', 'pulls', 'readme', 'search', 'security', 'settings', 'signup',
               'site', 'sponsors', 'team', 'topics', 'trending'];
$$;

-- What a pasted link is. Mirrored by parseLink() in web/src/lib/link.ts and
-- supabase/functions/link-preview/rules.ts (a web test keeps the two TypeScript
-- copies identical; supabase/tests/v2_rls_test.sql checks this one on the same cases).
--   kind      'github' for github.com/{owner}/{repo}, else 'site'
--   canonical 'github.com/owner/repo' or the bare host (no www., no port)
--   full      host + path, used to recognise boards that live under a path (figma.com/figjam)
-- Returns null for anything that is not an http(s) link to a public-looking host name.
create or replace function public.v2_parse_link(p_link text)
returns jsonb language plpgsql immutable as $$
declare
  s     text := btrim(coalesce(p_link, ''));
  auth  text;
  rest  text;
  host  text;
  segs  text[];
  owner text;
  repo  text;
  v_full text;
begin
  if s = '' or char_length(s) > 2048 or s ~ '\s' then return null; end if;
  if s ~* '^[a-z][a-z0-9+.-]*://' then
    if s !~* '^https?://' then return null; end if;
    s := regexp_replace(s, '^https?://', '', 'i');
  elsif s ~* '^(javascript|data|mailto|file|ftp|about|blob|vbscript|tel):' then
    return null;
  elsif left(s, 2) = '//' then
    s := substr(s, 3);
  end if;

  auth := substring(s from '^[^/?#]*');
  rest := substr(s, char_length(auth) + 1);
  if position('@' in auth) > 0 then return null; end if;          -- no user:pass@host
  host := lower(regexp_replace(auth, ':[0-9]{1,5}$', ''));
  host := regexp_replace(host, '\.$', '');
  host := regexp_replace(host, '^www\.', '');
  if char_length(host) > 253
     or host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     or host ~ '\.[0-9]+$' then                                    -- IP literals and numeric TLDs
    return null;
  end if;

  segs := array(select x from unnest(string_to_array(lower(substring(rest from '^[^?#]*')), '/')) with ordinality as t(x, i)
                 where x <> '' order by i);
  v_full := host || coalesce('/' || nullif(array_to_string(segs, '/'), ''), '');

  if host = 'github.com' and cardinality(segs) >= 2 and not (segs[1] = any (public.v2_github_reserved())) then
    owner := segs[1];
    repo  := regexp_replace(segs[2], '\.git$', '');
    if owner ~ '^[a-z0-9]([a-z0-9-]{0,38})$' and repo ~ '^[a-z0-9._-]{1,100}$' and repo not in ('.', '..') then
      return jsonb_build_object('kind', 'github', 'canonical', 'github.com/' || owner || '/' || repo, 'full', v_full);
    end if;
  end if;
  return jsonb_build_object('kind', 'site', 'canonical', host, 'full', v_full);
end $$;

-- Keep canonical in step with site, whoever writes it (create_board, a board admin
-- editing settings, the seeds).
create or replace function public.v2_board_set_canonical()
returns trigger language plpgsql as $$
begin
  new.canonical := public.v2_board_canonical(new.site);
  return new;
end $$;
drop trigger if exists v2_board_canonical on public.board;
create trigger v2_board_canonical before insert or update of site on public.board
  for each row execute function public.v2_board_set_canonical();

update public.board set canonical = public.v2_board_canonical(site)
 where canonical is distinct from public.v2_board_canonical(site);

-- Refuse to build the unique index over duplicates; say which ones instead.
do $$
declare dup text;
begin
  select string_agg(canonical, ', ') into dup from (
    select canonical from public.board where canonical is not null and status <> 'rejected'
     group by canonical having count(*) > 1) d;
  if dup is not null then
    raise exception '0024: boards share a site, resolve before applying: %', dup;
  end if;
end $$;
create unique index if not exists board_canonical_unique on public.board (canonical)
  where canonical is not null and status <> 'rejected';
create index if not exists board_pending_idx on public.board (created_at) where status = 'pending';
create index if not exists board_created_by_idx on public.board (created_by) where created_by is not null;

-- ================================================================ visibility

-- Who may see a board: everyone once it is live; before that (or after a rejection)
-- only the person who added it, its team, and platform admins.
create or replace function public.v2_board_visible(p_board uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from board b
     where b.id = p_board
       and (b.status = 'live'
         or (uid is not null and b.created_by = uid)
         or public.is_board_team(b.id, uid)
         or public.is_platform_admin(uid)));
$$;

-- Who may post on a board: anyone on a live board; only its creator (or team, or
-- staff) while it is pending; nobody once rejected.
create or replace function public.v2_board_open(p_board uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from board b
     where b.id = p_board
       and (b.status = 'live'
         or (b.status = 'pending'
             and ((uid is not null and b.created_by = uid)
               or public.is_board_team(b.id, uid)
               or public.is_platform_admin(uid)))));
$$;

drop policy if exists "v2 board read" on public.board;
create policy "v2 board read" on public.board for select
  using (status = 'live'
         or (auth.uid() is not null and created_by = auth.uid())
         or public.is_board_team(id)
         or public.is_platform_admin());

-- 0020's rule, now also inside a board the reader can see. Written against the row
-- (not through can_see_post) so insert ... returning still reads the new post back.
drop policy if exists "v2 post read" on public.post;
create policy "v2 post read" on public.post for select
  using (public.v2_board_visible(board_id)
         and ((hidden_at is null and status <> 'merged')
              or (auth.uid() is not null and author_id = auth.uid())
              or public.is_board_team(board_id)
              or public.is_platform_admin()));

drop policy if exists "v2 post insert" on public.post;
create policy "v2 post insert" on public.post for insert to authenticated
  with check (author_id = auth.uid() and public.v2_board_open(board_id));

-- Votes, replies and status events use can_see_post for their parent post.
create or replace function public.can_see_post(p_post uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from post p
     where p.id = p_post
       and public.v2_board_visible(p.board_id, uid)
       and ((p.hidden_at is null and p.status <> 'merged')
         or (uid is not null and p.author_id = uid)
         or public.is_board_team(p.board_id, uid)
         or public.is_platform_admin(uid)));
$$;

grant execute on function public.v2_board_visible(uuid, uuid), public.v2_board_open(uuid, uuid) to anon, authenticated;

-- ================================================================ helpers for the RPCs

-- The board a parsed link already has, if any (rejected boards do not count).
-- github links match their repo exactly; a site matches its host or the longest
-- board that lives under a path of it ("figma.com/figjam/x" -> FigJam).
create or replace function public.v2_link_match(p jsonb)
returns public.board language sql stable security definer set search_path = public as $$
  select b.* from board b
   where b.status <> 'rejected' and b.canonical is not null
     and (b.canonical = p ->> 'canonical'
          or (p ->> 'kind' = 'site'
              and (b.canonical = p ->> 'full'
                   or left(p ->> 'full', char_length(b.canonical) + 1) = b.canonical || '/')))
   order by char_length(b.canonical) desc
   limit 1;
$$;

-- What the caller may learn about a matching board: a live board, or one they can
-- see (their own pending one). Someone else's pending board is only "waiting for review".
create or replace function public.v2_match_json(b public.board, uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when b.id is null then null
    when b.status = 'live' or b.created_by = uid or public.is_platform_admin(uid) then
      jsonb_build_object('slug', b.slug, 'name', b.name, 'status', b.status, 'mine', b.created_by is not distinct from uid and uid is not null)
    else jsonb_build_object('status', b.status, 'mine', false)
  end;
$$;

-- The hub a site joins: the most specific hub whose primary domain covers it.
create or replace function public.v2_link_hub(p jsonb)
returns public.hub language sql stable security definer set search_path = public as $$
  select h.* from hub h
   where p ->> 'kind' = 'site' and h.primary_domain is not null
     and public.v2_domain_covers(h.primary_domain, p ->> 'canonical')
   order by char_length(h.primary_domain) desc
   limit 1;
$$;

-- "figma-slides" from "Figma Slides"; unique across boards; never more than 40 chars.
create or replace function public.v2_board_slug(p_name text, p_canonical text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  base text := btrim(left(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-'), 36), '-');
  s    text;
  n    int  := 1;
begin
  if base = '' then
    base := btrim(left(regexp_replace(split_part(coalesce(p_canonical, ''), '.', 1), '[^a-z0-9]+', '-', 'g'), 36), '-');
  end if;
  if base = '' then base := 'product'; end if;
  s := base;
  while exists (select 1 from board where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;

-- A board colour from a fixed palette, stable for a site.
create or replace function public.v2_board_color(p_canonical text)
returns text language sql immutable as $$
  select (array['#5E6AD2', '#1F9D6B', '#C96442', '#7B61FF', '#0B7A75', '#E5484D',
                '#D97706', '#2563EB', '#DB2777', '#0891B2', '#4D7C0F', '#9333EA'])
         [1 + abs(hashtext(coalesce(p_canonical, ''))) % 12];
$$;

-- ================================================================ RPCs

-- As the user types a link: is it valid, and is the product already here?
create or replace function public.check_product_link(p_link text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p   jsonb := public.v2_parse_link(p_link);
  b   board;
  h   hub;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if p is null then return public.v2_err('invalid_link'); end if;
  b := public.v2_link_match(p);
  h := public.v2_link_hub(p);
  return jsonb_build_object('ok', true, 'kind', p ->> 'kind', 'canonical', p ->> 'canonical',
    'match', public.v2_match_json(b, uid),
    'hub', case when h.id is not null then jsonb_build_object('slug', h.slug, 'name', h.name) end);
end $$;

-- Add a product. It starts pending (visible to its creator and staff only), joins the
-- hub whose primary domain covers its site, and is followed by its creator.
-- Rate limits: 3 pending boards per person, 10 additions per 24 hours.
create or replace function public.create_board(p_link text, p_name text, p_tagline text, p_category text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  p       jsonb := public.v2_parse_link(p_link);
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_tag   text := btrim(regexp_replace(coalesce(p_tagline, ''), '\s+', ' ', 'g'));
  v_cat   text := lower(btrim(coalesce(p_category, '')));
  b       board;
  h       hub;
  v_mail  text;
  pending int;
  recent  int;
  v_claim boolean := false;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if p is null then return public.v2_err('invalid_link'); end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then return public.v2_err('name_length'); end if;
  if char_length(v_tag) > 120 then return public.v2_err('tagline_length'); end if;
  if v_cat not in ('ai', 'code', 'dev', 'design', 'prod', 'browser') then return public.v2_err('invalid_category'); end if;

  -- One addition at a time per person, so the limits below cannot be raced.
  perform pg_advisory_xact_lock(hashtext('v2_create_board'), hashtext(uid::text));

  b := public.v2_link_match(p);
  if b.id is not null then
    return public.v2_err('exists', jsonb_build_object('match', public.v2_match_json(b, uid)));
  end if;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into pending, recent
    from board where created_by = uid;
  if pending >= 3 then return public.v2_err('too_many_pending', jsonb_build_object('limit', 3)); end if;
  if recent >= 10 then return public.v2_err('rate_limited'); end if;

  h := public.v2_link_hub(p);
  begin
    insert into board (slug, name, tagline, site, color, category, hub_id, status, created_by)
    values (public.v2_board_slug(v_name, p ->> 'canonical'), v_name, v_tag, p ->> 'canonical',
            public.v2_board_color(p ->> 'canonical'), v_cat, h.id, 'pending', uid)
    returning * into b;
  exception when unique_violation then
    -- Someone added the same site a moment ago (the canonical index is the backstop).
    return public.v2_err('exists', jsonb_build_object('match', public.v2_match_json(public.v2_link_match(p), uid)));
  end;

  insert into follow (user_id, target, target_id) values (uid, 'board', b.id) on conflict do nothing;

  -- "Is this your product?": their sign-in address, or a domain they already proved,
  -- is on the product's own (non-shared) domain.
  if p ->> 'kind' = 'site' and not public.v2_is_shared_domain(p ->> 'canonical') then
    select lower(email) into v_mail from auth.users where id = uid;
    v_claim := public.v2_domain_covers(split_part(coalesce(v_mail, ''), '@', 2), p ->> 'canonical')
               or public.v2_has_verified(p ->> 'canonical', uid);
  end if;

  return jsonb_build_object('ok', true, 'id', b.id, 'slug', b.slug, 'name', b.name, 'status', b.status,
                            'hub', case when h.id is not null then h.slug end, 'can_claim', v_claim);
end $$;

-- Platform admins approve (optionally fixing name, description and category) or
-- reject (optionally saying why). The creator is notified either way.
create or replace function public.decide_board(p_board uuid, p_approve boolean, p_name text default null,
                                               p_tagline text default null, p_category text default null,
                                               p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  b      board;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_tag  text := case when p_tagline is null then null else btrim(regexp_replace(p_tagline, '\s+', ' ', 'g')) end;
  v_cat  text := lower(btrim(coalesce(p_category, '')));
  v_why  text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into b from board where id = p_board for update;
  if not found then return public.v2_err('not_found'); end if;
  if b.status <> 'pending' then return public.v2_err('decided'); end if;

  if p_approve then
    if v_name = '' then v_name := b.name; end if;
    if char_length(v_name) > 60 then return public.v2_err('name_length'); end if;
    if v_tag is not null and char_length(v_tag) > 120 then return public.v2_err('tagline_length'); end if;
    if v_cat = '' then v_cat := b.category; end if;
    if v_cat not in ('ai', 'code', 'dev', 'design', 'prod', 'browser') then return public.v2_err('invalid_category'); end if;
    update board
       set name = v_name, tagline = coalesce(v_tag, tagline), category = v_cat,
           status = 'live', reviewed_by = uid, reviewed_at = now(), review_note = null
     where id = b.id returning * into b;
  else
    if v_why is not null and char_length(v_why) > 500 then return public.v2_err('reason_length'); end if;
    update board set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = v_why
     where id = b.id returning * into b;
  end if;

  perform public.v2_notify(b.created_by, 'product', uid, 'board', b.id, null,
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
                       'slug', b.slug, 'name', b.name, 'reason', v_why));
  return jsonb_build_object('ok', true, 'status', b.status, 'slug', b.slug);
end $$;

-- 0021's claim_board, unchanged except that it refuses boards the caller cannot claim:
-- someone else's pending board (as if it did not exist) and any rejected board.
create or replace function public.claim_board(p_board uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b   board;
  h   hub;
  d   text;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into b from board where id = p_board for update;
  if not found then return public.v2_err('not_found'); end if;
  if b.status = 'rejected' or (b.status = 'pending' and b.created_by is distinct from uid) then
    return public.v2_err('not_found');
  end if;
  if b.hub_id is not null then select * into h from hub where id = b.hub_id; end if;
  if h.claimed_at is not null then return public.v2_err('hub_claimed'); end if;
  if b.claimed_at is not null then return public.v2_err('claimed'); end if;
  d := public.v2_site_domain(b.site);
  if d is null then return public.v2_err('no_domain'); end if;
  if not public.v2_has_verified(d) then return public.v2_err('not_verified'); end if;

  insert into membership (user_id, scope, scope_id, role) values (uid, 'board', b.id, 'owner')
  on conflict (user_id, scope, scope_id) do update set role = 'owner';
  update board set claimed_at = now() where id = b.id;
  perform public.v2_notify(uid, 'claim', null, 'board', b.id, null,
                           jsonb_build_object('scope', 'board', 'slug', b.slug, 'name', b.name));

  return jsonb_build_object('ok', true,
    'hub', case when h.id is not null and h.claimed_at is null and public.v2_has_verified(h.primary_domain)
                then h.slug end);
end $$;

-- ================================================================ grants

-- Internal helpers: not callable over the API.
do $$
declare f text;
begin
  foreach f in array array[
    'public.v2_link_match(jsonb)',
    'public.v2_match_json(public.board, uuid)',
    'public.v2_link_hub(jsonb)',
    'public.v2_board_slug(text, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Write and lookup RPCs: signed-in callers only (each also checks auth.uid()).
do $$
declare f text;
begin
  foreach f in array array[
    'public.check_product_link(text)',
    'public.create_board(text, text, text, text)',
    'public.decide_board(uuid, boolean, text, text, text, text)',
    'public.claim_board(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- status, created_by, canonical and the review columns are never client-writable:
-- 0017 grants board UPDATE on (name, tagline, site, color, logo_path, category) only,
-- and there is no INSERT grant on board at all, so create_board is the only way in.
