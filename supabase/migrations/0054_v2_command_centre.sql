-- 0053: /admin Command Centre & first-party analytics (docs/v2/COMMAND_CENTRE.md).
--
-- Adds:
--   1. private.analytics_event & private.analytics_daily: cookieless, non-PII
--      first-party interaction and traffic storage in `private` (never exposed as
--      PostgREST tables).
--   2. public.record_event(...): SECURITY DEFINER write RPC callable by anon and
--      authenticated. Enforces an explicit allow-list of 15 event kinds, a 512-byte
--      meta cap, hostname-only referrers, and per-visit / global 1-minute rate
--      limits, silently dropping anything invalid or over budget.
--   3. private.rollup_analytics_events(): aggregates events older than 30 days into
--      private.analytics_daily and prunes raw rows (scheduled nightly via pg_cron).
--   4. public.admin_command_centre(p_days int): SECURITY DEFINER read RPC guarded by
--      private.is_platform_admin(auth.uid()), returning action queues, D-011 honest
--      member vs. imported post traction split, feedback-loop velocity, traffic,
--      funnels, daily series, hot unclaimed boards, and unmet search demand.
--
-- Rollback: supabase/rollback/0053_down.sql.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ================================================================ tables

create table if not exists private.analytics_event (
  id            bigserial primary key,
  visit_id      uuid not null,
  kind          text not null check (kind in (
                  'page_view', 'share_unfurl',
                  'search_open', 'search_click', 'search_empty',
                  'claim_open', 'claim_board_picked', 'claim_auth_prompt', 'claim_verify_started', 'claim_verify_failed',
                  'composer_open', 'similar_post_click', 'share_click',
                  'auth_open', 'auth_link_expired'
                )),
  board_id      uuid references public.board (id) on delete set null,
  hub_id        uuid references public.hub (id) on delete set null,
  path          text check (path is null or char_length(path) <= 200),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  meta          jsonb not null default '{}'::jsonb
                check (jsonb_typeof(meta) = 'object' and octet_length(meta::text) <= 512),
  at            timestamptz not null default now()
);

create index if not exists analytics_event_at_idx    on private.analytics_event (at desc);
create index if not exists analytics_event_kind_idx  on private.analytics_event (kind, at desc);
create index if not exists analytics_event_visit_idx on private.analytics_event (visit_id, at desc);
create index if not exists analytics_event_board_idx on private.analytics_event (board_id, at desc) where board_id is not null;

create table if not exists private.analytics_daily (
  day           date not null,
  kind          text not null,
  board_id      uuid references public.board (id) on delete set null,
  referrer_host text,
  events        integer not null default 0,
  visits        integer not null default 0
);

create unique index if not exists analytics_daily_bucket_idx
  on private.analytics_daily (day, kind, coalesce(board_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(referrer_host, ''));

revoke all on table private.analytics_event, private.analytics_daily from public, anon, authenticated;
grant all on table private.analytics_event, private.analytics_daily to service_role;
grant usage, select on sequence private.analytics_event_id_seq to service_role;

-- ================================================================ record_event

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
  v_meta  jsonb := coalesce(p_meta, '{}'::jsonb);
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

  if jsonb_typeof(v_meta) <> 'object' or octet_length(v_meta::text) > 512 then
    return;
  end if;

  -- Strip any path/query/scheme if a caller accidentally passed more than a hostname.
  v_ref := regexp_replace(v_ref, '^https?://', '');
  v_ref := regexp_replace(v_ref, '/.*$', '');
  v_ref := regexp_replace(v_ref, '^www\.', '');
  if v_ref = '' or v_ref in ('publisense.app', 'v2.publisense.app', 'localhost') or v_ref !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    v_ref := null;
  end if;

  -- Per-visit and global 1-minute flood guards.
  if (select count(*) from private.analytics_event where visit_id = p_visit_id and at > now() - interval '1 minute') >= 60 then
    return;
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

-- ================================================================ rollup & retention

create or replace function private.rollup_analytics_events() returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_cutoff timestamptz := date_trunc('day', now() - interval '30 days');
  v_deleted integer := 0;
begin
  with old_rows as (
    delete from private.analytics_event
     where at < v_cutoff
    returning (at at time zone 'UTC')::date as day, kind, board_id, referrer_host, visit_id
  ),
  grouped as (
    select day, kind, board_id, referrer_host,
           count(*)::integer as events,
           count(distinct visit_id)::integer as visits
      from old_rows
     group by day, kind, board_id, referrer_host
  )
  insert into private.analytics_daily (day, kind, board_id, referrer_host, events, visits)
  select day, kind, board_id, referrer_host, events, visits
    from grouped
  on conflict (day, kind, coalesce(board_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(referrer_host, ''))
  do update set
    events = private.analytics_daily.events + excluded.events,
    visits = private.analytics_daily.visits + excluded.visits;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

revoke all on function private.rollup_analytics_events() from public, anon, authenticated;
grant execute on function private.rollup_analytics_events() to service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('v2-analytics-rollup', '15 3 * * *', 'select private.rollup_analytics_events()');
  else
    raise notice '0053: pg_cron is not available here; analytics rollup skipped';
  end if;
end
$cron$;

-- ================================================================ admin_command_centre

create or replace function public.admin_command_centre(p_days integer default 30) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_days   integer := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_since  timestamptz := date_trunc('day', now() - make_interval(days => (case when p_days in (7, 30, 90) then p_days else 30 end) - 1));
  v_queues jsonb;
  v_traction jsonb;
  v_loop   jsonb;
  v_traffic jsonb;
  v_funnels jsonb;
  v_series jsonb;
  v_hot_boards jsonb;
  v_empty_searches jsonb;
  v_referrers jsonb;
  v_auth_triggers jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in');
  end if;
  if not private.is_platform_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- 1. Action queues
  select jsonb_build_object(
    'pending_products',  (select count(*)::int from public.board where status = 'pending'),
    'pending_companies', (select count(*)::int from public.hub where status = 'pending'),
    'open_reports',      (select count(*)::int from (select distinct target, target_id from public.report where status = 'open') r),
    'open_disputes',     (select count(*)::int from public.ownership_dispute where status = 'pending'),
    'pending_joins',     (select count(*)::int from public.join_request where status = 'pending')
  ) into v_queues;

  -- 2. Traction & D-011 honest split
  select jsonb_build_object(
    'users_total',             (select count(*)::int from public.profile),
    'users_window',            (select count(*)::int from public.profile where created_at >= v_since),
    'member_posts_total',      (select count(*)::int from public.post where author_id is not null and hidden_at is null),
    'member_posts_window',     (select count(*)::int from public.post where author_id is not null and hidden_at is null and created_at >= v_since),
    'imported_posts_total',    (select count(*)::int from public.post where author_id is null and hidden_at is null),
    'replies_total',           (select count(*)::int from public.reply where hidden_at is null),
    'replies_window',          (select count(*)::int from public.reply where hidden_at is null and created_at >= v_since),
    'official_replies_total',  (select count(*)::int from public.reply where is_official and hidden_at is null),
    'official_replies_window', (select count(*)::int from public.reply where is_official and hidden_at is null and created_at >= v_since),
    'votes_total',             (select count(*)::int from public.vote),
    'votes_window',            (select count(*)::int from public.vote where created_at >= v_since),
    'follows_total',           (select count(*)::int from public.follow)
  ) into v_traction;

  -- 3. Feedback-to-response loop
  with visible_posts as (
    select p.id, p.status, p.created_at,
           least(
             (select min(r.created_at) from public.reply r where r.post_id = p.id and r.is_official and r.hidden_at is null),
             (select min(se.at) from public.status_event se where se.post_id = p.id and se."to" <> 'open')
           ) as first_response_at
      from public.post p
      join public.board b on b.id = p.board_id
     where p.hidden_at is null
       and b.status = 'live'
  ),
  status_counts as (
    select
      count(*) filter (where status = 'open')::int as open,
      count(*) filter (where status = 'under_review')::int as under_review,
      count(*) filter (where status = 'planned')::int as planned,
      count(*) filter (where status = 'in_progress')::int as in_progress,
      count(*) filter (where status = 'shipped')::int as shipped,
      count(*) filter (where status = 'closed')::int as closed,
      count(*) filter (where status = 'merged')::int as merged,
      count(*) filter (where first_response_at is not null)::int as responded,
      round(
        (percentile_cont(0.5) within group (
          order by extract(epoch from greatest(first_response_at - created_at, interval '0 seconds')) / 3600.0
        ) filter (where first_response_at is not null))::numeric,
        1
      ) as median_hours
    from visible_posts
  )
  select jsonb_build_object(
    'live_boards',       (select count(*)::int from public.board where status = 'live'),
    'claimed_boards',    (select count(*)::int from public.board b left join public.hub h on h.id = b.hub_id
                           where b.status = 'live' and (b.claimed_at is not null or h.claimed_at is not null)),
    'live_hubs',         (select count(*)::int from public.hub where status = 'live'),
    'claimed_hubs',      (select count(*)::int from public.hub where status = 'live' and claimed_at is not null),
    'responded_posts',   sc.responded,
    'shipped_posts',     sc.shipped,
    'median_first_response_hours', sc.median_hours,
    'by_status', jsonb_build_object(
      'open', sc.open,
      'under_review', sc.under_review,
      'planned', sc.planned,
      'in_progress', sc.in_progress,
      'shipped', sc.shipped,
      'closed', sc.closed,
      'merged', sc.merged
    )
  ) into v_loop
  from status_counts sc;

  -- 4. Traffic & share metrics (raw + daily rollup in window)
  select jsonb_build_object(
    'page_views', (
      (select count(*)::int from private.analytics_event where kind = 'page_view' and at >= v_since) +
      coalesce((select sum(events)::int from private.analytics_daily where kind = 'page_view' and day >= v_since::date), 0)
    ),
    'visits', (
      (select count(distinct visit_id)::int from private.analytics_event where at >= v_since) +
      coalesce((select sum(visits)::int from private.analytics_daily where kind = 'page_view' and day >= v_since::date), 0)
    ),
    'share_unfurls', (
      (select count(*)::int from private.analytics_event where kind = 'share_unfurl' and at >= v_since) +
      coalesce((select sum(events)::int from private.analytics_daily where kind = 'share_unfurl' and day >= v_since::date), 0)
    ),
    'share_clicks', (
      (select count(*)::int from private.analytics_event where kind = 'share_click' and at >= v_since) +
      coalesce((select sum(events)::int from private.analytics_daily where kind = 'share_click' and day >= v_since::date), 0)
    )
  ) into v_traffic;

  -- 5. Funnels (claim, composer, search)
  select jsonb_build_object(
    'claim', jsonb_build_object(
      'open',           (select count(*)::int from private.analytics_event where kind = 'claim_open' and at >= v_since),
      'board_picked',   (select count(*)::int from private.analytics_event where kind = 'claim_board_picked' and at >= v_since),
      'auth_prompt',    (select count(*)::int from private.analytics_event where kind = 'claim_auth_prompt' and at >= v_since),
      'verify_started', (select count(*)::int from private.analytics_event where kind = 'claim_verify_started' and at >= v_since),
      'verify_failed',  (select count(*)::int from private.analytics_event where kind = 'claim_verify_failed' and at >= v_since),
      'completed',      (
        (select count(*)::int from public.board where status = 'live' and claimed_at >= v_since) +
        (select count(*)::int from public.hub where status = 'live' and claimed_at >= v_since)
      )
    ),
    'composer', jsonb_build_object(
      'open',          (select count(*)::int from private.analytics_event where kind = 'composer_open' and at >= v_since),
      'similar_click', (select count(*)::int from private.analytics_event where kind = 'similar_post_click' and at >= v_since),
      'posts_created', (select count(*)::int from public.post where author_id is not null and hidden_at is null and created_at >= v_since)
    ),
    'search', jsonb_build_object(
      'open',  (select count(*)::int from private.analytics_event where kind = 'search_open' and at >= v_since),
      'click', (select count(*)::int from private.analytics_event where kind = 'search_click' and at >= v_since),
      'empty', (select count(*)::int from private.analytics_event where kind = 'search_empty' and at >= v_since)
    )
  ) into v_funnels;

  -- 6. Daily time series across the window
  with days as (
    select generate_series(
      (v_since at time zone 'UTC')::date,
      (now() at time zone 'UTC')::date,
      interval '1 day'
    )::date as d
  ),
  ev_day as (
    select (at at time zone 'UTC')::date as d,
           count(*) filter (where kind = 'page_view')::int as pv,
           count(distinct visit_id)::int as vis
      from private.analytics_event
     where at >= v_since
     group by 1
  ),
  rollup_day as (
    select day as d,
           sum(events) filter (where kind = 'page_view')::int as pv,
           sum(visits) filter (where kind = 'page_view')::int as vis
      from private.analytics_daily
     where day >= (v_since at time zone 'UTC')::date
     group by 1
  ),
  signup_day as (
    select (created_at at time zone 'UTC')::date as d, count(*)::int as n
      from public.profile
     where created_at >= v_since
     group by 1
  ),
  post_day as (
    select (created_at at time zone 'UTC')::date as d, count(*)::int as n
      from public.post
     where author_id is not null and hidden_at is null and created_at >= v_since
     group by 1
  ),
  vote_day as (
    select (created_at at time zone 'UTC')::date as d, count(*)::int as n
      from public.vote
     where created_at >= v_since
     group by 1
  ),
  resp_day as (
    select d, sum(n)::int as n from (
      select (created_at at time zone 'UTC')::date as d, count(*)::int as n
        from public.reply
       where is_official and hidden_at is null and created_at >= v_since
       group by 1
      union all
      select (at at time zone 'UTC')::date as d, count(*)::int as n
        from public.status_event
       where at >= v_since
       group by 1
    ) u group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day',        to_char(days.d, 'YYYY-MM-DD'),
      'visits',     coalesce(ev_day.vis, 0) + coalesce(rollup_day.vis, 0),
      'page_views', coalesce(ev_day.pv, 0) + coalesce(rollup_day.pv, 0),
      'signups',    coalesce(signup_day.n, 0),
      'posts',      coalesce(post_day.n, 0),
      'votes',      coalesce(vote_day.n, 0),
      'responses',  coalesce(resp_day.n, 0)
    ) order by days.d asc
  ), '[]'::jsonb)
  into v_series
  from days
  left join ev_day     on ev_day.d = days.d
  left join rollup_day on rollup_day.d = days.d
  left join signup_day on signup_day.d = days.d
  left join post_day   on post_day.d = days.d
  left join vote_day   on vote_day.d = days.d
  left join resp_day   on resp_day.d = days.d;

  -- 7. Hot unclaimed boards (outreach priority)
  with board_ev as (
    select board_id,
           count(*) filter (where kind = 'page_view')::int as views,
           count(*) filter (where kind = 'claim_open' or kind = 'claim_board_picked')::int as claim_opens
      from private.analytics_event
     where board_id is not null and at >= v_since
     group by board_id
  ),
  board_votes as (
    select p.board_id, count(v.user_id)::int as votes
      from public.post p
      left join public.vote v on v.post_id = p.id
     where p.hidden_at is null
     group by p.board_id
  )
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_hot_boards
  from (
    select b.id, b.slug, b.name, b.color, b.logo_path, b.category,
           coalesce(be.views, 0) as views,
           coalesce(be.claim_opens, 0) as claim_opens,
           b.post_count,
           coalesce(bv.votes, 0) as vote_count
      from public.board b
      left join public.hub h on h.id = b.hub_id
      left join board_ev be on be.board_id = b.id
      left join board_votes bv on bv.board_id = b.id
     where b.status = 'live'
       and b.claimed_at is null
       and (h.id is null or h.claimed_at is null)
     order by (coalesce(be.views, 0) + coalesce(be.claim_opens, 0) * 5 + b.post_count * 3 + coalesce(bv.votes, 0)) desc,
              b.follower_count desc,
              b.name asc
     limit 8
  ) t;

  -- 8. Unmet search demand (zero-result queries)
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_empty_searches
  from (
    select lower(left(btrim(meta->>'q'), 60)) as query,
           count(*)::int as count,
           max(at) as last_at
      from private.analytics_event
     where kind = 'search_empty'
       and at >= v_since
       and nullif(btrim(coalesce(meta->>'q', '')), '') is not null
     group by 1
     order by count(*) desc, max(at) desc
     limit 8
  ) t;

  -- 9. Top external referrers
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_referrers
  from (
    select referrer_host as host,
           count(*)::int as views,
           count(distinct visit_id)::int as visits
      from private.analytics_event
     where referrer_host is not null
       and at >= v_since
     group by referrer_host
     order by count(*) desc, referrer_host asc
     limit 8
  ) t;

  -- 10. Auth triggers & expired links
  select jsonb_build_object(
    'expired_links', (select count(*)::int from private.analytics_event where kind = 'auth_link_expired' and at >= v_since),
    'triggers', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb)
      from (
        select coalesce(nullif(left(btrim(meta->>'trigger'), 40), ''), 'nav') as trigger,
               count(*)::int as count
          from private.analytics_event
         where kind = 'auth_open' and at >= v_since
         group by 1
         order by count(*) desc, 1 asc
         limit 6
      ) t
    ), '[]'::jsonb)
  ) into v_auth_triggers;

  return jsonb_build_object(
    'ok',                  true,
    'days',                v_days,
    'generated_at',        now(),
    'queues',              v_queues,
    'traction',            v_traction,
    'loop',                v_loop,
    'traffic',             v_traffic,
    'funnels',             v_funnels,
    'series',              v_series,
    'hot_unclaimed_boards', v_hot_boards,
    'empty_searches',      v_empty_searches,
    'referrers',           v_referrers,
    'auth_triggers',       v_auth_triggers
  );
end
$$;

revoke all on function public.admin_command_centre(integer) from public, anon;
grant execute on function public.admin_command_centre(integer) to authenticated, service_role;
