-- Publisense v2: companies change their names, and a hub has to survive it.
-- xAI became SpaceXAI in July 2026 and SpaceXSI in October; Windsurf became Devin
-- Desktop. A hub carried one mutable name and one mutable slug, so a rename either left
-- a stale name published or broke every link that pointed at /h/<old slug>.
--
-- WHAT THIS CHANGES
--   hub_name       new table: one row per name a company has used — trade name, legal
--                  name, former name, alias — carrying the slug the hub was published
--                  under at the time, the interval that name was in force, and where the
--                  claim comes from. The slug is unique across ALL names of all hubs, so
--                  a slug can only ever resolve to the company that once used it:
--                  someone else cannot claim /h/xai later.
--   hub            name and slug stay, now derived: both mirror the hub's current
--                  hub_name row, kept by triggers in both directions, so every
--                  0016-0027 reader, seed and RPC keeps working unchanged. Whoever
--                  writes hub.name or hub.slug directly — the 0019 seed, decide_board's
--                  p_hub_name rename, an admin script — closes the current name row and
--                  appends a new one instead of losing the name it replaced.
--   resolve_hub_slug(text)   slug in, hub out, for current and former slugs alike, so the
--                  app can redirect /h/xai to /h/spacexsi instead of "Hub not found".
--   rename_hub     platform admins rename through one RPC that records history and
--                  refuses to take a slug another company has used.
--   v2_hub_slug    gains an optional hub: it now also steers clear of former slugs, so a
--                  new company cannot be given the slug an older one used to own.
--   Visibility     a name row is readable when its hub is visible, nothing more. Names
--                  change only through rename_hub, decide_board and the seed.
--
-- Safe to apply once, as `postgres`, in one transaction (SQL editor or psql -1). Every
-- statement also tolerates a re-run, but production records it once in
-- supabase_migrations.schema_migrations.

-- ================================================================ hub_name

-- Why history and not an aliases text[]: "a slug can only ever resolve to the company
-- that used it" is a unique key here, enforced by the database under concurrency, and the
-- interval each name was in force is what lets the app say "formerly xAI" without
-- guessing dates. A table also gets its own RLS, PostgREST embeds (hub -> hub_name) and
-- an index for search.
create table if not exists public.hub_name (
  id         uuid primary key default gen_random_uuid(),
  hub_id     uuid not null references public.hub (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  kind       text not null default 'trade' check (kind in ('trade', 'legal', 'former', 'alias')),
  -- Where the claim that this was the company's name comes from. A former name is a
  -- factual statement about a real company, so it travels with its source; blank beats a
  -- guess (FOUNDATION §7).
  source     text check (source is null or char_length(source) <= 200),
  valid_from date,
  valid_to   date,
  is_current boolean not null default false,
  -- clock_timestamp, not now(): names recorded in one transaction still keep their order.
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists hub_name_hub_idx on public.hub_name (hub_id, created_at);
-- Deliberately NOT unique on (slug) or (slug, hub_id): a company that returns to a name it
-- used before records a second interval, and nothing is lost. Cross-company protection is
-- the guard below, which every write path passes through, plus the partial index that
-- allows one current name per hub.
-- Exactly one name per hub is in force.
create unique index if not exists hub_name_current_idx on public.hub_name (hub_id) where is_current;
create index if not exists hub_name_lower_name_idx on public.hub_name (lower(name));

create or replace function public.v2_hub_name_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  new.slug := lower(btrim(coalesce(new.slug, '')));
  if new.name = '' then
    raise exception 'invalid_name: a company name cannot be empty' using errcode = '23514';
  end if;
  if new.valid_from is not null and new.valid_to is not null and new.valid_to < new.valid_from then
    raise exception 'invalid_dates: % ended before it began', new.name using errcode = '23514';
  end if;
  -- A slug belongs to the company that used it: no other company may take it, current or
  -- former. Enforced here rather than by a unique index because a company returning to a
  -- name it used before must be allowed its own second interval.
  if exists (select 1 from public.hub_name n
              where n.slug = new.slug and n.hub_id <> new.hub_id) then
    raise exception 'slug_taken: % already belongs to another company', new.slug using errcode = '23505';
  end if;
  -- "Current" is exclusive: retire whatever was current for this hub before the row is
  -- written, so the partial unique index is never violated by two current rows.
  if new.is_current then
    update public.hub_name set is_current = false, valid_to = coalesce(valid_to, current_date)
     where hub_id = new.hub_id and is_current and id <> new.id;
  end if;
  return new;
end $$;
drop trigger if exists v2_hub_name_guard on public.hub_name;
create trigger v2_hub_name_guard before insert or update on public.hub_name
  for each row execute function public.v2_hub_name_guard();

-- ================================================================ hub <- hub_name

-- hub.name and hub.slug mirror the current name row.
create or replace function public.v2_hub_sync_name(p_hub uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_slug text;
begin
  select name, slug into v_name, v_slug from public.hub_name where hub_id = p_hub and is_current;
  if v_name is null then return; end if;
  update public.hub set name = v_name, slug = v_slug
   where id = p_hub and (name is distinct from v_name or slug is distinct from v_slug);
end $$;

create or replace function public.v2_hub_name_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.v2_hub_sync_name(old.hub_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.v2_hub_sync_name(new.hub_id); end if;
  return null;
end $$;
drop trigger if exists v2_hub_name_changed on public.hub_name;
create trigger v2_hub_name_changed after insert or update or delete on public.hub_name
  for each row execute function public.v2_hub_name_changed();

-- ...and the other way round: a direct write to hub.name or hub.slug (the seed, a rename
-- in decide_board, an admin script) records the new name and retires the old one.
create or replace function public.v2_hub_named()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
begin
  -- Already the current name row (this is how v2_hub_sync_name writes): nothing to do.
  if exists (select 1 from public.hub_name
              where hub_id = new.id and is_current and name = new.name and slug = new.slug) then
    return null;
  end if;
  -- A slug another company has used, current or former, cannot be taken over: links to it
  -- must keep resolving to that company. Say whose it is rather than guess.
  select n.name || ' (' || n.slug || ')' into v_owner
    from public.hub_name n where n.slug = new.slug and n.hub_id <> new.id;
  if v_owner is not null then
    raise exception 'slug_taken: % already belongs to %', new.slug, v_owner using errcode = '23505';
  end if;
  update public.hub_name set is_current = false, valid_to = coalesce(valid_to, current_date)
   where hub_id = new.id and is_current;
  insert into public.hub_name (hub_id, name, slug, kind, is_current, source, valid_from)
  values (new.id, new.name, new.slug, 'trade', true, null, current_date);
  return null;
end $$;
drop trigger if exists v2_hub_named on public.hub;
create trigger v2_hub_named after insert or update of name, slug on public.hub
  for each row execute function public.v2_hub_named();

-- "Claude" -> "claude"; unique across current hubs AND former names; never more than 40
-- chars. p_hub is the hub being renamed, whose own names it may reuse. A default
-- parameter makes this a different signature, so 0026's one-argument form is dropped
-- first — one-argument calls keep working.
drop function if exists public.v2_hub_slug(text);
create or replace function public.v2_hub_slug(p_name text, p_hub uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  base text := btrim(left(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-'), 36), '-');
  s    text;
  n    int  := 1;
begin
  if base = '' then base := 'company'; end if;
  s := base;
  while exists (select 1 from hub where slug = s and id is distinct from p_hub)
     or exists (select 1 from hub_name where slug = s and hub_id is distinct from p_hub) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;

-- ================================================================ resolving a slug

-- Current or former: the hub that owns this slug and the name it goes by now. The app
-- redirects to the current slug instead of rendering "Hub not found". One row, the newest
-- meaning of the slug, so a company that reused a name does not return duplicates.
create or replace function public.resolve_hub_slug(p_slug text)
returns table (hub_id uuid, slug text, name text, is_current boolean)
language sql stable security definer set search_path = public as $$
  select n.hub_id, n.slug, n.name, n.is_current
    from public.hub_name n
   where n.slug = lower(btrim(coalesce(p_slug, '')))
     and public.v2_hub_visible(n.hub_id)
   order by n.is_current desc, n.created_at desc
   limit 1;
$$;
grant execute on function public.resolve_hub_slug(text) to anon, authenticated;

-- ================================================================ renaming

create or replace function public.rename_hub(
  p_hub    uuid,
  p_name   text,
  p_slug   text default null,
  p_kind   text default 'trade',
  p_source text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_slug text;
  v_hub  public.hub%rowtype;
begin
  if not public.is_platform_admin(uid) then
    return public.v2_err('not_permitted', '{}'::jsonb);
  end if;
  select * into v_hub from public.hub where id = p_hub;
  if not found then return public.v2_err('hub_not_found', '{}'::jsonb); end if;
  if v_name = '' then return public.v2_err('invalid_name', '{}'::jsonb); end if;
  if p_kind = 'former' then
    return public.v2_err('invalid_kind', jsonb_build_object('why', 'a former name cannot become the current one'));
  end if;
  if v_name = v_hub.name and nullif(btrim(coalesce(p_slug, '')), '') is null then
    return jsonb_build_object('ok', true, 'slug', v_hub.slug, 'name', v_hub.name, 'changed', false);
  end if;
  -- An explicit slug is honoured as given (the table constraint validates the shape); a
  -- derived one steers clear of slugs other companies own, current or former.
  v_slug := coalesce(nullif(lower(btrim(coalesce(p_slug, ''))), ''), public.v2_hub_slug(v_name, p_hub));
  insert into public.hub_name (hub_id, name, slug, kind, is_current, source, valid_from)
  values (p_hub, v_name, v_slug, p_kind, true, p_source, current_date);
  perform public.v2_hub_sync_name(p_hub);
  select * into v_hub from public.hub where id = p_hub;
  return jsonb_build_object('ok', true, 'slug', v_hub.slug, 'name', v_hub.name, 'changed', true);
exception when unique_violation then
  return public.v2_err('slug_taken', jsonb_build_object('slug', v_slug));
end $$;
revoke all on function public.rename_hub(uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.rename_hub(uuid, text, text, text, text) to authenticated;

-- ================================================================ visibility

alter table public.hub_name enable row level security;
revoke all on public.hub_name from anon, authenticated;
grant select on public.hub_name to anon, authenticated;
drop policy if exists "v2 hub_name read" on public.hub_name;
create policy "v2 hub_name read" on public.hub_name for select using (public.v2_hub_visible(hub_id));
-- No write grant: names change only through rename_hub, decide_board and the seed.

-- ================================================================ backfill

-- Every existing hub gets its current name from the columns it already publishes.
insert into public.hub_name (hub_id, name, slug, kind, is_current, source, valid_from)
select h.id, h.name, h.slug, 'trade', true, null, h.created_at::date
  from public.hub h where not exists (
    select 1 from public.hub_name n where n.hub_id = h.id and n.is_current)
on conflict do nothing;

-- Names we can source, so "formerly xAI" is a claim with a citation rather than a guess.
-- Each row is skipped if the slug is already owned, so this is safe to re-run.
do $$
declare
  h uuid;
begin
  select id into h from public.hub where slug = 'spacexsi';
  if h is not null then
    insert into public.hub_name (hub_id, name, slug, kind, source, valid_from, valid_to)
    select h, v.name, v.slug, v.kind, v.source, v.valid_from::date, v.valid_to::date
      from (values
        ('xAI',         'xai',         'former',
         'Founded 2023-03-09 as X.AI Corp.; renamed SpaceXAI in July 2026 (CNBC 2026-02-03; Wikipedia "SpaceXAI")',
         '2023-03-09', '2026-07-06'),
        ('SpaceXAI',    'spacexai',    'former',
         'Renamed from xAI in July 2026; renamed SpaceXSI in October 2026 (Wikipedia "SpaceXAI")',
         '2026-07-06', '2026-10-04'),
        ('SpaceXAI LLC', 'spacexai-llc', 'legal',
         'Legal entity; trade name SpaceXSI (Wikipedia "SpaceXAI")',
         '2026-07-06', null)
      ) as v(name, slug, kind, source, valid_from, valid_to)
     where not exists (select 1 from public.hub_name n where n.slug = v.slug);
  end if;
end $$;

-- Refuse rather than leave the two representations disagreeing.
do $$
declare bad text;
begin
  select string_agg(h.slug, ', ') into bad from (
    select h.slug from public.hub h
     where (select count(*) from public.hub_name n where n.hub_id = h.id and n.is_current) <> 1) h;
  if bad is not null then
    raise exception '0028: hubs without exactly one current name: %', bad;
  end if;
  select string_agg(h.slug || ' vs ' || n.name || '/' || n.slug, ', ') into bad
    from public.hub h
    join public.hub_name n on n.hub_id = h.id and n.is_current
   where h.name <> n.name or h.slug <> n.slug;
  if bad is not null then
    raise exception '0028: hub and its current name disagree: %', bad;
  end if;
end $$;
