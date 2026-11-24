-- Weekly digest (0070): one email per person per ISO week with "Shipped this week" and
-- "Rising on your boards", only posts anyone can see, nobody with nothing to read, the
-- digest setting and the one-click unsubscribe honoured, reserved domains skipped, and
-- a rerun in the same week sends nothing. Stubs pg_net and Vault inside a transaction
-- that ROLLS BACK, so it needs the CI database.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_weekly_digest_test.sql

\set ON_ERROR_STOP 1
begin;
set local statement_timeout = '60s';

create function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

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
  select gen_random_uuid() as ann, gen_random_uuid() as bob, gen_random_uuid() as cat, gen_random_uuid() as eve,
         gen_random_uuid() as board_a, gen_random_uuid() as board_b, gen_random_uuid() as board_c,
         gen_random_uuid() as a_new1, gen_random_uuid() as a_new2, gen_random_uuid() as a_hidden,
         gen_random_uuid() as a_shipped, gen_random_uuid() as a_reverted, gen_random_uuid() as a_merged,
         gen_random_uuid() as b_old, gen_random_uuid() as c_up, gen_random_uuid() as c_new;

-- Ann follows A and upvoted a post on C; Bob follows only B (quiet all week); Cat follows
-- A with the digest turned off; Eve follows A on a reserved test domain.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ann, 'ann-' || left(ann::text, 8) || '@digest-ci.dev', now(), '{"full_name":"Ann"}'::jsonb from f
union all select bob, 'bob-' || left(bob::text, 8) || '@digest-ci.dev', now(), '{"full_name":"Bob"}'::jsonb from f
union all select cat, 'cat-' || left(cat::text, 8) || '@digest-ci.dev', now(), '{"full_name":"Cat"}'::jsonb from f
union all select eve, 'eve-' || left(eve::text, 8) || '@digest.test', now(), '{"full_name":"Eve"}'::jsonb from f;

insert into public.board (id, slug, name, status)
select board_a, 'digest-ci-a-' || left(board_a::text, 6), 'Digest <A>', 'live' from f
union all select board_b, 'digest-ci-b-' || left(board_b::text, 6), 'Digest B', 'live' from f
union all select board_c, 'digest-ci-c-' || left(board_c::text, 6), 'Digest C', 'live' from f;

insert into public.post (id, board_id, type, title, body, source_url, created_at, vote_count, reply_count)
select a_new1, board_a, 'feature'::public.v2_post_type, 'Rising one with <b>markup</b>', '', 'https://example.com/1', now() - interval '1 day', 5, 3 from f
union all select a_new2, board_a, 'bug', 'Rising two, the most upvoted', '', 'https://example.com/2', now() - interval '2 days', 9, 0 from f
union all select a_hidden, board_a, 'bug', 'Hidden new post', '', 'https://example.com/3', now() - interval '1 day', 50, 0 from f
union all select a_shipped, board_a, 'feature', 'Old post that shipped', '', 'https://example.com/4', now() - interval '30 days', 2, 0 from f
union all select a_reverted, board_a, 'feature', 'Shipped then back to planned', '', 'https://example.com/5', now() - interval '30 days', 2, 0 from f
union all select b_old, board_b, 'feature', 'Quiet old post on B', '', 'https://example.com/6', now() - interval '30 days', 1, 0 from f
union all select c_up, board_c, 'feature', 'Upvoted post on C', '', 'https://example.com/7', now() - interval '30 days', 4, 0 from f
union all select c_new, board_c, 'feature', 'New post on an unfollowed board', '', 'https://example.com/8', now() - interval '1 day', 40, 0 from f;
update public.post set hidden_at = now() where id = (select a_hidden from f);

-- Status moves: written straight to post + status_event (no notification side effects needed).
update public.post set status = 'shipped' where id = (select a_shipped from f);
update public.post set status = 'planned' where id in ((select a_reverted from f), (select c_up from f));
delete from public.status_event where post_id in (select unnest(array[a_shipped, a_reverted, c_up]) from f);
insert into public.status_event (post_id, "from", "to", at)
select a_shipped, 'open'::public.v2_post_status, 'shipped'::public.v2_post_status, now() - interval '2 days' from f
union all select a_reverted, 'open', 'shipped', now() - interval '3 days' from f
union all select a_reverted, 'shipped', 'planned', now() - interval '1 day' from f
union all select c_up, 'open', 'planned', now() - interval '1 day' from f;

insert into public.follow (user_id, target, target_id)
select ann, 'board'::public.v2_follow_target, board_a from f
union all select bob, 'board', board_b from f
union all select cat, 'board', board_a from f
union all select eve, 'board', board_a from f;
insert into public.vote (post_id, user_id) select c_up, ann from f;

insert into public.notification_pref (user_id, kind, channel, enabled)
select cat, 'weekly_digest'::public.v2_notification_kind, 'email'::public.v2_channel, false from f;

create function pg_temp.digests(p_to uuid) returns int language sql as $$
  select count(*)::int from net.sent
   where body -> 'to' ->> 0 = (select email from auth.users where id = p_to)
     and body ->> 'subject' like 'Your week on Publisense:%';
$$;
create function pg_temp.last_digest(p_to uuid) returns jsonb language sql as $$
  select body from net.sent
   where body -> 'to' ->> 0 = (select email from auth.users where id = p_to)
     and body ->> 'subject' like 'Your week on Publisense:%'
   order by id desc limit 1;
$$;

-- ------------------------------------------------------------ first run

select pg_temp.expect('0070: the first run sends exactly one digest (Ann)', public.v2_weekly_digest_send() = 1);
select pg_temp.expect('0070: Ann gets one digest', pg_temp.digests((select ann from f)) = 1);

select pg_temp.expect('0070: subject counts the visible new posts on her boards',
  pg_temp.last_digest((select ann from f)) ->> 'subject' = 'Your week on Publisense: 2 new posts');
select pg_temp.expect('0070: Shipped this week lists the followed board''s shipped post',
  (select b ->> 'text' like '%SHIPPED THIS WEEK%Old post that shipped (Shipped · Digest <A>)%'
      and b ->> 'html' like '%Shipped this week%' from (select pg_temp.last_digest((select ann from f)) b) s));
select pg_temp.expect('0070: ... and the upvoted post on an unfollowed board, tagged',
  (pg_temp.last_digest((select ann from f)) ->> 'text') like '%Upvoted post on C (Planned · Digest C · a post you upvoted)%');
select pg_temp.expect('0070: ... but not a post whose newest move took it off Shipped',
  (pg_temp.last_digest((select ann from f)) ->> 'text') not like '%Shipped then back to planned%');
select pg_temp.expect('0070: Rising on your boards orders by upvotes, then replies',
  (pg_temp.last_digest((select ann from f)) ->> 'text') like '%RISING ON YOUR BOARDS%Rising two, the most upvoted%Rising one with <b>markup</b>%');
select pg_temp.expect('0070: hidden posts and unfollowed boards stay out',
  (select b ->> 'text' not like '%Hidden new post%' and b ->> 'text' not like '%New post on an unfollowed board%'
     from (select pg_temp.last_digest((select ann from f)) b) s));
select pg_temp.expect('0070: titles and board names are escaped in HTML',
  (select b ->> 'html' like '%Rising one with &lt;b&gt;markup&lt;/b&gt;%' and b ->> 'html' like '%Digest &lt;A&gt;%'
      and b ->> 'html' not like '%<b>markup</b>%'
     from (select pg_temp.last_digest((select ann from f)) b) s));
select pg_temp.expect('0070: post links use /post/<id>',
  (pg_temp.last_digest((select ann from f)) ->> 'html') like '%https://publisense.app/post/' || (select a_new2 from f)::text || '%');
select pg_temp.expect('0070: one-click unsubscribe headers and a settings link',
  (select b -> 'headers' ->> 'List-Unsubscribe-Post' = 'List-Unsubscribe=One-Click'
      and b -> 'headers' ->> 'List-Unsubscribe' = '<https://publisense.app/api/unsubscribe?token='
          || (select token from public.email_token where user_id = (select ann from f))::text || '&kind=weekly_digest>'
      and b ->> 'html' like '%https://publisense.app/unsubscribe?token='
          || (select token from public.email_token where user_id = (select ann from f))::text || '&kind=weekly_digest%'
      and b ->> 'html' like '%https://publisense.app/settings#notifications%'
     from (select pg_temp.last_digest((select ann from f)) b) s));
select pg_temp.expect('0070: the send is logged once for this ISO week',
  (select count(*) = 1 and bool_and(request_id is not null) from public.email_log
    where kind = 'v2_weekly_digest' and status = 'queued'
      and notification_id = (select ann from f)::text || ':' || to_char(now() at time zone 'UTC', 'IYYY-"W"IW')));

select pg_temp.expect('0070: a person with every section empty is skipped (no send, no log row)',
  pg_temp.digests((select bob from f)) = 0
  and not exists (select 1 from public.email_log where kind = 'v2_weekly_digest' and notification_id like (select bob from f)::text || ':%'));
select pg_temp.expect('0070: the weekly digest setting off sends nothing',
  pg_temp.digests((select cat from f)) = 0
  and not exists (select 1 from public.email_log where kind = 'v2_weekly_digest' and notification_id like (select cat from f)::text || ':%'));
select pg_temp.expect('0070: a reserved test domain is skipped and logged',
  pg_temp.digests((select eve from f)) = 0
  and exists (select 1 from public.email_log where kind = 'v2_weekly_digest' and status = 'skipped' and detail = 'reserved domain'
                 and notification_id like (select eve from f)::text || ':%'));

-- ------------------------------------------------------------ idempotency

select pg_temp.expect('0070: a rerun in the same week sends nothing', public.v2_weekly_digest_send() = 0);
select pg_temp.expect('0070: ... Ann still has one digest and one log row',
  pg_temp.digests((select ann from f)) = 1
  and (select count(*) from public.email_log where kind = 'v2_weekly_digest' and notification_id like (select ann from f)::text || ':%') = 1);
select pg_temp.expect('0070: ... and Eve is not logged twice',
  (select count(*) from public.email_log where kind = 'v2_weekly_digest' and notification_id like (select eve from f)::text || ':%') = 1);

do $dup$
begin
  begin
    insert into public.email_log (notification_id, kind, recipient, status)
    select notification_id, kind, recipient, 'queued' from public.email_log
     where kind = 'v2_weekly_digest' and status = 'queued' limit 1;
    raise exception 'FAIL 0070: a second queued row for the same person and week was accepted';
  exception when unique_violation then
    raise notice 'ok   0070: the database refuses a second queued digest for the same week';
  end;
end
$dup$;

-- A failed send is retried by the next run in the same week.
delete from public.email_log where kind = 'v2_weekly_digest' and notification_id like (select ann from f)::text || ':%';
insert into public.email_log (notification_id, kind, recipient, status, detail)
select ann::text || ':' || to_char(now() at time zone 'UTC', 'IYYY-"W"IW'), 'v2_weekly_digest', 'x', 'error', 'test' from f;
select pg_temp.expect('0070: an errored send is retried in the same week', public.v2_weekly_digest_send() = 1 and pg_temp.digests((select ann from f)) = 2);
select pg_temp.expect('0070: ... and then not again', public.v2_weekly_digest_send() = 0);

-- Next ISO week: a new digest is due (with a post from that week).
insert into public.post (board_id, type, title, body, source_url, created_at)
select board_a, 'feature', 'A post from next week', '', 'https://example.com/9', now() + interval '6 days' from f;
select pg_temp.expect('0070: the next ISO week sends again', public.v2_weekly_digest_send(now() + interval '7 days') = 1);

-- ------------------------------------------------------------ unsubscribe and the cap

select pg_temp.expect('0070: the one-click unsubscribe accepts the token',
  public.unsubscribe((select token from public.email_token where user_id = (select ann from f))));
select pg_temp.expect('0070: ... and it turns the weekly digest off too',
  exists (select 1 from public.notification_pref where user_id = (select ann from f) and kind = 'weekly_digest' and channel = 'email' and not enabled));
select pg_temp.expect('0070: ... so the week after sends nothing', public.v2_weekly_digest_send(now() + interval '14 days') = 0);

delete from public.notification_pref where user_id = (select ann from f);
insert into public.post (board_id, type, title, body, source_url, created_at)
select board_a, 'feature', 'A post three weeks out', '', 'https://example.com/10', now() + interval '20 days' from f;
insert into public.email_log (notification_id, kind, recipient, status, created_at)
select 'cap-' || g, 'v2_notify_reply', (select email from auth.users where id = (select ann from f)), 'queued', now() + interval '21 days'
  from generate_series(1, 20) g;
select pg_temp.expect('0070: over the daily cap nothing is sent', public.v2_weekly_digest_send(now() + interval '21 days') = 0);
select pg_temp.expect('0070: ... and the skip is logged',
  exists (select 1 from public.email_log where kind = 'v2_weekly_digest' and status = 'skipped' and detail = 'daily cap'
             and notification_id like (select ann from f)::text || ':%'));

-- ------------------------------------------------------------ grants

select pg_temp.expect('0070: the sender is not callable by the API roles',
  not has_function_privilege('anon', 'public.v2_weekly_digest_send(timestamptz, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.v2_weekly_digest_send(timestamptz, int)', 'execute'));

rollback;
