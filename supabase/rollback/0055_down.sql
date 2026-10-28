-- Rollback for 0055: restore the 0054 record_event implementation.
-- This also restores its original transaction timestamp behavior and removes
-- the advisory serialization introduced by 0055.
create or replace function public.record_event(
  p_visit_id      uuid,
  p_kind          text,
  p_path          text default null,
  p_board_id      uuid default null,
  p_hub_id        uuid default null,
  p_referrer_host text default null,
  p_meta          jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_kind  text := btrim(coalesce(p_kind, ''));
  v_path  text := left(nullif(btrim(coalesce(p_path, '')), ''), 200);
  v_ref   text := lower(left(nullif(btrim(coalesce(p_referrer_host, '')), ''), 120));
  v_in    jsonb := coalesce(p_meta, '{}'::jsonb);
  v_meta  jsonb := '{}'::jsonb;
  v_q     text;
  v_trig  text;
  v_enum  text;
  v_board uuid := null;
  v_hub   uuid := null;
begin
  if p_visit_id is null then
    return;
  end if;

  if v_kind not in (
    'page_view', 'share_unfurl',
    'search_open', 'search_click', 'search_empty',
    'claim_open', 'claim_board_picked', 'claim_auth_prompt', 'claim_verify_started', 'claim_verify_failed',
    'composer_open', 'similar_post_click', 'share_click',
    'auth_open', 'auth_link_expired'
  ) then
    return;
  end if;

  -- Oversized or non-object payloads are dropped outright (cheap flood guard).
  if jsonb_typeof(v_in) <> 'object' or octet_length(v_in::text) > 512 then
    return;
  end if;

  -- Meta whitelist: only q (search_empty) and trigger (auth_open) are kept, clamped;
  -- method (claim_verify_started) and reason (claim_verify_failed) only as strict
  -- enums. Every other key is stripped.
  if v_kind = 'search_empty' then
    v_q := left(regexp_replace(btrim(coalesce(v_in->>'q', '')), '\s+', ' ', 'g'), 60);
    -- Only settled queries of 3+ characters, and never anything that looks like
    -- an email address or phone number: the whole event is dropped.
    if char_length(v_q) < 3 or private.analytics_term_is_personal(v_q) then
      return;
    end if;
    v_meta := jsonb_build_object('q', v_q);
  elsif v_kind = 'auth_open' then
    v_trig := left(nullif(btrim(coalesce(v_in->>'trigger', '')), ''), 40);
    if v_trig is not null then
      v_meta := jsonb_build_object('trigger', v_trig);
    end if;
  elsif v_kind = 'claim_verify_started' then
    -- 'email' or 'dns' only; anything else (or a non-string) is stripped.
    v_enum := case when jsonb_typeof(v_in->'method') = 'string'
                   then private.analytics_claim_method(v_in->>'method') end;
    if v_enum is not null then
      v_meta := jsonb_build_object('method', v_enum);
    end if;
  elsif v_kind = 'claim_verify_failed' then
    -- A known claim error code, else 'other'. Never free text.
    v_enum := private.analytics_claim_fail_reason(
                case when jsonb_typeof(v_in->'reason') = 'string' then v_in->>'reason' end);
    v_meta := jsonb_build_object('reason', v_enum);
  end if;

  -- Strip any path/query/scheme if a caller accidentally passed more than a hostname.
  v_ref := regexp_replace(v_ref, '^https?://', '');
  v_ref := regexp_replace(v_ref, '/.*$', '');
  v_ref := regexp_replace(v_ref, '^www\.', '');
  if v_ref = '' or v_ref in ('publisense.app', 'v2.publisense.app', 'localhost') or v_ref !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    v_ref := null;
  end if;

  -- Flood guards. Per visit token: 60 per minute and 120 per 5 minutes. share_unfurl
  -- is exempt from the per-visit caps (the share function mints a fresh token per
  -- unfurl). Global: 600 per minute. The visit token is client-chosen, so these
  -- bound volume rather than prove identity (see docs/v2/COMMAND_CENTRE.md).
  if v_kind <> 'share_unfurl' then
    if (select count(*) from private.analytics_event where visit_id = p_visit_id and at > now() - interval '1 minute') >= 60 then
      return;
    end if;
    if (select count(*) from private.analytics_event where visit_id = p_visit_id and at > now() - interval '5 minutes') >= 120 then
      return;
    end if;
  end if;
  if (select count(*) from private.analytics_event where at > now() - interval '1 minute') >= 600 then
    return;
  end if;

  if p_board_id is not null and exists (select 1 from public.board where id = p_board_id and status = 'live') then
    v_board := p_board_id;
  end if;
  if p_hub_id is not null and exists (select 1 from public.hub where id = p_hub_id and status = 'live') then
    v_hub := p_hub_id;
  end if;

  insert into private.analytics_event (visit_id, kind, board_id, hub_id, path, referrer_host, meta)
  values (p_visit_id, v_kind, v_board, v_hub, v_path, v_ref, v_meta);
end
$$;

revoke all on function public.record_event(uuid, text, text, uuid, uuid, text, jsonb) from public;
grant execute on function public.record_event(uuid, text, text, uuid, uuid, text, jsonb) to anon, authenticated, service_role;
