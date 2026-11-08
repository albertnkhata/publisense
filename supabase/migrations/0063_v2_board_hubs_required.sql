-- 0063: every product board belongs to a hub, even when it is the hub's only product.
--
-- Existing ungrouped boards get a hidden singleton hub named after the product. We do not
-- infer company ownership from a product's site during this backfill: the existing catalogue
-- can have products on shared/third-party sites, and a product-name singleton is the least
-- assumptive association. New products still join an existing hub by explicit company or
-- known hub domain; otherwise the board trigger creates the same product-name singleton.
-- The public UI continues to expose a hub only when it has two or more live products.

-- Backfill every status, not just live boards. Preserve the board's review lifecycle and
-- creator, while leaving the hub domainless unless a company relationship was established.
do $$
declare
  b record;
  v_hub uuid;
  v_status text;
begin
  for b in select id, name, status, created_by, reviewed_by, reviewed_at, created_at
             from public.board
            where hub_id is null
            order by created_at, id
  loop
    v_status := case b.status
      when 'pending' then 'pending'
      when 'rejected' then 'rejected'
      else 'live'
    end;
    insert into public.hub (slug, name, description, status, created_by, reviewed_by, reviewed_at, created_at)
    values (public.v2_hub_slug(b.name), b.name, '', v_status, b.created_by, b.reviewed_by, b.reviewed_at, b.created_at)
    returning id into v_hub;
    update public.board set hub_id = v_hub where id = b.id;
  end loop;
end $$;

-- Last-resort invariant for SQL/admin write paths and legacy callers: a null association
-- gets a product-named singleton. RPC paths that already know the company set hub_id first.
create or replace function public.v2_board_ensure_hub()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hub_status text;
begin
  if new.hub_id is not null then return new; end if;

  v_hub_status := case coalesce(new.status, 'live')
    when 'pending' then 'pending'
    when 'rejected' then 'rejected'
    else 'live'
  end;

  insert into public.hub (slug, name, description, status, created_by, reviewed_by, reviewed_at, created_at)
  values (
    public.v2_hub_slug(new.name),
    new.name,
    '',
    v_hub_status,
    new.created_by,
    new.reviewed_by,
    new.reviewed_at,
    coalesce(new.created_at, now())
  )
  returning id into new.hub_id;
  return new;
end
$$;
revoke all on function public.v2_board_ensure_hub() from public, anon, authenticated;

drop trigger if exists v2_board_ensure_hub on public.board;
create trigger v2_board_ensure_hub
before insert or update of hub_id on public.board
for each row execute function public.v2_board_ensure_hub();

-- A board may never be detached by deleting its hub. Hub removal must be explicit rather
-- than silently changing a product's company relationship.
alter table public.board drop constraint if exists board_hub_id_fkey;
alter table public.board add constraint board_hub_id_fkey
  foreign key (hub_id) references public.hub (id) on delete restrict;
alter table public.board alter column hub_id set not null;

-- Keep all existing create_board checks, matching, rate limits, and optional company input.
-- If no matching/selected company exists, the trigger creates a singleton; reload it so the
-- existing JSON response returns the actual hub slug and status rather than null.
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
  if not public.v2_category_ok(v_cat) then return public.v2_err('invalid_category'); end if;
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
    if h.id is null then select * into h from hub where id = b.hub_id; end if;
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
                            'hub', h.slug, 'hub_status', h.status, 'can_claim', v_claim);
end $$;

-- 'none' remains accepted for compatibility with the moderation form, but now means a
-- product-name singleton instead of detaching the product. The trigger creates that hub
-- during the board update; reload it for the existing response contract.
create or replace function public.decide_board(p_board uuid, p_approve boolean, p_name text DEFAULT NULL::text, p_tagline text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_hub_mode text DEFAULT 'keep'::text, p_hub_id uuid DEFAULT NULL::uuid, p_hub_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_submitter uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not private.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into b from board where id = p_board for update;
  if not found then return public.v2_err('not_found'); end if;
  if b.status <> 'pending' then return public.v2_err('decided'); end if;
  if v_why is not null and char_length(v_why) > 500 then return public.v2_err('reason_length'); end if;
  if not p_approve and v_why is null then return public.v2_err('reason_required'); end if;
  v_old := b.hub_id;
  v_submitter := b.created_by;

  if p_approve then
    if v_name = '' then v_name := b.name; end if;
    if char_length(v_name) > 60 then return public.v2_err('name_length'); end if;
    if v_tag is not null and char_length(v_tag) > 120 then return public.v2_err('tagline_length'); end if;
    if v_cat = '' then v_cat := b.category; end if;
    if not public.v2_category_ok(v_cat) then return public.v2_err('invalid_category'); end if;
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
    select * into h from hub where id = b.hub_id;
  else
    update board set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = v_why
     where id = b.id returning * into b;
    perform public.v2_hub_retire_if_orphan(b.hub_id, uid);
  end if;

  insert into board_decision (board_id, decision, note, decided_by, submitter)
  values (b.id, case when p_approve then 'approved' else 'rejected' end, v_why, uid, v_submitter);

  perform public.v2_notify(b.created_by, 'product', uid, 'board', b.id, null,
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
                       'slug', b.slug, 'name', b.name,
                       'reason', case when p_approve then null else v_why end,
                       'note', case when p_approve then v_why else null end));
  return jsonb_build_object('ok', true, 'status', b.status, 'slug', b.slug,
                            'hub', case when h.id is not null then h.slug end);
end $function$;

comment on column public.board.hub_id is
  'Required company/product-group association. A one-product hub is a hidden singleton; product UI exposes hubs only for multi-product families.';
