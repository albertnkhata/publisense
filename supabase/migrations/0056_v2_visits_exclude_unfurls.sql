-- 0056: visits count people, not link-preview bots.
--
-- A share_unfurl event is logged when a crawler (WhatsApp, Slack, X, Discord) fetches
-- a link preview. Each one carries its own fresh visit token, and the per-day 'visit'
-- total counted distinct tokens across every kind, so every unfurl added a "visit"
-- (Oct 29, 2026: 61 of 120). The 'visit' total now leaves share_unfurl out; unfurls
-- are still counted under their own kind (the Bot unfurls tile). Only function bodies
-- change: no tables, columns, RLS or grants beyond re-stating the existing ones.
-- Rollback: supabase/rollback/0056_down.sql.

create or replace function private.rollup_analytics_events() returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_cutoff timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - interval '30 days';
  v_deleted integer := 0;
begin
  with old_rows as (
    delete from private.analytics_event
     where at < v_cutoff
    returning (at at time zone 'UTC')::date as day, kind, board_id, referrer_host,
              private.analytics_detail(kind, meta) as detail, visit_id
  ),
  grouped as (
    select day, kind, board_id, referrer_host, detail,
           count(*)::integer as events,
           count(distinct visit_id)::integer as visits
      from old_rows
     group by day, kind, board_id, referrer_host, detail
    union all
    select day, 'visit', null::uuid, null::text, null::text,
           count(*)::integer,
           count(distinct visit_id)::integer
      from old_rows
     where kind <> 'share_unfurl'
     group by day
  ),
  ins as (
    insert into private.analytics_daily (day, kind, board_id, referrer_host, detail, events, visits)
    select day, kind, board_id, referrer_host, detail, events, visits
      from grouped
    on conflict (day, kind, coalesce(board_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(referrer_host, ''), coalesce(detail, ''))
    do update set
      events = private.analytics_daily.events + excluded.events,
      visits = private.analytics_daily.visits + excluded.visits
    returning 1
  )
  select count(*)::integer into v_deleted from old_rows;
  return v_deleted;
end
$$;

create or replace function private.analytics_buckets(p_since timestamptz)
returns table (day date, kind text, board_id uuid, referrer_host text, detail text, events integer, visits integer)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with split as (
    select coalesce(max(d.day) + 1, '-infinity'::date) as day from private.analytics_daily d
  ),
  raw as (
    select e.*, (e.at at time zone 'UTC')::date as d, private.analytics_detail(e.kind, e.meta) as det
      from private.analytics_event e, split
     where e.at >= p_since
       and e.at >= (split.day::timestamp at time zone 'UTC')
  )
  select d.day, d.kind, d.board_id, d.referrer_host, d.detail, d.events, d.visits
    from private.analytics_daily d, split
   where d.day >= (p_since at time zone 'UTC')::date
     and d.day < split.day
  union all
  select r.d, r.kind, r.board_id, r.referrer_host, r.det, count(*)::int, count(distinct r.visit_id)::int
    from raw r
   group by r.d, r.kind, r.board_id, r.referrer_host, r.det
  union all
  select r.d, 'visit', null, null, null, count(*)::int, count(distinct r.visit_id)::int
    from raw r
   where r.kind <> 'share_unfurl'
   group by r.d
$$;

revoke all on function private.rollup_analytics_events() from public, anon, authenticated;
grant execute on function private.rollup_analytics_events() to service_role;
revoke all on function private.analytics_buckets(timestamptz) from public, anon, authenticated;
grant execute on function private.analytics_buckets(timestamptz) to service_role;
