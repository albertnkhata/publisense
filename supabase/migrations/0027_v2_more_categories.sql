-- 0027: more product categories.
-- The launch set (ai, code, dev, design, prod, browser) covered AI and developer tools
-- only. Adds comms, social, media, finance, shopping, gaming, education, health,
-- travel and other. One function now holds the list, so the check constraint,
-- create_board and decide_board cannot drift apart. Existing boards are untouched.

create or replace function public.v2_categories()
returns text[] language sql immutable as $$
  select array['ai', 'code', 'dev', 'design', 'prod', 'browser',
               'comms', 'social', 'media', 'finance', 'shopping', 'gaming',
               'education', 'health', 'travel', 'other']::text[]
$$;

create or replace function public.v2_category_ok(p text)
returns boolean language sql immutable as $$
  select p = any (public.v2_categories())
$$;

do $c$
declare r record;
begin
  -- Drop whatever check constraint guards board.category (named by Postgres in 0016).
  for r in select con.conname from pg_constraint con
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
           where con.conrelid = 'public.board'::regclass and con.contype = 'c' and a.attname = 'category'
  loop
    execute format('alter table public.board drop constraint %I', r.conname);
  end loop;
end $c$;

alter table public.board add constraint board_category_check
  check (category is null or public.v2_category_ok(category));

-- ================================================================ create_board (0026, list now from v2_category_ok)

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

-- ================================================================ decide_board (0026, list now from v2_category_ok)

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
