-- DM new-message emails (0059): one email per unread streak after 15 minutes, none for
-- requests, muted conversations, blocks, the setting off, stale messages, or while it
-- is still fresh; reading and a new message start a new streak. Stubs pg_net and Vault
-- inside a transaction that ROLLS BACK, so it needs the CI database.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_dm_email_test.sql

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
  select gen_random_uuid() as ann, gen_random_uuid() as bea, gen_random_uuid() as cal, gen_random_uuid() as dee,
         gen_random_uuid() as c_ab, gen_random_uuid() as c_ac, gen_random_uuid() as c_ad;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ann, 'ann-' || left(ann::text, 8) || '@dm-mail-ci.dev', now(), '{"full_name":"Ann"}'::jsonb from f
union all select bea, 'bea-' || left(bea::text, 8) || '@dm-mail-ci.dev', now(), '{"full_name":"Bea"}'::jsonb from f
union all select cal, 'cal-' || left(cal::text, 8) || '@dm-mail-ci.dev', now(), '{"full_name":"Cal"}'::jsonb from f
union all select dee, 'dee-' || left(dee::text, 8) || '@dm-mail-ci.dev', now(), '{"full_name":"Dee"}'::jsonb from f;

-- Ann <-> Bea (inbox for both), Ann <-> Cal (request for Cal), Ann <-> Dee (inbox, Dee muted).
insert into public.dm_conversation (id, user_a, user_b, created_by)
select c_ab, least(ann, bea), greatest(ann, bea), ann from f
union all select c_ac, least(ann, cal), greatest(ann, cal), ann from f
union all select c_ad, least(ann, dee), greatest(ann, dee), ann from f;
insert into public.dm_member (conversation_id, user_id, state, muted)
select c_ab, ann, 'inbox'::public.v2_dm_state, false from f union all select c_ab, bea, 'inbox', false from f
union all select c_ac, ann, 'inbox'::public.v2_dm_state, false from f union all select c_ac, cal, 'request'::public.v2_dm_state, false from f
union all select c_ad, ann, 'inbox'::public.v2_dm_state, false from f union all select c_ad, dee, 'inbox'::public.v2_dm_state, true from f;

create function pg_temp.say(p_conv uuid, p_from uuid, p_body text, p_ago interval) returns void language sql as $$
  insert into public.dm_message (conversation_id, sender, body, created_at) values (p_conv, p_from, p_body, now() - p_ago);
$$;
create function pg_temp.mails(p_to uuid) returns int language sql as $$
  select count(*)::int from net.sent where body -> 'to' ->> 0 = (select email from auth.users where id = p_to);
$$;

-- ------------------------------------------------------------ fresh: nothing yet

select pg_temp.say(c_ab, ann, 'Hi Bea', interval '5 minutes') from f;
select pg_temp.expect('0059: a message unread for under 15 minutes is not emailed', public.v2_dm_email_flush() = 0);

-- ------------------------------------------------------------ due

update public.dm_message set created_at = created_at - interval '20 minutes' where conversation_id = (select c_ab from f);
select pg_temp.say(c_ab, ann, 'Also, <b>are</b> you free Friday?', interval '1 minute') from f;
select pg_temp.say(c_ac, ann, 'Hi Cal (a request)', interval '30 minutes') from f;
select pg_temp.say(c_ad, ann, 'Hi Dee (muted)', interval '30 minutes') from f;

select pg_temp.expect('0059: one email for the conversation with a message unread for 15+ minutes', public.v2_dm_email_flush() = 1);
select pg_temp.expect('0059: ... sent to Bea', pg_temp.mails((select bea from f)) = 1);
select pg_temp.expect('0059: ... quoting the newest message, escaped in HTML',
  (select body ->> 'text' like '%Also, <b>are</b> you free Friday?%' and body ->> 'html' like '%&lt;b&gt;are&lt;/b&gt;%' from net.sent order by id desc limit 1));
select pg_temp.expect('0059: ... with the count of the others and the reply link',
  (select body ->> 'text' like '%Plus 1 more unread message.%' and body ->> 'html' like '%/messages/' || (select c_ab from f)::text || '%' from net.sent order by id desc limit 1));
select pg_temp.expect('0059: ... subject names the sender',
  (select body ->> 'subject' = 'Ann (@' || (select handle from public.profile where id = (select ann from f)) || ') sent you a message' from net.sent order by id desc limit 1));
select pg_temp.expect('0059: ... one-click unsubscribe headers',
  (select body -> 'headers' ->> 'List-Unsubscribe-Post' = 'List-Unsubscribe=One-Click' from net.sent order by id desc limit 1));
select pg_temp.expect('0059: ... logged and counted toward the daily cap',
  exists (select 1 from public.email_log where kind = 'v2_notify_message' and status = 'queued'));
select pg_temp.expect('0059: requests are never emailed', pg_temp.mails((select cal from f)) = 0);
select pg_temp.expect('0059: muted conversations are never emailed', pg_temp.mails((select dee from f)) = 0);

-- ------------------------------------------------------------ once per streak

select pg_temp.say(c_ab, ann, 'Ping', interval '0 minutes') from f;
update public.dm_message set created_at = created_at - interval '20 minutes' where body = 'Ping';
select pg_temp.expect('0059: more unread messages in the same streak send nothing more', public.v2_dm_email_flush() = 0);

-- Bea reads; Ann writes again; 15 minutes later a new email goes.
update public.dm_member set last_read_at = now() - interval '18 minutes' where conversation_id = (select c_ab from f) and user_id = (select bea from f);
update public.dm_member set emailed_at = now() - interval '19 minutes' where conversation_id = (select c_ab from f) and user_id = (select bea from f);
select pg_temp.say(c_ab, ann, 'New streak', interval '16 minutes') from f;
delete from public.dm_message where body = 'Ping';
select pg_temp.expect('0059: after reading, a new unread streak gets a new email', public.v2_dm_email_flush() = 1 and pg_temp.mails((select bea from f)) = 2);

-- ------------------------------------------------------------ settings, blocks, staleness

update public.dm_member set last_read_at = now(), emailed_at = null where conversation_id = (select c_ab from f);
select pg_temp.say(c_ab, ann, 'Setting off', interval '20 minutes') from f;
update public.dm_member set last_read_at = now() - interval '25 minutes' where conversation_id = (select c_ab from f) and user_id = (select bea from f);
insert into public.notification_pref (user_id, kind, channel, enabled) select bea, 'message'::public.v2_notification_kind, 'email'::public.v2_channel, false from f;
select pg_temp.expect('0059: the message email setting off sends nothing', public.v2_dm_email_flush() = 0);
delete from public.notification_pref where user_id = (select bea from f) and kind = 'message';
update public.dm_member set emailed_at = null where conversation_id = (select c_ab from f);

insert into public.user_block (blocker, blocked) select bea, ann from f;
select pg_temp.expect('0059: a block either way sends nothing', public.v2_dm_email_flush() = 0 and pg_temp.mails((select bea from f)) = 2);
delete from public.user_block where blocker = (select bea from f);
update public.dm_member set emailed_at = null where conversation_id = (select c_ab from f);

update public.dm_message set created_at = now() - interval '30 hours' where conversation_id = (select c_ab from f);
select pg_temp.expect('0059: unread messages older than 24 hours are not emailed', public.v2_dm_email_flush() = 0);

select pg_temp.expect('0059: the one-click unsubscribe also turns message emails off',
  (select public.unsubscribe((select token from public.email_token where user_id = (select bea from f)))
   and exists (select 1 from public.notification_pref where user_id = (select bea from f) and kind = 'message' and channel = 'email' and not enabled)));

-- ------------------------------------------------------------ grants

select pg_temp.expect('0059: the flush is not callable by the API roles',
  not has_function_privilege('anon', 'public.v2_dm_email_flush()', 'execute')
  and not has_function_privilege('authenticated', 'public.v2_dm_email_flush()', 'execute'));

rollback;
