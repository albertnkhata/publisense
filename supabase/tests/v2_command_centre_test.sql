-- /admin Command Centre & first-party analytics (0054, docs/v2/COMMAND_CENTRE.md).
-- Runs as the real API roles inside a transaction that ROLLS BACK.
--
-- Checks:
--   * private.analytics_event and private.analytics_daily cannot be queried directly
--     by anon or authenticated.
--   * public.record_event accepts valid events for anon and authenticated, sanitises
--     referrer_host to external domain only, drops unknown kinds, drops non-object or
--     >512-byte meta payloads, keeps only whitelisted meta keys (q for search_empty,
--     trigger for auth_open) clamped, drops search terms under 3 characters or that
--     look like an email/phone number, ignores non-live board/hub IDs, and enforces
--     the per-visit 60/minute and 120/5-minute limits (share_unfurl exempt).
--   * public.admin_command_centre is not executable by anon, returns not_allowed for
--     ordinary signed-in members, and returns the full telemetry + D-011 split for
--     platform_admin.
--   * private.rollup_analytics_events aggregates events older than 30 days into
--     private.analytics_daily, removes the raw rows and returns how many it deleted.
--   * Deleting a board with rollup rows succeeds even when a null-board bucket for
--     the same day already exists (no FK on analytics_daily.board_id).
--   * The 90-day view reads analytics_daily for rolled-up days (traffic, visits,
--     funnels, referrers, hot boards, auth triggers) with no raw/rollup overlap.

\set ON_ERROR_STOP 1
begin;
set local statement_timeout = '60s';

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
  end if;
end $$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

-- ------------------------------------------------------------ fixtures

delete from private.analytics_event;
delete from private.analytics_daily;

create temp table f as
  select gen_random_uuid() as staff,
         gen_random_uuid() as member,
         gen_random_uuid() as board_unclaimed,
         gen_random_uuid() as board_pending,
         gen_random_uuid() as visit1,
         gen_random_uuid() as visit2,
         gen_random_uuid() as visit3,
         gen_random_uuid() as visit4,
         gen_random_uuid() as board_del;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select staff, 'staff-' || left(staff::text, 8) || '@cc54.test', now(), '{"full_name":"Staff"}'::jsonb from f
union all
select member, 'mem-' || left(member::text, 8) || '@cc54.test', now(), '{"full_name":"Member"}'::jsonb from f;

insert into public.platform_admin (user_id, granted_by)
select staff, staff from f;

insert into public.board (id, slug, name, site, status, claimed_at)
select board_unclaimed, 'cc54live', 'CC Live Board', 'cc54live.test', 'live', null::timestamptz from f
union all
select board_pending, 'cc54pend', 'CC Pending Board', 'cc54pend.test', 'pending', null::timestamptz from f
union all
select board_del, 'cc54del', 'CC Deleted Board', 'cc54del.test', 'live', null::timestamptz from f;

-- 1 member post + 1 imported (seeded) post to verify D-011 split
insert into public.post (board_id, author_id, source_url, type, title, body)
select board_unclaimed, member, null::text, 'feature'::public.v2_post_type, 'Member feedback post', 'Body' from f
union all
select board_unclaimed, null::uuid, 'https://github.com/example/repo/issues/1', 'bug'::public.v2_post_type, 'Imported feedback post', 'Seeded' from f;

-- ------------------------------------------------------------ table & function grants

select pg_temp.expect('0054: anon cannot read private.analytics_event',
  not has_table_privilege('anon', 'private.analytics_event', 'select'));
select pg_temp.expect('0054: authenticated cannot read private.analytics_event',
  not has_table_privilege('authenticated', 'private.analytics_event', 'select'));
select pg_temp.expect('0054: anon cannot execute admin_command_centre',
  not has_function_privilege('anon', 'public.admin_command_centre(integer)', 'execute'));
select pg_temp.expect('0054: authenticated cannot execute private.rollup_analytics_events',
  not has_function_privilege('authenticated', 'private.rollup_analytics_events()', 'execute'));

-- ------------------------------------------------------------ record_event as anon

select pg_temp.as_user(null);

select public.record_event(
  (select visit1 from f),
  'page_view',
  '/b/cc54live',
  (select board_unclaimed from f),
  null,
  'https://www.News.YCombinator.com/item?id=123',
  '{"vp":"lg","theme":"dark"}'::jsonb
);

select public.record_event(
  (select visit1 from f),
  'search_empty',
  '/explore',
  null,
  null,
  'https://publisense.app/explore',
  '{"q":"  Raycast  "}'::jsonb
);

-- Invalid kind, oversized meta, pending board id: all silently dropped or scrubbed
select public.record_event((select visit1 from f), 'not_a_real_kind', '/', null, null, null, '{}'::jsonb);
select public.record_event((select visit1 from f), 'page_view', '/', null, null, null, jsonb_build_object('big', repeat('x', 600)));
select public.record_event((select visit1 from f), 'claim_open', '/b/cc54pend', (select board_pending from f), null, null, '{}'::jsonb);

select pg_temp.as_owner();

select pg_temp.expect('0054: valid events recorded, invalid kind and oversized meta dropped',
  (select count(*) = 3 from private.analytics_event));
select pg_temp.expect('0054: referrer_host stripped to lowercase external hostname only',
  (select referrer_host = 'news.ycombinator.com' from private.analytics_event where kind = 'page_view'));
select pg_temp.expect('0054: same-origin referrer_host scrubbed to null',
  (select referrer_host is null from private.analytics_event where kind = 'search_empty'));
select pg_temp.expect('0054: pending board_id scrubbed to null on event',
  (select board_id is null from private.analytics_event where kind = 'claim_open'));

-- Per-visit rate limit: 60 events/minute cap
do $$
declare
  i int;
  v uuid := (select visit2 from f);
begin
  perform pg_temp.as_user(null);
  for i in 1..70 loop
    perform public.record_event(v, 'page_view', '/', null, null, null, '{}'::jsonb);
  end loop;
  perform pg_temp.as_owner();
end $$;

select pg_temp.expect('0054: per-visit rate limit caps at 60 events per minute',
  (select count(*) = 60 from private.analytics_event where visit_id = (select visit2 from f)));

-- ------------------------------------------------------------ admin_command_centre guard & payload

select pg_temp.as_user((select member from f));
select pg_temp.expect('0054: ordinary member gets not_allowed from admin_command_centre',
  (select (public.admin_command_centre(30)->>'error') = 'not_allowed'));

select pg_temp.as_user((select staff from f));
create temp table cc_res as select public.admin_command_centre(30) as body;

select pg_temp.expect('0054: platform_admin gets ok=true from admin_command_centre',
  (select (body->>'ok')::boolean from cc_res));
select pg_temp.expect('0054: traction separates member_posts_total from imported_posts_total (D-011)',
  (select (body->'traction'->>'member_posts_total')::int >= 1
      and (body->'traction'->>'imported_posts_total')::int >= 1 from cc_res));
select pg_temp.expect('0054: empty_searches normalises query and counts occurrences',
  (select exists (
    select 1 from jsonb_array_elements((select body->'empty_searches' from cc_res)) e
     where e->>'query' = 'raycast' and (e->>'count')::int = 1
  )));
select pg_temp.expect('0054: referrers lists external hostname',
  (select exists (
    select 1 from jsonb_array_elements((select body->'referrers' from cc_res)) r
     where r->>'host' = 'news.ycombinator.com'
  )));
select pg_temp.expect('0054: series has 30 daily buckets',
  (select jsonb_array_length(body->'series') = 30 from cc_res));


-- ------------------------------------------------------------ meta whitelist & search-term filter

select pg_temp.as_owner();
delete from private.analytics_event;
select pg_temp.as_user(null);
select public.record_event((select visit1 from f), 'page_view', '/', null, null, null, '{"vp":"lg","theme":"dark"}'::jsonb);
select public.record_event((select visit1 from f), 'auth_open', '/', null, null, null,
  jsonb_build_object('trigger', repeat('v', 50), 'email', 'x@y.test'));
select public.record_event((select visit1 from f), 'claim_verify_failed', '/', null, null, null, '{"reason":"dns_missing"}'::jsonb);
select public.record_event((select visit1 from f), 'search_empty', '/', null, null, null, '{"q":"linear app","extra":"drop me"}'::jsonb);
select public.record_event((select visit1 from f), 'search_empty', '/', null, null, null, '{"q":"ab"}'::jsonb);
select public.record_event((select visit1 from f), 'search_empty', '/', null, null, null, '{"q":"jane@example.com"}'::jsonb);
select public.record_event((select visit1 from f), 'search_empty', '/', null, null, null, '{"q":"call +260 97 640 4079"}'::jsonb);
select public.record_event((select visit1 from f), 'search_empty', '/', null, null, null, '{"q":"0976-404-079"}'::jsonb);
select public.record_event((select visit1 from f), 'search_empty', '/', null, null, null, '{"q":"jane (at) example.com"}'::jsonb);
select public.record_event((select visit1 from f), 'search_empty', '/', null, null, null, '{"q":"ipad 2024 vs 2025"}'::jsonb);
select pg_temp.as_owner();

select pg_temp.expect('0054: page_view meta stripped to {}',
  (select meta = '{}'::jsonb from private.analytics_event where kind = 'page_view'));
select pg_temp.expect('0054: auth_open keeps only trigger, clamped to 40 chars',
  (select meta = jsonb_build_object('trigger', repeat('v', 40)) from private.analytics_event where kind = 'auth_open'));
select pg_temp.expect('0054: claim_verify_failed meta stripped',
  (select meta = '{}'::jsonb from private.analytics_event where kind = 'claim_verify_failed'));
select pg_temp.expect('0054: search_empty keeps only q',
  (select count(*) = 1 from private.analytics_event where kind = 'search_empty' and meta = '{"q":"linear app"}'::jsonb));
select pg_temp.expect('0054: short, email-like and phone-like search terms are dropped; ordinary numbers kept',
  (select array_agg(meta->>'q' order by id) = array['linear app', 'ipad 2024 vs 2025']
     from private.analytics_event where kind = 'search_empty'));

-- ------------------------------------------------------------ 5-minute cap & share_unfurl exemption

delete from private.analytics_event;
insert into private.analytics_event (visit_id, kind, path, at)
select (select visit3 from f), 'page_view', '/', now() - interval '3 minutes' from generate_series(1, 100);
do $$
declare i int;
begin
  perform pg_temp.as_user(null);
  for i in 1..30 loop
    perform public.record_event((select visit3 from f), 'page_view', '/', null, null, null, '{}'::jsonb);
  end loop;
  perform pg_temp.as_owner();
end $$;
select pg_temp.expect('0054: per-visit cap of 120 events per 5 minutes',
  (select count(*) = 120 from private.analytics_event where visit_id = (select visit3 from f)));

do $$
declare i int;
begin
  perform pg_temp.as_user(null);
  for i in 1..60 loop
    perform public.record_event((select visit4 from f), 'page_view', '/', null, null, null, '{}'::jsonb);
  end loop;
  perform public.record_event((select visit4 from f), 'page_view', '/', null, null, null, '{}'::jsonb);
  perform public.record_event((select visit4 from f), 'share_unfurl', '/b/cc54live', null, null, null, '{}'::jsonb);
  perform pg_temp.as_owner();
end $$;
select pg_temp.expect('0054: share_unfurl is exempt from the per-visit cap',
  (select count(*) filter (where kind = 'page_view') = 60 and count(*) filter (where kind = 'share_unfurl') = 1
     from private.analytics_event where visit_id = (select visit4 from f)));

-- ------------------------------------------------------------ rollup_analytics_events

select pg_temp.as_owner();
delete from private.analytics_event;
delete from private.analytics_daily;

-- Old raw rows (35 and 40 days ago) for two visits, including funnel, referrer,
-- board and auth-trigger events.
insert into private.analytics_event (visit_id, kind, board_id, path, referrer_host, meta, at)
select visit1, 'page_view', board_unclaimed, '/old', 'old.example.com', '{}'::jsonb, now() - interval '35 days' from f
union all select visit1, 'claim_open', board_unclaimed, '/old', null, '{}'::jsonb, now() - interval '35 days' from f
union all select visit2, 'page_view', null, '/old', null, '{}'::jsonb, now() - interval '35 days' from f
union all select visit2, 'auth_open', null, '/old', null, '{"trigger":"vote"}'::jsonb, now() - interval '40 days' from f
union all select visit2, 'search_empty', null, '/old', null, '{"q":"old term"}'::jsonb, now() - interval '40 days' from f;
-- Recent raw rows (today) for one visit.
insert into private.analytics_event (visit_id, kind, path, at)
select visit3, 'page_view', '/new', now() from f
union all select visit3, 'page_view', '/new2', now() from f;

select pg_temp.expect('0054: rollup returns the number of raw rows deleted',
  private.rollup_analytics_events() = 5);
select pg_temp.expect('0054: rollup removes old raw rows and writes analytics_daily',
  (select count(*) = 0 from private.analytics_event where path = '/old')
  and (select count(*) = 2 from private.analytics_event)
  and (select sum(events) = 2 from private.analytics_daily where kind = 'page_view'));
select pg_temp.expect('0054: rollup writes a per-day visit total',
  (select sum(visits) = 3 from private.analytics_daily where kind = 'visit'));
select pg_temp.expect('0054: rollup keeps the auth_open trigger and drops search terms',
  (select count(*) = 1 from private.analytics_daily where kind = 'auth_open' and detail = 'vote')
  and (select count(*) = 1 from private.analytics_daily where kind = 'search_empty' and detail is null));
select pg_temp.expect('0054: re-running the rollup deletes nothing',
  private.rollup_analytics_events() = 0);

-- ------------------------------------------------------------ 90d window reads rollups, no overlap

select pg_temp.as_user((select staff from f));
create temp table cc90 as select public.admin_command_centre(90) as body;
create temp table cc30 as select public.admin_command_centre(30) as body;
select pg_temp.as_owner();

select pg_temp.expect('0054: 90d page views = rolled-up + raw, no overlap',
  (select (body->'traffic'->>'page_views')::int = 4 from cc90));
select pg_temp.expect('0054: 90d visits = per-day visit totals (3 rolled-up + 1 raw)',
  (select (body->'traffic'->>'visits')::int = 4 from cc90));
select pg_temp.expect('0054: 30d visits read raw only',
  (select (body->'traffic'->>'visits')::int = 1 and (body->'traffic'->>'page_views')::int = 2 from cc30));
select pg_temp.expect('0054: series visits sum to the traffic total',
  (select sum((p->>'visits')::int) = 4 from cc90, jsonb_array_elements(body->'series') p));
select pg_temp.expect('0054: 90d funnel counts rolled-up claim opens',
  (select (body->'funnels'->'claim'->>'open')::int = 1 from cc90)
  and (select (body->'funnels'->'claim'->>'open')::int = 0 from cc30));
select pg_temp.expect('0054: 90d referrers include rolled-up hosts',
  exists (select 1 from cc90, jsonb_array_elements(body->'referrers') r where r->>'host' = 'old.example.com' and (r->>'views')::int = 1));
select pg_temp.expect('0054: 90d auth triggers include rolled-up triggers',
  exists (select 1 from cc90, jsonb_array_elements(body->'auth_triggers'->'triggers') t where t->>'trigger' = 'vote' and (t->>'count')::int = 1));
select pg_temp.expect('0054: 90d hot boards count rolled-up views and claim opens',
  exists (select 1 from cc90, jsonb_array_elements(body->'hot_unclaimed_boards') b
           where b->>'slug' = 'cc54live' and (b->>'views')::int = 1 and (b->>'claim_opens')::int = 1));
select pg_temp.expect('0054: empty searches stay raw-only',
  (select jsonb_array_length(body->'empty_searches') = 0 from cc90));

-- ------------------------------------------------------------ board deletion with rollup rows

-- A null-board bucket and a board bucket for the same day, plus a raw row for the
-- board that the rollup will later fold into the null bucket.
insert into private.analytics_daily (day, kind, board_id, referrer_host, events, visits)
select current_date - 45, 'page_view', null, null, 3, 2 from f
union all
select current_date - 45, 'page_view', board_del, null, 4, 1 from f;
insert into private.analytics_event (visit_id, kind, board_id, path, at)
select visit1, 'page_view', board_del, '/b/cc54del', (current_date - 33)::timestamp at time zone 'UTC' + interval '1 hour' from f;
insert into private.analytics_daily (day, kind, board_id, referrer_host, events, visits)
select current_date - 33, 'page_view', null, null, 1, 1 from f;

delete from public.board where id = (select board_del from f);
select pg_temp.expect('0054: deleting a board with rollup rows succeeds when a null-board bucket exists',
  not exists (select 1 from public.board where id = (select board_del from f)));
select pg_temp.expect('0054: raw events for the deleted board lose their board_id',
  (select board_id is null from private.analytics_event where path = '/b/cc54del'));
select pg_temp.expect('0054: rollup of the orphaned raw row deletes 1 row',
  private.rollup_analytics_events() = 1);
select pg_temp.expect('0054: rollup merges it into the existing null-board bucket',
  (select events = 2 from private.analytics_daily where day = current_date - 33 and kind = 'page_view' and board_id is null));

rollback;
