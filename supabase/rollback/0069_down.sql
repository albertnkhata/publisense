-- Rollback for 0069_v2_exclude_internal_analytics.sql
-- Restores 0055's record_event and drops the 0069 analytics exclusion helpers.

drop function if exists public.is_analytics_excluded();
drop function if exists private.is_excluded_analytics_user(uuid);
drop function if exists private.is_excluded_analytics_email(text);

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
set lock_timeout = '250ms'
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
  v_now   timestamptz;
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

  if jsonb_typeof(v_in) <> 'object' or octet_length(v_in::text) > 512 then
    return;
  end if;

  if v_kind = 'search_empty' then
    v_q := left(regexp_replace(btrim(coalesce(v_in->>'q', '')), '\s+', ' ', 'g'), 60);
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
    v_enum := case when jsonb_typeof(v_in->'method') = 'string'
                   then private.analytics_claim_method(v_in->>'method') end;
    if v_enum is not null then
      v_meta := jsonb_build_object('method', v_enum);
    end if;
  elsif v_kind = 'claim_verify_failed' then
    v_enum := private.analytics_claim_fail_reason(
                case when jsonb_typeof(v_in->'reason') = 'string' then v_in->>'reason' end);
    v_meta := jsonb_build_object('reason', v_enum);
  end if;

  v_ref := regexp_replace(v_ref, '^https?://', '');
  v_ref := regexp_replace(v_ref, '/.*$', '');
  v_ref := regexp_replace(v_ref, '^www\.', '');
  if v_ref = '' or v_ref in ('publisense.app', 'v2.publisense.app', 'localhost') or v_ref !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    v_ref := null;
  end if;

  begin
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('publisense:analytics:record_event:rate-limit', 0)
    );
  exception when lock_not_available then
    return;
  end;
  v_now := pg_catalog.clock_timestamp();

  if v_kind <> 'share_unfurl' then
    if (select count(*) from private.analytics_event where visit_id = p_visit_id and at > v_now - interval '1 minute') >= 60 then
      return;
    end if;
    if (select count(*) from private.analytics_event where visit_id = p_visit_id and at > v_now - interval '5 minutes') >= 120 then
      return;
    end if;
  end if;
  if (select count(*) from private.analytics_event where at > v_now - interval '1 minute') >= 600 then
    return;
  end if;

  if p_board_id is not null and exists (select 1 from public.board where id = p_board_id and status = 'live') then
    v_board := p_board_id;
  end if;
  if p_hub_id is not null and exists (select 1 from public.hub where id = p_hub_id and status = 'live') then
    v_hub := p_hub_id;
  end if;

  insert into private.analytics_event (visit_id, kind, board_id, hub_id, path, referrer_host, meta, at)
  values (p_visit_id, v_kind, v_board, v_hub, v_path, v_ref, v_meta, v_now);
end
$$;

revoke all on function public.record_event(uuid, text, text, uuid, uuid, text, jsonb) from public;
grant execute on function public.record_event(uuid, text, text, uuid, uuid, text, jsonb) to anon, authenticated, service_role;

delete from supabase_migrations.schema_migrations where version = '0069';

notify pgrst, 'reload schema';
