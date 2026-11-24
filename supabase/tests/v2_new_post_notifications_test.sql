-- Maintainer new-post notifications (0071): board and parent-hub team members receive
-- an in-app notification and email when a member posts on an approved ('live') board.
-- Seeded, hidden, self-authored posts, and non-live boards are skipped; notification_pref,
-- reserved domains, and the 20/day email cap are respected.
-- Stubs pg_net and Vault inside a rolled-back transaction; CI only.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_new_post_notifications_test.sql

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

-- ------------------------------------------------------------ transport stubs

do $stub$
begin
  if to_regnamespace('net') is not null or to_regnamespace('vault') is not null then
    raise exception 'this test stubs pg_net and Vault; run it only on the CI database';
  end if;
end
$stub$;
create schema net;
create schema vault;
create table net.sent (id bigserial primary key, url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int)
returns bigint language sql as $$
  insert into net.sent (url, headers, body) values (url, headers, body) returning id;
$$;
create view vault.decrypted_secrets as select 'resend_api_key'::text as name, 'test-key'::text as decrypted_secret;

-- ------------------------------------------------------------ fixtures

create temp table f as
  select gen_random_uuid() as poster,
         gen_random_uuid() as owner_tm,
         gen_random_uuid() as support_tm,
         gen_random_uuid() as hub_tm,
         gen_random_uuid() as quiet_email_tm,
         gen_random_uuid() as quiet_inapp_tm,
         gen_random_uuid() as test_dom_tm,
         gen_random_uuid() as capped_tm,
         gen_random_uuid() as hub,
         gen_random_uuid() as live_board,
         gen_random_uuid() as pending_board,
         gen_random_uuid() as rejected_board;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select poster,         'poster-'  || left(poster::text, 8)         || '@mail.publisense-ci.net', now(), '{"full_name":"Pat Poster"}'::jsonb from f
union all select owner_tm,       'owner-'   || left(owner_tm::text, 8)       || '@mail.publisense-ci.net', now(), '{"full_name":"QA M"}'::jsonb from f
union all select support_tm,     'support-' || left(support_tm::text, 8)     || '@mail.publisense-ci.net', now(), '{"full_name":"Support T"}'::jsonb from f
union all select hub_tm,         'hub-'     || left(hub_tm::text, 8)         || '@mail.publisense-ci.net', now(), '{"full_name":"Hub Admin"}'::jsonb from f
union all select quiet_email_tm, 'qmail-'   || left(quiet_email_tm::text, 8) || '@mail.publisense-ci.net', now(), '{"full_name":"Quiet Mail"}'::jsonb from f
union all select quiet_inapp_tm, 'qinapp-'  || left(quiet_inapp_tm::text, 8) || '@mail.publisense-ci.net', now(), '{"full_name":"Quiet App"}'::jsonb from f
union all select test_dom_tm,    'tdom-'    || left(test_dom_tm::text, 8)    || '@np71.test',              now(), '{"full_name":"Test Dom"}'::jsonb from f
union all select capped_tm,      'capped-'  || left(capped_tm::text, 8)      || '@mail.publisense-ci.net', now(), '{"full_name":"Capped TM"}'::jsonb from f;

insert into public.hub (id, slug, name, status)
select hub, 'np71-hub', 'NP71 Hub', 'live' from f;

insert into public.board (id, slug, name, site, hub_id, status, created_by, claimed_at)
select live_board,     'np71-live',     'NP71 Live',     'np71.dev',         hub, 'live',     poster, now() from f
union all
select pending_board,  'np71-pending',  'NP71 Pending',  'np71-pending.dev', hub, 'pending',  poster, null  from f
union all
select rejected_board, 'np71-rejected', 'NP71 Rejected', 'np71-rej.dev',     hub, 'rejected', poster, null  from f;

-- owner_tm is on BOTH the board and its hub (must still only get ONE notification).
insert into public.membership (user_id, scope, scope_id, role)
select owner_tm,       'board'::public.v2_scope, live_board,    'owner'::public.v2_role  from f
union all select owner_tm,       'hub',          hub,           'owner'  from f
union all select support_tm,     'board',        live_board,    'member' from f
union all select hub_tm,         'hub',          hub,           'admin'  from f
union all select quiet_email_tm, 'board',        live_board,    'member' from f
union all select quiet_inapp_tm, 'board',        live_board,    'member' from f
union all select test_dom_tm,    'board',        live_board,    'member' from f
union all select capped_tm,      'board',        live_board,    'member' from f
union all select owner_tm,       'board',        pending_board, 'owner'  from f
union all select owner_tm,       'board',        rejected_board,'owner'  from f;

-- Opt-outs and daily email cap setup.
insert into public.notification_pref (user_id, kind, channel, enabled)
select quiet_email_tm, 'new_post'::public.v2_notification_kind, 'email'::public.v2_channel, false from f
union all
select quiet_inapp_tm, 'new_post', 'in_app', false from f;

insert into public.email_log (notification_id, kind, recipient, status, created_at)
select gen_random_uuid()::text, 'v2_notify_reply', u.email, 'queued', now() - interval '1 hour'
  from f, auth.users u, generate_series(1, 20)
 where u.id = f.capped_tm;

-- ------------------------------------------------------------ 1. regular member post on live board

select pg_temp.as_user((select poster from f));
create temp table p_live as
  with ins as (
    insert into public.post (board_id, type, title, body)
    select live_board, 'bug'::public.v2_post_type, 'Login modal shifts on load', 'Clicking Create an account misses.' from f
    returning id
  )
  select id from ins;

select pg_temp.as_owner();

select pg_temp.expect('0071: board and hub teammates get exactly one new_post in-app notification each (deduped across board+hub)',
  (select count(*) from public.notification n, p_live, f
    where n.post_id = p_live.id and n.kind = 'new_post' and n.target_type = 'post' and n.target_id = p_live.id
      and n.actor = f.poster and n.recipient = f.owner_tm) = 1
  and (select count(*) from public.notification n, p_live, f
        where n.post_id = p_live.id and n.kind = 'new_post' and n.recipient = f.support_tm) = 1
  and (select count(*) from public.notification n, p_live, f
        where n.post_id = p_live.id and n.kind = 'new_post' and n.recipient = f.hub_tm) = 1
  and (select count(*) from public.notification n, p_live, f
        where n.post_id = p_live.id and n.kind = 'new_post' and n.recipient = f.quiet_email_tm) = 1
  and (select count(*) from public.notification n, p_live, f
        where n.post_id = p_live.id and n.kind = 'new_post' and n.recipient = f.test_dom_tm) = 1
  and (select count(*) from public.notification n, p_live, f
        where n.post_id = p_live.id and n.kind = 'new_post' and n.recipient = f.capped_tm) = 1);

select pg_temp.expect('0071: in_app opt-out suppresses both the notification and its email',
  not exists (select 1 from public.notification n, p_live, f
               where n.post_id = p_live.id and n.recipient = f.quiet_inapp_tm));

select pg_temp.expect('0071: emails are queued for eligible teammates with subject, quote, /post/:id link, and unsubscribe headers',
  (select count(*) from public.email_log l join public.notification n on n.id::text = l.notification_id, p_live
    where n.post_id = p_live.id and l.kind = 'v2_notify_new_post' and l.status = 'queued') = 3
  and (select count(*) from net.sent s, p_live
        where s.body ->> 'subject' = 'New post on NP71 Live: Login modal shifts on load'
          and s.body ->> 'text' like 'Pat Poster posted “Login modal shifts on load” on NP71 Live:%Clicking Create an account misses.%'
          and s.body ->> 'text' like '%https://publisense.app/post/' || p_live.id::text || '%'
          and s.body -> 'headers' ->> 'List-Unsubscribe-Post' = 'List-Unsubscribe=One-Click'
          and s.body -> 'headers' ->> 'List-Unsubscribe' like '%&kind=new_post>') = 3);

select pg_temp.expect('0071: email opt-out suppresses email while keeping the in-app notification',
  not exists (select 1 from public.email_log l join public.notification n on n.id::text = l.notification_id, p_live, f
               where n.post_id = p_live.id and n.recipient = f.quiet_email_tm));

select pg_temp.expect('0071: reserved test domains are skipped, not sent',
  exists (select 1 from public.email_log l join public.notification n on n.id::text = l.notification_id, p_live, f
           where n.post_id = p_live.id and n.recipient = f.test_dom_tm
             and l.kind = 'v2_notify_new_post' and l.status = 'skipped' and l.detail = 'reserved domain')
  and not exists (select 1 from net.sent where body -> 'to' ->> 0 like '%@np71.test'));

select pg_temp.expect('0071: daily 20-email cap skips sending a new_post email',
  exists (select 1 from public.email_log l join public.notification n on n.id::text = l.notification_id, p_live, f
           where n.post_id = p_live.id and n.recipient = f.capped_tm
             and l.kind = 'v2_notify_new_post' and l.status = 'skipped' and l.detail = 'daily cap'));

-- ------------------------------------------------------------ 2. self-authored post skips the author, still notifies teammates

select pg_temp.as_user((select owner_tm from f));
create temp table p_self as
  with ins as (
    insert into public.post (board_id, type, title, body)
    select live_board, 'feature'::public.v2_post_type, 'Self-authored roadmap item', '' from f
    returning id
  )
  select id from ins;

select pg_temp.as_owner();

select pg_temp.expect('0071: self-authored post does not notify the author, but still notifies other teammates',
  not exists (select 1 from public.notification n, p_self, f
               where n.post_id = p_self.id and n.kind = 'new_post' and n.recipient = f.owner_tm)
  and exists (select 1 from public.notification n, p_self, f
               where n.post_id = p_self.id and n.kind = 'new_post' and n.recipient = f.support_tm));

-- ------------------------------------------------------------ 3. seeded, hidden, and non-live board posts are skipped

create temp table p_skipped as
  with ins as (
    insert into public.post (board_id, author_id, type, title, body, source_url, hidden_at)
    -- Seeded (null author + source_url)
    select live_board, null::uuid, 'bug'::public.v2_post_type, 'Seeded post from X', 'body', 'https://x.com/u/status/1', null::timestamptz from f
    union all
    -- Seeded with author_id + source_url
    select live_board, poster, 'bug'::public.v2_post_type, 'Imported post with author', 'body', 'https://x.com/u/status/2', null::timestamptz from f
    union all
    -- Hidden at insert
    select live_board, poster, 'bug'::public.v2_post_type, 'Hidden post', 'body', null::text, now() from f
    union all
    -- Pending (unapproved) board
    select pending_board, poster, 'bug'::public.v2_post_type, 'Post on pending board', 'body', null::text, null::timestamptz from f
    union all
    -- Rejected board
    select rejected_board, poster, 'bug'::public.v2_post_type, 'Post on rejected board', 'body', null::text, null::timestamptz from f
    returning id
  )
  select id from ins;

select pg_temp.expect('0071: seeded, hidden, pending-board, and rejected-board posts create zero notifications',
  not exists (select 1 from public.notification n join p_skipped s on s.id = n.post_id where n.kind = 'new_post'));

-- ------------------------------------------------------------ 4. trigger definition includes new_post and keeps existing kinds

select pg_temp.expect('0071: v2_notification_email trigger covers reply, mention, status_change, product, and new_post',
  (select pg_get_triggerdef(oid) like '%reply%mention%status_change%product%new_post%'
     from pg_trigger where tgname = 'v2_notification_email'));

\echo 'v2 new-post notifications tests: all passed'
rollback;
