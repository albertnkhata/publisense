-- /admin Command Centre & first-party analytics (0053, docs/v2/COMMAND_CENTRE.md).
-- Runs as the real API roles inside a transaction that ROLLS BACK.
--
-- Checks:
--   * private.analytics_event and private.analytics_daily cannot be queried directly
--     by anon or authenticated.
--   * public.record_event accepts valid events for anon and authenticated, sanitises
--     referrer_host to external domain only, drops unknown kinds, drops non-object or
--     >512-byte meta payloads, ignores non-live board/hub IDs, and enforces the
--     per-visit 60/minute rate limit.
--   * public.admin_command_centre is not executable by anon, returns not_allowed for
--     ordinary signed-in members, and returns the full telemetry + D-011 split for
--     platform_admin.
--   * private.rollup_analytics_events aggregates events older than 30 days into
--     private.analytics_daily and removes the raw rows.

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
         gen_random_uuid() as visit2;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select staff, 'staff-' || left(staff::text, 8) || '@cc53.test', now(), '{"full_name":"Staff"}'::jsonb from f
union all
select member, 'mem-' || left(member::text, 8) || '@cc53.test', now(), '{"full_name":"Member"}'::jsonb from f;

insert into public.platform_admin (user_id, granted_by)
select staff, staff from f;

insert into public.board (id, slug, name, site, status, claimed_at)
select board_unclaimed, 'cc53live', 'CC Live Board', 'cc53live.test', 'live', null::timestamptz from f
union all
select board_pending, 'cc53pend', 'CC Pending Board', 'cc53pend.test', 'pending', null::timestamptz from f;

-- 1 member post + 1 imported (seeded) post to verify D-011 split
insert into public.post (board_id, author_id, source_url, type, title, body)
select board_unclaimed, member, null::text, 'feature'::public.v2_post_type, 'Member feedback post', 'Body' from f
union all
select board_unclaimed, null::uuid, 'https://github.com/example/repo/issues/1', 'bug'::public.v2_post_type, 'Imported feedback post', 'Seeded' from f;

-- ------------------------------------------------------------ table & function grants

select pg_temp.expect('0053: anon cannot read private.analytics_event',
  not has_table_privilege('anon', 'private.analytics_event', 'select'));
select pg_temp.expect('0053: authenticated cannot read private.analytics_event',
  not has_table_privilege('authenticated', 'private.analytics_event', 'select'));
select pg_temp.expect('0053: anon cannot execute admin_command_centre',
  not has_function_privilege('anon', 'public.admin_command_centre(integer)', 'execute'));
select pg_temp.expect('0053: authenticated cannot execute private.rollup_analytics_events',
  not has_function_privilege('authenticated', 'private.rollup_analytics_events()', 'execute'));

-- ------------------------------------------------------------ record_event as anon

select pg_temp.as_user(null);

select public.record_event(
  (select visit1 from f),
  'page_view',
  '/b/cc53live',
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
select public.record_event((select visit1 from f), 'claim_open', '/b/cc53pend', (select board_pending from f), null, null, '{}'::jsonb);

select pg_temp.as_owner();

select pg_temp.expect('0053: valid events recorded, invalid kind and oversized meta dropped',
  (select count(*) = 3 from private.analytics_event));
select pg_temp.expect('0053: referrer_host stripped to lowercase external hostname only',
  (select referrer_host = 'news.ycombinator.com' from private.analytics_event where kind = 'page_view'));
select pg_temp.expect('0053: same-origin referrer_host scrubbed to null',
  (select referrer_host is null from private.analytics_event where kind = 'search_empty'));
select pg_temp.expect('0053: pending board_id scrubbed to null on event',
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

select pg_temp.expect('0053: per-visit rate limit caps at 60 events per minute',
  (select count(*) = 60 from private.analytics_event where visit_id = (select visit2 from f)));

-- ------------------------------------------------------------ admin_command_centre guard & payload

select pg_temp.as_user((select member from f));
select pg_temp.expect('0053: ordinary member gets not_allowed from admin_command_centre',
  (select (public.admin_command_centre(30)->>'error') = 'not_allowed'));

select pg_temp.as_user((select staff from f));
create temp table cc_res as select public.admin_command_centre(30) as body;

select pg_temp.expect('0053: platform_admin gets ok=true from admin_command_centre',
  (select (body->>'ok')::boolean from cc_res));
select pg_temp.expect('0053: traction separates member_posts_total from imported_posts_total (D-011)',
  (select (body->'traction'->>'member_posts_total')::int >= 1
      and (body->'traction'->>'imported_posts_total')::int >= 1 from cc_res));
select pg_temp.expect('0053: empty_searches normalises query and counts occurrences',
  (select exists (
    select 1 from jsonb_array_elements((select body->'empty_searches' from cc_res)) e
     where e->>'query' = 'raycast' and (e->>'count')::int = 1
  )));
select pg_temp.expect('0053: referrers lists external hostname',
  (select exists (
    select 1 from jsonb_array_elements((select body->'referrers' from cc_res)) r
     where r->>'host' = 'news.ycombinator.com'
  )));
select pg_temp.expect('0053: series has 30 daily buckets',
  (select jsonb_array_length(body->'series') = 30 from cc_res));

-- ------------------------------------------------------------ rollup_analytics_events

select pg_temp.as_owner();
insert into private.analytics_event (visit_id, kind, path, at)
select visit1, 'page_view', '/old', now() - interval '35 days' from f;

select pg_temp.expect('0053: rollup moves >30d events into analytics_daily',
  private.rollup_analytics_events() >= 1);
select pg_temp.expect('0053: rollup removes old raw rows and writes analytics_daily', (select count(*) = 0 from private.analytics_event where path = '/old')
  and (select sum(events) >= 1 from private.analytics_daily where kind = 'page_view'));

rollback;
