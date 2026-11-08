-- Team webhooks (0064): permissions (only scope admin/owner), URL validation,
-- test webhook, post.created and post.status_changed dispatch for board and hub.
-- Stubs pg_net inside a transaction that ROLLS BACK.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_team_webhooks_test.sql

\set ON_ERROR_STOP 1
begin;
set local statement_timeout = '60s';

create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
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

do $stub$
begin
  if to_regnamespace('net') is not null then
    raise exception 'this test stubs pg_net; run it only on the CI database';
  end if;
end
$stub$;
create schema net;
create table net.sent (id bigserial primary key, url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int)
returns bigint language sql as $$
  insert into net.sent (url, headers, body) values (url, headers, body) returning id;
$$;

-- ------------------------------------------------------------ fixtures

create temp table f as
  select gen_random_uuid() as admin_u,
         gen_random_uuid() as member_u,
         gen_random_uuid() as stranger_u,
         gen_random_uuid() as hub_id,
         gen_random_uuid() as board_id;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select admin_u, 'wh-admin-' || left(admin_u::text, 8) || '@wh-ci.dev', now(), '{"full_name":"Admin"}'::jsonb from f
union all select member_u, 'wh-mem-' || left(member_u::text, 8) || '@wh-ci.dev', now(), '{"full_name":"Mem"}'::jsonb from f
union all select stranger_u, 'wh-str-' || left(stranger_u::text, 8) || '@wh-ci.dev', now(), '{"full_name":"Str"}'::jsonb from f;

insert into public.hub (id, slug, name, status, claimed_at)
select hub_id, 'wh-hub-' || left(hub_id::text, 8), 'Webhook Hub', 'live', now() from f;

insert into public.board (id, slug, name, tagline, site, category, hub_id, status, claimed_at)
select board_id, 'wh-board-' || left(board_id::text, 8), 'Webhook Board', 'Testing webhooks', 'wh-board-ci.dev', 'dev', hub_id, 'live', now() from f;

insert into public.membership (user_id, scope, scope_id, role)
select admin_u, 'board'::public.v2_scope, board_id, 'admin'::public.v2_role from f
union all select admin_u, 'hub'::public.v2_scope, hub_id, 'owner'::public.v2_role from f
union all select member_u, 'board'::public.v2_scope, board_id, 'member'::public.v2_role from f;

-- ------------------------------------------------------------ permissions & validation

select pg_temp.as_user((select stranger_u from f));
select pg_temp.expect('0064: stranger cannot read or set board webhook',
  (select (public.get_scope_webhook('board', board_id) ->> 'error') = 'not_allowed'
      and (public.set_scope_webhook('board', board_id, 'slack', 'https://hooks.slack.com/services/T00/B00/X00') ->> 'error') = 'not_allowed'
     from f));

select pg_temp.as_user((select member_u from f));
select pg_temp.expect('0064: regular team member cannot read or set board webhook',
  (select (public.get_scope_webhook('board', board_id) ->> 'error') = 'not_allowed'
      and (public.set_scope_webhook('board', board_id, 'slack', 'https://hooks.slack.com/services/T00/B00/X00') ->> 'error') = 'not_allowed'
     from f));

select pg_temp.as_user((select admin_u from f));
select pg_temp.expect('0064: rejects non-HTTPS or localhost webhook URLs and unknown kinds',
  (select (public.set_scope_webhook('board', board_id, 'slack', 'http://hooks.slack.com/services/T00') ->> 'error') = 'invalid_webhook_url'
      and (public.set_scope_webhook('board', board_id, 'slack', 'https://localhost/hook') ->> 'error') = 'invalid_webhook_url'
      and (public.set_scope_webhook('board', board_id, 'teams', 'https://hooks.slack.com/services/T00/B00/X00') ->> 'error') = 'invalid_webhook_kind'
     from f));

select pg_temp.expect('0064: board admin saves and reads Slack webhook',
  (select (public.set_scope_webhook('board', board_id, 'slack', 'https://hooks.slack.com/services/T00/B00/X00', true) ->> 'ok')::boolean
      and (public.get_scope_webhook('board', board_id) #>> '{webhook,kind}') = 'slack'
     from f));

select pg_temp.expect('0064: hub owner saves Discord webhook',
  (select (public.set_scope_webhook('hub', hub_id, 'discord', 'https://discord.com/api/webhooks/123/abc', true) ->> 'ok')::boolean
     from f));

select pg_temp.expect('0064: test_scope_webhook dispatches test payload',
  (select (public.test_scope_webhook('board', board_id) ->> 'queued')::boolean from f));
select pg_temp.as_owner();
select pg_temp.expect('0064: ... recorded in net.sent',
  (select count(*) = 1 and max(url) = 'https://hooks.slack.com/services/T00/B00/X00' from net.sent));

-- ------------------------------------------------------------ post.created & post.status_changed triggers

delete from net.sent;

select pg_temp.as_user((select stranger_u from f));
insert into public.post (board_id, type, title, body)
select board_id, 'bug'::public.v2_post_type, 'Crash on launch <beta>', 'Repro steps here' from f;

select pg_temp.as_owner();
select pg_temp.expect('0064: new member post fires both board (Slack) and hub (Discord) webhooks',
  (select count(*) = 2 from net.sent));
select pg_temp.expect('0064: Slack payload escapes angle brackets in link title',
  exists (select 1 from net.sent where url like 'https://hooks.slack.com/%' and body ->> 'text' like '%Crash on launch &lt;beta&gt;>%'));
select pg_temp.expect('0064: Discord payload uses markdown link',
  exists (select 1 from net.sent where url like 'https://discord.com/%' and body ->> 'content' like '%[Crash on launch <beta>](https://publisense.app/post/%'));

delete from net.sent;
select pg_temp.as_user((select member_u from f));
select public.set_post_status(
  (select id from public.post where board_id = (select board_id from f) limit 1),
  'shipped'::public.v2_post_status,
  'Fixed in v2.1'
);

select pg_temp.as_owner();
select pg_temp.expect('0064: status change fires both webhooks with Marked Shipped',
  (select count(*) = 2 and bool_and(( coalesce(body ->> 'text', body ->> 'content') ) like '%Marked Shipped%') from net.sent));

-- ------------------------------------------------------------ delete_scope_webhook

select pg_temp.as_user((select admin_u from f));
select pg_temp.expect('0064: delete_scope_webhook removes the webhook',
  (select (public.delete_scope_webhook('board', board_id) ->> 'ok')::boolean
      and (public.get_scope_webhook('board', board_id) -> 'webhook') = 'null'::jsonb
     from f));

rollback;
