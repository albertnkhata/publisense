-- Notification email batching (#145, migration 0038). CI only: runs after the dev
-- seed (it needs one post). Stubs pg_net and Vault inside the transaction so the
-- sender actually "sends" (into a temp table), then ROLLS BACK.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_email_batching_test.sql

\set ON_ERROR_STOP 1
begin;
set local statement_timeout = '60s';

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
  select gen_random_uuid() as follower, gen_random_uuid() as author, gen_random_uuid() as actor,
         (select id from public.post where status <> 'merged' order by created_at limit 1) as post_id;
select pg_temp.expect('fixture: the dev seed provides a post', (select post_id is not null from f));

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select follower, 'follower-' || left(follower::text, 8) || '@mail.publisense-ci.net', now(), '{"full_name":"Follower"}'::jsonb from f
union all
select author, 'author-' || left(author::text, 8) || '@mail.publisense-ci.net', now(), '{"full_name":"Author"}'::jsonb from f
union all
select actor, 'actor-' || left(actor::text, 8) || '@mail.publisense-ci.net', now(), '{"full_name":"Team Member"}'::jsonb from f;

create function pg_temp.status(p_to text) returns void language sql as $$
  insert into public.notification (recipient, kind, actor, target_type, target_id, post_id, data, created_at)
  select follower, 'status_change', actor, 'post', post_id, post_id, jsonb_build_object('to', p_to), clock_timestamp() from f;
$$;
create function pg_temp.reply() returns void language sql as $$
  insert into public.notification (recipient, kind, actor, target_type, target_id, post_id, created_at)
  select author, 'reply', actor, 'reply', gen_random_uuid(), post_id, clock_timestamp() from f;
$$;
-- now() is fixed inside a transaction, so notifications carry clock_timestamp() to keep
-- their order, and windows are closed by ageing the log.
-- Close every open 15-minute window.
create function pg_temp.close_windows() returns void language sql as $$
  update public.email_log set created_at = created_at - interval '16 minutes' where kind like 'v2_notify_%';
$$;
create function pg_temp.sent_subjects(p_to text) returns text[] language sql as $$
  select coalesce(array_agg(body ->> 'subject' order by id), '{}') from net.sent where body -> 'to' ->> 0 = p_to;
$$;
create temp table addr as
  select (select email from auth.users where id = follower) as follower,
         (select email from auth.users where id = author) as author from f;

-- ------------------------------------------------------------ status changes

-- Planned -> In progress -> Shipped within the window.
select pg_temp.status('planned');
select pg_temp.status('in_progress');
select pg_temp.status('shipped');

select pg_temp.expect('status: the first change is emailed straight away',
  (select cardinality(pg_temp.sent_subjects(follower)) = 1 and (pg_temp.sent_subjects(follower))[1] like 'Planned:%' from addr));
select pg_temp.expect('status: later changes in the window are held, not dropped',
  (select count(*) = 2 from public.email_log where kind = 'v2_notify_status_change' and status = 'held' and recipient = (select follower from addr)));

select public.v2_email_flush_held();
select pg_temp.expect('status: nothing more is sent while the window is still open',
  (select cardinality(pg_temp.sent_subjects(follower)) = 1 from addr));

select pg_temp.close_windows();
select pg_temp.expect('status: the flush sends one email once the window closes',
  public.v2_email_flush_held() = 1);
select pg_temp.expect('status: ... and it is the LATEST status (Shipped)',
  (select cardinality(pg_temp.sent_subjects(follower)) = 2 and (pg_temp.sent_subjects(follower))[2] like 'Shipped:%' from addr));
select pg_temp.expect('status: the held rows are accounted for as batched',
  (select count(*) = 2 from public.email_log where kind = 'v2_notify_status_change' and status = 'batched'
     and detail like 'sent as one email:%' and recipient = (select follower from addr)));
select pg_temp.expect('status: nothing is left held',
  not exists (select 1 from public.email_log where status = 'held'));

-- Back-and-forth that ends on the status already emailed sends nothing.
select pg_temp.close_windows();
select pg_temp.status('planned');       -- new window, sent straight away
select pg_temp.status('in_progress');   -- held
select pg_temp.status('planned');       -- held; ends where the last email left it
select pg_temp.close_windows();
select public.v2_email_flush_held();
select pg_temp.expect('status: ending on the status already emailed sends nothing more',
  (select cardinality(pg_temp.sent_subjects(follower)) = 3 from addr)
  and (select count(*) = 2 from public.email_log where status = 'skipped' and detail = 'status back to the one already emailed'));

-- ------------------------------------------------------------ replies

select pg_temp.reply();
select pg_temp.reply();
select pg_temp.reply();
select pg_temp.expect('reply: first reply emailed, the next two held',
  (select cardinality(pg_temp.sent_subjects(author)) = 1 from addr)
  and (select count(*) = 2 from public.email_log where kind = 'v2_notify_reply' and status = 'held'));
select pg_temp.close_windows();
-- The next activity anywhere flushes what is due, even without pg_cron.
select pg_temp.status('shipped');
select pg_temp.expect('reply: held replies go out on the next notification (no cron needed)',
  (select cardinality(pg_temp.sent_subjects(author)) = 2 from addr));
select pg_temp.expect('reply: the batched email says how many more replies arrived',
  exists (select 1 from net.sent where body -> 'to' ->> 0 = (select author from addr) and body ->> 'text' like '%Plus 1 more reply on this post.%'));

-- ------------------------------------------------------------ guards at flush time

select pg_temp.close_windows();
select pg_temp.reply();   -- sent
select pg_temp.reply();   -- held
insert into public.notification_pref (user_id, kind, channel, enabled)
select author, 'reply', 'email', false from f
on conflict (user_id, kind, channel) do update set enabled = false;
select pg_temp.close_windows();
select public.v2_email_flush_held();
select pg_temp.expect('guard: turning reply emails off in the window cancels the held email',
  (select count(*) = 0 from public.email_log where status = 'held')
  and exists (select 1 from public.email_log where status = 'skipped' and detail = 'email off or no address at send time'));

select pg_temp.status('in_progress');   -- new window for the follower? (last status email was Shipped, aged)
update public.email_log set created_at = now() - interval '25 hours' where status = 'held';
insert into public.email_log (notification_id, kind, recipient, status, detail, created_at)
select n.id::text, 'v2_notify_status_change', (select follower from addr), 'held', 'old', now() - interval '25 hours'
  from public.notification n where n.recipient = (select follower from f) order by n.created_at desc limit 1;
select public.v2_email_flush_held();
select pg_temp.expect('guard: emails held for over 24 hours expire instead of going out late',
  exists (select 1 from public.email_log where status = 'expired') and not exists (select 1 from public.email_log where status = 'held'));

select pg_temp.expect('privilege: the flush is not callable by the API roles',
  not has_function_privilege('anon', 'public.v2_email_flush_held()', 'execute')
  and not has_function_privilege('authenticated', 'public.v2_email_flush_held()', 'execute'));

rollback;
