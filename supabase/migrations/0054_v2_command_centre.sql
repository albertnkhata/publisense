-- 0054: /admin Command Centre & first-party analytics (docs/v2/COMMAND_CENTRE.md).
--
-- Adds:
--   1. private.analytics_event & private.analytics_daily: cookieless first-party
--      usage events grouped by a temporary per-tab visit token (no user id, email
--      or IP), stored in `private` (never exposed as PostgREST tables).
--   2. public.record_event(...): SECURITY DEFINER write RPC callable by anon and
--      authenticated. Enforces an explicit allow-list of 15 event kinds, a meta
--      whitelist (q for search_empty, trigger for auth_open; everything else is
--      stripped), drops search terms that look like an email or phone number,
--      keeps hostname-only referrers, and rate-limits: 60/min and 120/5 min per
--      visit token (share_unfurl exempt; it gets a fresh server-side token per
--      unfurl) plus 600/min globally, silently dropping anything invalid or over
--      budget.
--   3. private.rollup_analytics_events(): rolls raw events older than 30 days into
--      private.analytics_daily (per-day buckets plus a per-day 'visit' total) and
--      prunes the raw rows; returns the number of raw rows deleted. Scheduled
--      nightly via pg_cron when the extension is available.
--   4. public.admin_command_centre(p_days int): SECURITY DEFINER read RPC guarded by
--      private.is_platform_admin(auth.uid()), returning action queues, D-011 honest
--      member vs. imported post traction split, feedback-loop velocity, traffic,
--      funnels, daily series, hot unclaimed boards, referrers, auth triggers and
--      unmet search demand. Older days come from analytics_daily, newer days from
--      raw events, with no overlap; empty-search terms are raw-only (30 days).
--
-- No schema grants change here: `private` usage was granted in 0042/0047.
-- Rollback: supabase/rollback/0054_down.sql.

create schema if not exists private;

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

-- board_id is a plain uuid with no foreign key on purpose: an ON DELETE SET NULL
-- here would collide with an existing null-board bucket in the unique index below
-- and make board deletion fail. Rows for a deleted board simply stop joining.
-- kind 'visit' is a per-day total (board/referrer/detail null): events = all events
-- that day, visits = distinct visit tokens that day.
-- detail holds the auth_open trigger so sign-in triggers survive the rollup.
create table if not exists private.analytics_daily (
  day           date not null,
  kind          text not null,
  board_id      uuid,
  referrer_host text,
  detail        text check (detail is null or char_length(detail) <= 40),
  events        integer not null default 0,
  visits        integer not null default 0
);

create unique index if not exists analytics_daily_bucket_idx
  on private.analytics_daily (day, kind, coalesce(board_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(referrer_host, ''), coalesce(detail, ''));

revoke all on table private.analytics_event, private.analytics_daily from public, anon, authenticated;
grant all on table private.analytics_event, private.analytics_daily to service_role;
grant usage, select on sequence private.analytics_event_id_seq to service_role;

-- ================================================================ record_event

-- True when a search term looks like contact details (an email or a phone-like run
-- of 7+ digits) and must never be stored. Mirrors looksPersonal() in
-- web/src/api/analytics.ts.
create or replace function private.analytics_term_is_personal(p_q text) returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_q is not null and (
    position('@' in p_q) > 0
    or p_q ~* '[a-z0-9._%+-]+\s*(\(at\)|\[at\])\s*[a-z0-9-]+\.[a-z]{2,}'
    or exists (
      select 1 from regexp_matches(p_q, '\+?\(?[0-9][0-9 ().-]{5,}[0-9]', 'g') m
       where length(regexp_replace(m[1], '[^0-9]', '', 'g')) >= 7
    )
  )
$$;

revoke all on function private.analytics_term_is_personal(text) from public, anon, authenticated;

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

  -- Meta whitelist: only q (search_empty) and trigger (auth_open) are kept, clamped.
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

-- ================================================================ rollup & retention

-- auth_open's trigger, the only meta kept after rollup.
create or replace function private.analytics_detail(p_kind text, p_meta jsonb) returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case when p_kind = 'auth_open'
              then coalesce(nullif(left(btrim(p_meta->>'trigger'), 40), ''), 'nav')
         end
$$;

revoke all on function private.analytics_detail(text, jsonb) from public, anon, authenticated;

-- Returns the number of raw rows deleted (and rolled into analytics_daily).
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

revoke all on function private.rollup_analytics_events() from public, anon, authenticated;
grant execute on function private.rollup_analytics_events() to service_role;

-- One row per (UTC day, kind, board, referrer, detail) across the window: days the
-- rollup has already absorbed come from analytics_daily, later days from raw
-- events. The split is the day after the newest rolled-up day, and the rollup
-- deletes every raw row before it, so the two sources never overlap. Raw rows are
-- grouped per day, so `visits` is distinct visit tokens per day in both sources
-- (kind 'visit' carries the per-day total across all kinds).
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
   group by r.d
$$;

revoke all on function private.analytics_buckets(timestamptz) from public, anon, authenticated;
grant execute on function private.analytics_buckets(timestamptz) to service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('v2-analytics-rollup', '15 3 * * *', 'select private.rollup_analytics_events()');
  else
    raise notice '0054: pg_cron is not available here; analytics rollup skipped';
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

  -- 4. Traffic & share metrics. Every analytics figure below reads
  --    private.analytics_buckets(): analytics_daily for days the rollup has absorbed,
  --    raw events after that, never both. Visits = distinct visit tokens per UTC day,
  --    summed over the window (a tab open across midnight counts on each day).
  select jsonb_build_object(
    'page_views',    coalesce(sum(events) filter (where kind = 'page_view'), 0)::int,
    'visits',        coalesce(sum(visits) filter (where kind = 'visit'), 0)::int,
    'share_unfurls', coalesce(sum(events) filter (where kind = 'share_unfurl'), 0)::int,
    'share_clicks',  coalesce(sum(events) filter (where kind = 'share_click'), 0)::int
  ) into v_traffic
  from private.analytics_buckets(v_since);

  -- 5. Funnels (claim, composer, search)
  with k as (
    select kind, sum(events)::int as n from private.analytics_buckets(v_since) group by kind
  )
  select jsonb_build_object(
    'claim', jsonb_build_object(
      'open',           coalesce((select n from k where kind = 'claim_open'), 0),
      'board_picked',   coalesce((select n from k where kind = 'claim_board_picked'), 0),
      'auth_prompt',    coalesce((select n from k where kind = 'claim_auth_prompt'), 0),
      'verify_started', coalesce((select n from k where kind = 'claim_verify_started'), 0),
      'verify_failed',  coalesce((select n from k where kind = 'claim_verify_failed'), 0),
      'completed',      (
        (select count(*)::int from public.board where status = 'live' and claimed_at >= v_since) +
        (select count(*)::int from public.hub where status = 'live' and claimed_at >= v_since)
      )
    ),
    'composer', jsonb_build_object(
      'open',          coalesce((select n from k where kind = 'composer_open'), 0),
      'similar_click', coalesce((select n from k where kind = 'similar_post_click'), 0),
      'posts_created', (select count(*)::int from public.post where author_id is not null and hidden_at is null and created_at >= v_since)
    ),
    'search', jsonb_build_object(
      'open',  coalesce((select n from k where kind = 'search_open'), 0),
      'click', coalesce((select n from k where kind = 'search_click'), 0),
      'empty', coalesce((select n from k where kind = 'search_empty'), 0)
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
    select day as d,
           coalesce(sum(events) filter (where kind = 'page_view'), 0)::int as pv,
           coalesce(sum(visits) filter (where kind = 'visit'), 0)::int as vis
      from private.analytics_buckets(v_since)
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
      'visits',     coalesce(ev_day.vis, 0),
      'page_views', coalesce(ev_day.pv, 0),
      'signups',    coalesce(signup_day.n, 0),
      'posts',      coalesce(post_day.n, 0),
      'votes',      coalesce(vote_day.n, 0),
      'responses',  coalesce(resp_day.n, 0)
    ) order by days.d asc
  ), '[]'::jsonb)
  into v_series
  from days
  left join ev_day     on ev_day.d = days.d
  left join signup_day on signup_day.d = days.d
  left join post_day   on post_day.d = days.d
  left join vote_day   on vote_day.d = days.d
  left join resp_day   on resp_day.d = days.d;

  -- 7. Hot unclaimed boards (outreach priority)
  with board_ev as (
    select board_id,
           coalesce(sum(events) filter (where kind = 'page_view'), 0)::int as views,
           coalesce(sum(events) filter (where kind in ('claim_open', 'claim_board_picked')), 0)::int as claim_opens
      from private.analytics_buckets(v_since)
     where board_id is not null and kind <> 'visit'
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

  -- 8. Unmet search demand (zero-result queries). Raw-only by design: search terms
  --    are never rolled up, so this covers at most the last 30 days.
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

  -- 9. Top external referrers (visits = per-day distinct visit tokens, summed)
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_referrers
  from (
    select referrer_host as host,
           sum(events)::int as views,
           sum(visits)::int as visits
      from private.analytics_buckets(v_since)
     where referrer_host is not null
       and kind <> 'visit'
     group by referrer_host
     order by sum(events) desc, referrer_host asc
     limit 8
  ) t;

  -- 10. Auth triggers & expired links
  select jsonb_build_object(
    'expired_links', coalesce((select sum(events)::int from private.analytics_buckets(v_since) where kind = 'auth_link_expired'), 0),
    'triggers', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb)
      from (
        select coalesce(detail, 'nav') as trigger,
               sum(events)::int as count
          from private.analytics_buckets(v_since)
         where kind = 'auth_open'
         group by 1
         order by sum(events) desc, 1 asc
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
