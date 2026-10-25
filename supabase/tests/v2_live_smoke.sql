-- Publisense live smoke test (D-003). Runs nightly against PRODUCTION from
-- .github/workflows/smoke.yml, and by hand with:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_live_smoke.sql
--
-- Unlike v2_rls_test.sql (which needs an empty database), this suite makes no
-- assumption about what production holds: it creates two throwaway users with
-- random ids and @smoke.invalid addresses, picks whatever board anon can see, and
-- exercises the real API roles against the real schema, policies and triggers.
--
-- SAFE ON PRODUCTION: everything runs in one transaction that is ROLLED BACK.
-- Nothing it writes is ever committed. Email is not sent either: the addresses
-- are reserved (.invalid is skipped by the sender), and pg_net only sends
-- requests from committed transactions.
--
-- A failed expectation raises and psql exits non-zero.

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

create function pg_temp.expect_error(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok   % (refused: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % : statement succeeded but should have been refused', label;
end $$;

create function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

create function pg_temp.expect_hidden(label text, tbl text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute format('select count(*) from %s', tbl) into n;
  exception when others then
    raise notice 'ok   % (refused: %)', label, sqlerrm;
    return;
  end;
  if n <> 0 then raise exception 'FAIL % : % rows visible', label, n; end if;
  raise notice 'ok   % (0 rows visible)', label;
end $$;

create temp table s (k text primary key, v uuid);
grant select, insert on s to anon, authenticated;

-- ------------------------------------------------------------ fixtures (owner)

insert into s values ('a', gen_random_uuid()), ('b', gen_random_uuid());
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select v, 'smoke-' || k || '-' || left(v::text, 8) || '@smoke.invalid', now(), '{"full_name":"Smoke Test"}'
  from s where k in ('a', 'b');

-- 1. Signup provisions the account the app expects.
select pg_temp.expect('signup: profile created for each new user',
  (select count(*) from public.profile where id in (select v from s where k in ('a','b'))) = 2);
select pg_temp.expect('signup: unsubscribe token created',
  (select count(*) from public.email_token where user_id in (select v from s where k in ('a','b'))) = 2);
select pg_temp.expect('signup: a new user is not a platform admin',
  not exists (select 1 from public.platform_admin where user_id in (select v from s where k in ('a','b'))));

-- ------------------------------------------------------------ anonymous visitor

select pg_temp.as_user(null);
insert into s select 'board', id from public.board limit 1;
select pg_temp.expect('anon: can read at least one board', exists (select 1 from s where k = 'board'));
select pg_temp.expect('anon: can read posts', (select count(*) from public.post) > 0);
select pg_temp.expect_hidden('anon: cannot see unsubscribe tokens', 'public.email_token');
select pg_temp.expect_hidden('anon: cannot see notifications', 'public.notification');
select pg_temp.expect_hidden('anon: cannot see notification settings', 'public.notification_pref');
select pg_temp.expect_hidden('anon: cannot read the email log', 'public.email_log');
select pg_temp.expect_error('anon: cannot post',
  $$insert into public.post (board_id, type, title) select v, 'bug', 'Anon smoke post' from s where k = 'board'$$);
select pg_temp.expect('anon: unknown unsubscribe token is a quiet false',
  public.unsubscribe(gen_random_uuid()) = false);

-- ------------------------------------------------------------ signed-in user A

select pg_temp.as_user((select v from s where k = 'a'));
select pg_temp.expect_error('user: cannot post as somebody else',
  $$insert into public.post (board_id, type, title, author_id)
    select (select v from s where k = 'board'), 'bug', 'Forged smoke post', (select v from s where k = 'b')$$);
select pg_temp.expect_error('user: cannot set a status on their own new post',
  $$insert into public.post (board_id, type, title, status)
    select v, 'bug'::public.v2_post_type, 'Sneaky smoke post', 'shipped'::public.v2_post_status from s where k = 'board'$$);
with p as (
  insert into public.post (board_id, type, title, body)
  select v, 'bug', 'Smoke test post (rolled back)', 'nightly smoke' from s where k = 'board'
  returning id, author_id)
insert into s select 'post', id from p;
select pg_temp.expect('user: can post as themselves',
  (select author_id from public.post where id = (select v from s where k = 'post')) = (select v from s where k = 'a'));
insert into public.vote (post_id) select v from s where k = 'post';
select pg_temp.expect_error('user: cannot vote twice',
  $$insert into public.vote (post_id) select v from s where k = 'post'$$);
select pg_temp.expect_error('user: cannot vote as somebody else',
  $$insert into public.vote (post_id, user_id) select (select v from s where k = 'post'), (select v from s where k = 'b')$$);
select pg_temp.expect_error('user: cannot make themselves a platform admin',
  $$insert into public.platform_admin (user_id) select v from s where k = 'a'$$);
select pg_temp.expect_error('user: cannot change status without being on the team',
  $$select public.set_post_status((select v from s where k = 'post'), 'planned')$$);
update public.profile set name = 'Hijacked' where id = (select v from s where k = 'b');
select pg_temp.as_owner();
select pg_temp.expect('user: cannot edit someone else''s profile',
  (select name from public.profile where id = (select v from s where k = 'b')) is distinct from 'Hijacked');

-- ------------------------------------------------------------ user B replies

select pg_temp.as_user((select v from s where k = 'b'));
insert into public.reply (post_id, body) select v, 'Smoke reply (rolled back)' from s where k = 'post';
select pg_temp.expect_error('user: cannot post an official reply without being on the team',
  $$insert into public.reply (post_id, body, is_official) select v, 'Official?', true from s where k = 'post'$$);
select pg_temp.expect('user: cannot read another user''s notifications',
  (select count(*) from public.notification where recipient = (select v from s where k = 'a')) = 0);

-- ------------------------------------------------------------ the reply reached A

select pg_temp.as_user((select v from s where k = 'a'));
select pg_temp.expect('notify: the post author gets an in-app reply notification',
  exists (select 1 from public.notification where kind = 'reply' and post_id = (select v from s where k = 'post')));

select pg_temp.as_owner();
select pg_temp.expect('notify: the reply email path ran (reserved test address skipped)',
  exists (select 1 from public.email_log l join public.notification n on n.id::text = l.notification_id
           where n.post_id = (select v from s where k = 'post') and l.kind = 'v2_notify_reply'
             and l.status = 'skipped' and l.detail = 'reserved domain'));
select pg_temp.expect('counts: vote and reply counters moved',
  (select vote_count = 1 and reply_count = 1 from public.post where id = (select v from s where k = 'post')));

\echo 'live smoke: all passed (rolled back, nothing kept)'
rollback;
