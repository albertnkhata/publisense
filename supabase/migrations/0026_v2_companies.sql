-- Publisense v2: companies. A hub is a company; a product (board) can say which
-- company makes it, and a company can own several domains.
--
-- WHAT THIS CHANGES
--   hub_domain     new table: the domains a hub owns. The domain is the primary key, so
--                  one domain belongs to at most one hub. Shared hosts (public.shared_domain,
--                  e.g. substack.com, vercel.app) and github.com (everyone's repos live
--                  there) can never be hub domains; a trigger refuses them.
--   hub            + status ('pending' | 'live' | 'rejected', existing rows 'live'),
--                  + created_by, reviewed_by, reviewed_at.
--                  primary_domain stays, now derived: it is always one of the hub's
--                  domains (the oldest, unless it is still present), kept by triggers in
--                  both directions, so every 0019-0025 reader and seed keeps working.
--   Visibility     a pending or rejected hub (and its domains) is visible only to its
--                  creator, its team and platform admins, like boards (0024).
--   Matching       a site joins the live hub whose domain covers it most specifically,
--                  across all of the hub's domains (v2_link_hub).
--   Claiming       claim_hub, claim_board's "Claim all of {hub}" offer, join requests,
--                  adding teammates and disputes accept proof of ANY of the hub's domains
--                  (or a parent of one: someone at google.com may join a hub that owns
--                  gemini.google.com once they proved google.com).
--   RPCs           create_board gains p_hub_id (an existing live hub) and p_company_name
--                  (a new company, created 'pending' with the product's domain as its
--                  first domain). decide_board gains p_hub_mode / p_hub_id / p_hub_name:
--                  approving a board approves its pending hub; an admin may rename it,
--                  move the board to another hub, or drop the company. add_hub_domain /
--                  remove_hub_domain for platform admins. Rate limits are unchanged.
--
-- Safe to apply once, as `postgres`, in one transaction (SQL editor or psql -1). Every
-- statement also tolerates a re-run, but production records it once in
-- supabase_migrations.schema_migrations.

-- ================================================================ hub columns

alter table public.hub add column if not exists status      text not null default 'live';
alter table public.hub add column if not exists created_by  uuid;
alter table public.hub add column if not exists reviewed_by uuid;
alter table public.hub add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hub_status_check' and conrelid = 'public.hub'::regclass) then
    alter table public.hub add constraint hub_status_check check (status in ('pending', 'live', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hub_created_by_fkey' and conrelid = 'public.hub'::regclass) then
    alter table public.hub add constraint hub_created_by_fkey
      foreign key (created_by) references public.profile (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hub_reviewed_by_fkey' and conrelid = 'public.hub'::regclass) then
    alter table public.hub add constraint hub_reviewed_by_fkey
      foreign key (reviewed_by) references public.profile (id) on delete set null;
  end if;
end $$;
create index if not exists hub_pending_idx on public.hub (created_at) where status = 'pending';
create index if not exists hub_name_idx on public.hub (lower(name));

-- ================================================================ hub_domain

-- Why a table and not hub.domains text[]: "one domain belongs to at most one hub" is a
-- primary key here, enforced by the database under concurrency. Across rows of a text[]
-- column it would need an exclusion constraint that core Postgres cannot build for text
-- arrays, or a trigger that races. A table also gets its own RLS, an audit column, and
-- PostgREST embeds (hub -> hub_domain) for free. Lookups are by exact domain (the key)
-- or by hub (an index); suffix matching scans a table of tens of rows.
create table if not exists public.hub_domain (
  domain     text primary key check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and char_length(domain) <= 253),
  hub_id     uuid not null references public.hub (id) on delete cascade,
  added_by   uuid references public.profile (id) on delete set null,
  -- clock_timestamp, not now(): domains added in one transaction still keep their order.
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists hub_domain_hub_idx on public.hub_domain (hub_id, created_at);

-- May a domain belong to a hub? Not a shared host, and not github.com itself (it hosts
-- everyone's repos; a GitHub repo board never gives its hub a domain).
create or replace function public.v2_hub_domain_allowed(p_domain text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_domain <> '' and lower(p_domain) <> 'github.com' and not public.v2_is_shared_domain(lower(p_domain)), false);
$$;

create or replace function public.v2_hub_domain_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.domain := regexp_replace(lower(btrim(new.domain)), '^www\.', '');
  if not public.v2_hub_domain_allowed(new.domain) then
    raise exception 'shared_domain: % cannot belong to a company', new.domain using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists v2_hub_domain_guard on public.hub_domain;
create trigger v2_hub_domain_guard before insert or update of domain on public.hub_domain
  for each row execute function public.v2_hub_domain_guard();

-- primary_domain follows hub_domain: it keeps its value while that domain is still the
-- hub's, else it becomes the hub's oldest domain, else null.
create or replace function public.v2_hub_sync_primary(p_hub uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update hub h
     set primary_domain = coalesce(
           (select d.domain from hub_domain d where d.hub_id = h.id and d.domain = h.primary_domain),
           (select d.domain from hub_domain d where d.hub_id = h.id order by d.created_at, d.domain limit 1))
   where h.id = p_hub
     and h.primary_domain is distinct from coalesce(
           (select d.domain from hub_domain d where d.hub_id = h.id and d.domain = h.primary_domain),
           (select d.domain from hub_domain d where d.hub_id = h.id order by d.created_at, d.domain limit 1));
end $$;

create or replace function public.v2_hub_domain_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.v2_hub_sync_primary(old.hub_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.v2_hub_sync_primary(new.hub_id); end if;
  return null;
end $$;
drop trigger if exists v2_hub_domain_changed on public.hub_domain;
create trigger v2_hub_domain_changed after insert or update or delete on public.hub_domain
  for each row execute function public.v2_hub_domain_changed();

-- ...and the other way round: whoever writes hub.primary_domain directly (the 0019 seed,
-- an old script) adds it to hub_domain. A domain owned by another hub fails on the key.
create or replace function public.v2_hub_primary_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.primary_domain is not null
     and not exists (select 1 from hub_domain where domain = new.primary_domain and hub_id = new.id) then
    insert into hub_domain (domain, hub_id) values (new.primary_domain, new.id);
  end if;
  return null;
end $$;
drop trigger if exists v2_hub_primary_changed on public.hub;
create trigger v2_hub_primary_changed after insert or update of primary_domain on public.hub
  for each row execute function public.v2_hub_primary_changed();

-- Move every existing primary_domain in. Refuse (and say which) rather than guess when
-- two hubs share one, or one is a shared host.
do $$
declare bad text;
begin
  select string_agg(primary_domain, ', ') into bad from (
    select primary_domain from public.hub where primary_domain is not null
     group by primary_domain having count(*) > 1) d;
  if bad is not null then raise exception '0026: hubs share a primary_domain, resolve before applying: %', bad; end if;
  select string_agg(slug || ' (' || primary_domain || ')', ', ') into bad from public.hub
   where primary_domain is not null and not public.v2_hub_domain_allowed(primary_domain);
  if bad is not null then raise exception '0026: hub primary_domain is a shared host, resolve before applying: %', bad; end if;
end $$;
insert into public.hub_domain (domain, hub_id, created_at)
select primary_domain, id, created_at from public.hub where primary_domain is not null
on conflict (domain) do nothing;

-- ================================================================ visibility

create or replace function public.v2_hub_visible(p_hub uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from hub h
     where h.id = p_hub
       and (h.status = 'live'
         or (uid is not null and h.created_by = uid)
         or (uid is not null and public.hub_role(h.id, uid) is not null)
         or public.is_platform_admin(uid)));
$$;
grant execute on function public.v2_hub_visible(uuid, uuid) to anon, authenticated;

drop policy if exists "v2 hub read" on public.hub;
create policy "v2 hub read" on public.hub for select
  using (status = 'live' or public.v2_hub_visible(id));

alter table public.hub_domain enable row level security;
revoke all on public.hub_domain from anon, authenticated;
grant select on public.hub_domain to anon, authenticated;
drop policy if exists "v2 hub_domain read" on public.hub_domain;
create policy "v2 hub_domain read" on public.hub_domain for select using (public.v2_hub_visible(hub_id));
-- No write grant: domains change only through create_board, decide_board and the admin RPCs.

-- ================================================================ domain helpers

-- The hub's domain a target falls under, most specific first ("app.claude.ai" -> claude.ai).
create or replace function public.v2_hub_domain_for(p_hub uuid, p_target text)
returns text language sql stable security definer set search_path = public as $$
  select d.domain from hub_domain d
   where d.hub_id = p_hub and public.v2_domain_covers(d.domain, lower(coalesce(p_target, '')))
   order by char_length(d.domain) desc limit 1;
$$;

-- A hub domain the user has proved (directly or through a parent: google.com covers
-- gemini.google.com), oldest first; null when none.
create or replace function public.v2_hub_verified_domain(p_hub uuid, uid uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select d.domain from hub_domain d
   where d.hub_id = p_hub and public.v2_has_verified(d.domain, uid)
   order by d.created_at, d.domain limit 1;
$$;

-- The domain a work address must be proved on to act for a scope, or null when the
-- address is not at the scope at all.
--   board: its site's host, when the address is on it (0021's rule, unchanged).
--   hub:   the hub domain the address is on, or that the address's domain is a parent
--          of (x@google.com and a hub owning gemini.google.com).
create or replace function public.v2_scope_mail_domain(p_scope public.v2_scope, p_id uuid, p_mail_domain text)
returns text language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'board' then (select d from (select public.v2_site_domain(site) d from board where id = p_id) x
                        where public.v2_domain_covers(d, lower(coalesce(p_mail_domain, ''))))
    else (select d.domain from hub_domain d
           where d.hub_id = p_id
             and (public.v2_domain_covers(d.domain, lower(coalesce(p_mail_domain, '')))
                  or public.v2_domain_covers(lower(coalesce(p_mail_domain, '')), d.domain))
           order by char_length(d.domain) desc limit 1)
  end;
$$;

-- "Claude" -> "claude"; unique across hubs; never more than 40 chars.
create or replace function public.v2_hub_slug(p_name text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  base text := btrim(left(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-'), 36), '-');
  s    text;
  n    int  := 1;
begin
  if base = '' then base := 'company'; end if;
  s := base;
  while exists (select 1 from hub where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;

-- A pending hub nothing points at any more (its only board was rejected or moved) is
-- rejected and gives its domains back.
create or replace function public.v2_hub_retire_if_orphan(p_hub uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_hub is null then return; end if;
  if exists (select 1 from hub where id = p_hub and status = 'pending')
     and not exists (select 1 from board where hub_id = p_hub and status <> 'rejected') then
    update hub set status = 'rejected', reviewed_by = p_actor, reviewed_at = now() where id = p_hub;
    delete from hub_domain where hub_id = p_hub;
  end if;
end $$;

-- ================================================================ matching

-- The hub a site joins: the live hub whose domain covers it most specifically.
create or replace function public.v2_link_hub(p jsonb)
returns public.hub language sql stable security definer set search_path = public as $$
  select h.* from hub_domain d join hub h on h.id = d.hub_id
   where p ->> 'kind' = 'site' and h.status = 'live'
     and public.v2_domain_covers(d.domain, p ->> 'canonical')
   order by char_length(d.domain) desc
   limit 1;
$$;

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
    'hub', case when h.id is not null then jsonb_build_object('id', h.id, 'slug', h.slug, 'name', h.name) end);
end $$;

-- ================================================================ create_board

drop function if exists public.create_board(text, text, text, text);

-- Add a product. It starts pending and is followed by its creator. Its company:
--   p_hub_id        an existing live hub the person picked;
--   p_company_name  a company by name: an existing live hub of that name (any case), the
--                   caller's own pending hub of that name, or else a new hub, 'pending',
--                   created by them, with the product's domain as its first domain
--                   (unless that is a shared host, github.com, or already a hub's);
--   neither         the live hub whose domain covers the site (0024's behaviour).
-- Rate limits: 3 pending boards per person, 10 additions per 24 hours (a new company
-- only ever arrives with a new board, so it is limited by the same counts).
create or replace function public.create_board(p_link text, p_name text, p_tagline text, p_category text,
                                               p_hub_id uuid default null, p_company_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  p       jsonb := public.v2_parse_link(p_link);
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_tag   text := btrim(regexp_replace(coalesce(p_tagline, ''), '\s+', ' ', 'g'));
  v_cat   text := lower(btrim(coalesce(p_category, '')));
  v_co    text := btrim(regexp_replace(coalesce(p_company_name, ''), '\s+', ' ', 'g'));
  b       board;
  h       hub;
  v_mail  text;
  pending int;
  recent  int;
  v_claim boolean := false;
  v_new   boolean := false;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if p is null then return public.v2_err('invalid_link'); end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then return public.v2_err('name_length'); end if;
  if char_length(v_tag) > 120 then return public.v2_err('tagline_length'); end if;
  if v_cat not in ('ai', 'code', 'dev', 'design', 'prod', 'browser') then return public.v2_err('invalid_category'); end if;
  if p_hub_id is null and char_length(v_co) > 60 then return public.v2_err('company_length'); end if;

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

  if p_hub_id is not null then
    select * into h from hub where id = p_hub_id and status = 'live';
    if not found then return public.v2_err('company_not_found'); end if;
  elsif v_co <> '' then
    select * into h from hub where status = 'live' and lower(name) = lower(v_co) order by created_at limit 1;
    if not found then
      select * into h from hub where status = 'pending' and created_by = uid and lower(name) = lower(v_co)
       order by created_at limit 1;
    end if;
    v_new := not found;
  else
    h := public.v2_link_hub(p);
  end if;

  begin
    if v_new then
      insert into hub (slug, name, status, created_by)
      values (public.v2_hub_slug(v_co), v_co, 'pending', uid) returning * into h;
      if p ->> 'kind' = 'site' and public.v2_hub_domain_allowed(p ->> 'canonical')
         and not exists (select 1 from hub_domain d where public.v2_domain_covers(d.domain, p ->> 'canonical')) then
        insert into hub_domain (domain, hub_id, added_by) values (p ->> 'canonical', h.id, uid)
        on conflict (domain) do nothing;
      end if;
    end if;
    insert into board (slug, name, tagline, site, color, category, hub_id, status, created_by)
    values (public.v2_board_slug(v_name, p ->> 'canonical'), v_name, v_tag, p ->> 'canonical',
            public.v2_board_color(p ->> 'canonical'), v_cat, h.id, 'pending', uid)
    returning * into b;
  exception when unique_violation then
    -- Someone added the same site a moment ago (the canonical index is the backstop).
    -- The new hub, if any, is rolled back with the board.
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
                            'hub', case when h.id is not null then h.slug end,
                            'hub_status', case when h.id is not null then h.status end,
                            'can_claim', v_claim);
end $$;

-- ================================================================ decide_board

drop function if exists public.decide_board(uuid, boolean, text, text, text, text);

-- Platform admins approve (optionally fixing name, description, category and company)
-- or reject (optionally saying why). The creator is notified either way.
--   p_hub_mode 'keep' (default) the board's current company; with p_hub_name a pending
--                     company is renamed first.
--              'set'  p_hub_id, an existing live or pending hub (p_hub_name renames it
--                     if it is pending).
--              'none' no company.
-- Approving a board approves its pending company with it. A pending company left with
-- no board (moved away, rejected) is rejected too and gives its domains back.
create or replace function public.decide_board(p_board uuid, p_approve boolean, p_name text default null,
                                               p_tagline text default null, p_category text default null,
                                               p_reason text default null, p_hub_mode text default 'keep',
                                               p_hub_id uuid default null, p_hub_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  b      board;
  h      hub;
  v_old  uuid;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_tag  text := case when p_tagline is null then null else btrim(regexp_replace(p_tagline, '\s+', ' ', 'g')) end;
  v_cat  text := lower(btrim(coalesce(p_category, '')));
  v_why  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_mode text := lower(coalesce(nullif(btrim(p_hub_mode), ''), 'keep'));
  v_hub  text := nullif(btrim(regexp_replace(coalesce(p_hub_name, ''), '\s+', ' ', 'g')), '');
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into b from board where id = p_board for update;
  if not found then return public.v2_err('not_found'); end if;
  if b.status <> 'pending' then return public.v2_err('decided'); end if;
  v_old := b.hub_id;

  if p_approve then
    if v_name = '' then v_name := b.name; end if;
    if char_length(v_name) > 60 then return public.v2_err('name_length'); end if;
    if v_tag is not null and char_length(v_tag) > 120 then return public.v2_err('tagline_length'); end if;
    if v_cat = '' then v_cat := b.category; end if;
    if v_cat not in ('ai', 'code', 'dev', 'design', 'prod', 'browser') then return public.v2_err('invalid_category'); end if;
    if v_mode not in ('keep', 'set', 'none') then return public.v2_err('invalid_company'); end if;
    if v_hub is not null and char_length(v_hub) > 60 then return public.v2_err('company_length'); end if;

    if v_mode = 'keep' and b.hub_id is not null then
      select * into h from hub where id = b.hub_id for update;
    elsif v_mode = 'set' then
      select * into h from hub where id = p_hub_id and status <> 'rejected' for update;
      if not found then return public.v2_err('company_not_found'); end if;
    end if;

    if h.id is not null and h.status = 'pending' then
      update hub
         set name = coalesce(v_hub, name),
             slug = case when v_hub is not null and lower(v_hub) <> lower(name) then public.v2_hub_slug(v_hub) else slug end,
             status = 'live', reviewed_by = uid, reviewed_at = now()
       where id = h.id returning * into h;
    end if;

    update board
       set name = v_name, tagline = coalesce(v_tag, tagline), category = v_cat, hub_id = h.id,
           status = 'live', reviewed_by = uid, reviewed_at = now(), review_note = null
     where id = b.id returning * into b;
    if v_old is distinct from b.hub_id then perform public.v2_hub_retire_if_orphan(v_old, uid); end if;
  else
    if v_why is not null and char_length(v_why) > 500 then return public.v2_err('reason_length'); end if;
    update board set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = v_why
     where id = b.id returning * into b;
    perform public.v2_hub_retire_if_orphan(b.hub_id, uid);
  end if;

  perform public.v2_notify(b.created_by, 'product', uid, 'board', b.id, null,
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
                       'slug', b.slug, 'name', b.name, 'reason', v_why));
  return jsonb_build_object('ok', true, 'status', b.status, 'slug', b.slug,
                            'hub', case when h.id is not null then h.slug end);
end $$;

-- ================================================================ admin: a company's domains

create or replace function public.add_hub_domain(p_hub uuid, p_domain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  p     jsonb := public.v2_parse_link(p_domain);
  v_dom text := p ->> 'canonical';
  h     hub;
  other hub;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into h from hub where id = p_hub for update;
  if not found or h.status = 'rejected' then return public.v2_err('not_found'); end if;
  if p is null or p ->> 'kind' <> 'site' then return public.v2_err('invalid_domain'); end if;
  if not public.v2_hub_domain_allowed(v_dom) then return public.v2_err('shared_domain'); end if;
  select hb.* into other from hub_domain d join hub hb on hb.id = d.hub_id where d.domain = v_dom;
  if other.id = h.id then return jsonb_build_object('ok', true, 'domain', v_dom, 'already', true); end if;
  if other.id is not null then
    return public.v2_err('domain_taken', jsonb_build_object('hub', jsonb_build_object('slug', other.slug, 'name', other.name)));
  end if;
  insert into hub_domain (domain, hub_id, added_by) values (v_dom, h.id, uid);
  return jsonb_build_object('ok', true, 'domain', v_dom);
end $$;

create or replace function public.remove_hub_domain(p_hub uuid, p_domain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  delete from hub_domain where hub_id = p_hub and domain = lower(btrim(coalesce(p_domain, '')));
  if not found then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ claiming across a hub's domains

-- 0024's claim_board; the "Claim all of {hub}" offer now accepts any of the hub's domains.
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
    'hub', case when h.id is not null and h.status = 'live' and h.claimed_at is null
                     and public.v2_hub_verified_domain(h.id) is not null
                then h.slug end);
end $$;

-- 0021's claim_hub: proof of any one of the hub's domains claims it. Live hubs only.
create or replace function public.claim_hub(p_hub uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  h   hub;
  n   int;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into h from hub where id = p_hub for update;
  if not found or h.status <> 'live' then return public.v2_err('not_found'); end if;
  if h.claimed_at is not null then return public.v2_err('claimed'); end if;
  if not exists (select 1 from hub_domain where hub_id = h.id) then return public.v2_err('no_domain'); end if;
  if public.v2_hub_verified_domain(h.id) is null then return public.v2_err('not_verified'); end if;

  insert into membership (user_id, scope, scope_id, role) values (uid, 'hub', h.id, 'owner')
  on conflict (user_id, scope, scope_id) do update set role = 'owner';
  update hub set claimed_at = now() where id = h.id;
  update board set claimed_at = coalesce(claimed_at, now()) where hub_id = h.id;
  get diagnostics n = row_count;
  perform public.v2_notify(uid, 'claim', null, 'hub', h.id, null,
                           jsonb_build_object('scope', 'hub', 'slug', h.slug, 'name', h.name));
  return jsonb_build_object('ok', true, 'boards', n);
end $$;

-- 0021's request_join; a hub accepts an address on any of its domains.
create or replace function public.request_join(p_scope public.v2_scope, p_scope_id uuid, p_work_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_work_email, '')));
  d      text;
  v_id   uuid;
  a      record;
  v_hub  uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.v2_scope_claimed(p_scope, p_scope_id) then return public.v2_err('not_claimed'); end if;
  if coalesce(public.is_scope_team(p_scope, p_scope_id, uid), false) then return public.v2_err('already_member'); end if;
  if v_mail !~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_email'); end if;
  d := public.v2_scope_mail_domain(p_scope, p_scope_id, split_part(v_mail, '@', 2));
  if d is null then return public.v2_err('wrong_domain'); end if;
  if not public.v2_has_verified(d) then return public.v2_err('not_verified'); end if;

  -- Requests expire after 14 days (mockup); a stale one makes way for a new one.
  update join_request set status = 'withdrawn'
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending'
     and created_at < now() - interval '14 days';
  select id into v_id from join_request
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending';
  if found then return jsonb_build_object('ok', true, 'id', v_id, 'already', true); end if;

  insert into join_request (user_id, scope, scope_id, work_email) values (uid, p_scope, p_scope_id, v_mail)
  returning id into v_id;

  if p_scope = 'board' then select hub_id into v_hub from board where id = p_scope_id; end if;
  for a in select distinct user_id from membership
            where role in ('owner', 'admin')
              and ((scope = p_scope and scope_id = p_scope_id) or (scope = 'hub' and scope_id = v_hub)) loop
    perform public.v2_notify(a.user_id, 'join', uid, p_scope::text, p_scope_id, null,
                             jsonb_build_object('request', v_id, 'status', 'pending'));
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 0021's add_team_member; a hub accepts someone whose address is on any of its domains,
-- or who proved one of them.
create or replace function public.add_team_member(p_scope public.v2_scope, p_scope_id uuid, p_who text,
                                                  p_role public.v2_role default 'member')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  mine   public.v2_role := public.v2_scope_role(p_scope, p_scope_id);
  who    text := lower(btrim(coalesce(p_who, '')));
  target uuid;
  t_mail text;
  t_handle text;
  ok     boolean;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if mine is null or mine = 'member' then return public.v2_err('not_allowed'); end if;
  if p_role = 'owner' and mine <> 'owner' then return public.v2_err('owners_only'); end if;
  if who = '' then return public.v2_err('not_found'); end if;

  if position('@' in who) > 1 then
    select u.id, lower(u.email) into target, t_mail from auth.users u where lower(u.email) = who;
  else
    select p.id into target from profile p where p.handle = ltrim(who, '@');
    select lower(u.email) into t_mail from auth.users u where u.id = target;
  end if;
  if target is null then return public.v2_err('not_found'); end if;
  ok := public.v2_scope_mail_domain(p_scope, p_scope_id, split_part(coalesce(t_mail, ''), '@', 2)) is not null
        or case p_scope when 'board' then public.v2_has_verified(public.v2_scope_domain('board', p_scope_id), target)
                        else public.v2_hub_verified_domain(p_scope_id, target) is not null end;
  if not coalesce(ok, false) then return public.v2_err('wrong_domain'); end if;
  if exists (select 1 from membership where user_id = target and scope = p_scope and scope_id = p_scope_id) then
    return public.v2_err('already_member');
  end if;

  insert into membership (user_id, scope, scope_id, role) values (target, p_scope, p_scope_id, p_role);
  update join_request set status = 'approved', decided_by = uid, decided_at = now()
   where user_id = target and scope = p_scope and scope_id = p_scope_id and status = 'pending';
  perform public.v2_notify(target, 'join', uid, p_scope::text, p_scope_id, null,
                           jsonb_build_object('status', 'added', 'role', p_role));
  select handle into t_handle from profile where id = target;
  return jsonb_build_object('ok', true, 'user_id', target, 'handle', t_handle);
end $$;

-- 0021's open_dispute; a hub accepts an address on any of its domains.
create or replace function public.open_dispute(p_scope public.v2_scope, p_scope_id uuid, p_reason text, p_work_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_work_email, '')));
  v_why  text := btrim(coalesce(p_reason, ''));
  d      text;
  v_id   uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.v2_scope_claimed(p_scope, p_scope_id) then return public.v2_err('not_claimed'); end if;
  if coalesce(public.is_scope_team(p_scope, p_scope_id, uid), false) then return public.v2_err('already_member'); end if;
  if char_length(v_why) < 10 or char_length(v_why) > 2000 then return public.v2_err('reason_length'); end if;
  if v_mail !~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_email'); end if;
  d := public.v2_scope_mail_domain(p_scope, p_scope_id, split_part(v_mail, '@', 2));
  if d is null then return public.v2_err('wrong_domain'); end if;
  if not public.v2_has_verified(d) then return public.v2_err('not_verified'); end if;

  select id into v_id from ownership_dispute
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending';
  if found then return jsonb_build_object('ok', true, 'id', v_id, 'already', true); end if;
  insert into ownership_dispute (user_id, scope, scope_id, reason, work_email)
  values (uid, p_scope, p_scope_id, v_why, v_mail) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 0022's decide_dispute; for a hub the filer's proof of any of its domains counts.
create or replace function public.decide_dispute(p_dispute uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   ownership_dispute;
  nm  text;
  sl  text;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into d from ownership_dispute where id = p_dispute for update;
  if not found then return public.v2_err('not_found'); end if;
  if d.status <> 'pending' then return public.v2_err('decided'); end if;

  if d.scope = 'board' then select name, slug into nm, sl from board where id = d.scope_id;
  else select name, slug into nm, sl from hub where id = d.scope_id; end if;
  if nm is null then return public.v2_err('not_found'); end if;

  if p_approve then
    if d.scope = 'board' then
      if not coalesce(public.v2_has_verified(public.v2_scope_domain('board', d.scope_id), d.user_id), false) then
        return public.v2_err('not_verified');
      end if;
    elsif public.v2_hub_verified_domain(d.scope_id, d.user_id) is null then
      return public.v2_err('not_verified');
    end if;
    -- New owner first, so the last-owner guard never sees the scope without one.
    insert into membership (user_id, scope, scope_id, role) values (d.user_id, d.scope, d.scope_id, 'owner')
    on conflict (user_id, scope, scope_id) do update set role = 'owner';
    delete from membership where scope = d.scope and scope_id = d.scope_id and user_id <> d.user_id;
    if d.scope = 'board' then
      update board set claimed_at = coalesce(claimed_at, now()) where id = d.scope_id;
    else
      update hub set claimed_at = coalesce(claimed_at, now()) where id = d.scope_id;
      update board set claimed_at = coalesce(claimed_at, now()) where hub_id = d.scope_id;
    end if;
    update join_request set status = 'withdrawn'
     where scope = d.scope and scope_id = d.scope_id and status = 'pending' and user_id <> d.user_id;
  end if;

  update ownership_dispute
     set status = case when p_approve then 'approved' else 'rejected' end::public.v2_request_status,
         decided_by = uid, decided_at = now()
   where id = d.id;
  perform public.v2_notify(d.user_id, 'claim', uid, d.scope::text, d.scope_id, null,
    jsonb_build_object('scope', d.scope, 'slug', sl, 'name', nm,
                       'dispute', case when p_approve then 'approved' else 'rejected' end));
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ grants

-- Internal helpers: not callable over the API.
do $$
declare f text;
begin
  foreach f in array array[
    'public.v2_hub_domain_allowed(text)',
    'public.v2_hub_domain_guard()',
    'public.v2_hub_sync_primary(uuid)',
    'public.v2_hub_domain_changed()',
    'public.v2_hub_primary_changed()',
    'public.v2_hub_domain_for(uuid, text)',
    'public.v2_hub_verified_domain(uuid, uuid)',
    'public.v2_scope_mail_domain(public.v2_scope, uuid, text)',
    'public.v2_hub_slug(text)',
    'public.v2_hub_retire_if_orphan(uuid, uuid)',
    'public.v2_link_hub(jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Write and lookup RPCs: signed-in callers only (each also checks auth.uid()).
do $$
declare f text;
begin
  foreach f in array array[
    'public.check_product_link(text)',
    'public.create_board(text, text, text, text, uuid, text)',
    'public.decide_board(uuid, boolean, text, text, text, text, text, uuid, text)',
    'public.add_hub_domain(uuid, text)',
    'public.remove_hub_domain(uuid, text)',
    'public.claim_board(uuid)',
    'public.claim_hub(uuid)',
    'public.request_join(public.v2_scope, uuid, text)',
    'public.add_team_member(public.v2_scope, uuid, text, public.v2_role)',
    'public.open_dispute(public.v2_scope, uuid, text, text)',
    'public.decide_dispute(uuid, boolean)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- hub.status, created_by and the review columns are never client-writable: 0017 grants
-- hub UPDATE on (name, description) only and no INSERT at all, so create_board and
-- decide_board are the only ways a company is made or approved.
