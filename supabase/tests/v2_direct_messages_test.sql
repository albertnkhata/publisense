-- Direct messages (0058). Runs as the real API roles inside a transaction that ROLLS
-- BACK: requests vs inbox, the one-message limit on a request, who can read what,
-- dm_policy, person-to-person blocks, clearing a conversation, unread counts, the
-- confirmed-email rule, body checks and the new-conversation limit.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_direct_messages_test.sql

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

-- ------------------------------------------------------------ fixtures

create temp table f as
  select gen_random_uuid() as ann, gen_random_uuid() as bea, gen_random_uuid() as cal,
         gen_random_uuid() as dee, gen_random_uuid() as eve, gen_random_uuid() as fay;
grant select on f to anon, authenticated;
create temp table r (k text primary key, v jsonb);
grant all on r to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ann, 'ann-' || left(ann::text, 8) || '@dm-ci.dev', now(), '{"full_name":"Ann"}'::jsonb from f
union all select bea, 'bea-' || left(bea::text, 8) || '@dm-ci.dev', now(), '{"full_name":"Bea"}'::jsonb from f
union all select cal, 'cal-' || left(cal::text, 8) || '@dm-ci.dev', now(), '{"full_name":"Cal"}'::jsonb from f
union all select dee, 'dee-' || left(dee::text, 8) || '@dm-ci.dev', now(), '{"full_name":"Dee"}'::jsonb from f
union all select eve, 'eve-' || left(eve::text, 8) || '@dm-ci.dev', null,  '{"full_name":"Eve"}'::jsonb from f
union all select fay, 'fay-' || left(fay::text, 8) || '@dm-ci.dev', now(), '{"full_name":"Fay"}'::jsonb from f;

-- Cal follows Ann, so Ann's message to Cal lands in Cal's inbox.
insert into public.follow (user_id, target, target_id) select cal, 'user', ann from f;

select pg_temp.expect('0058: every new profile defaults to dm_policy everyone',
  (select count(*) from public.profile p, f where p.id in (f.ann, f.bea, f.cal, f.dee, f.eve, f.fay) and p.dm_policy = 'everyone') = 6);

-- ------------------------------------------------------------ signed out

select pg_temp.as_user(null);
select pg_temp.expect_error('0058: anon cannot start a conversation', $q$ select public.dm_start((select bea from f), 'hi') $q$);
select pg_temp.expect_error('0058: anon cannot list conversations', $q$ select * from public.dm_conversations() $q$);
select pg_temp.expect_error('0058: anon cannot read messages', $q$ select * from public.dm_message $q$);
select pg_temp.expect_error('0058: anon cannot read blocks', $q$ select * from public.user_block $q$);

-- ------------------------------------------------------------ a request

select pg_temp.as_user((select ann from f));
insert into r select 'ab', public.dm_start((select bea from f), '  Hi Bea, love your board  ');
select pg_temp.expect('0058: Ann starts a conversation with Bea', (select (v->>'ok')::boolean from r where k = 'ab'));
select pg_temp.expect('0058: the body is trimmed',
  (select body from public.dm_message where conversation_id = (select (v->>'conversation')::uuid from r where k = 'ab')) = 'Hi Bea, love your board');
select pg_temp.expect('0058: Ann sees the conversation in her inbox',
  (select state = 'inbox' and unread = 0 from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));
insert into r select 'ab2', public.dm_send((select (v->>'conversation')::uuid from r where k = 'ab'), 'are you there?');
select pg_temp.expect('0058: a second message waits for Bea to accept',
  (select v->>'error' = 'awaiting_accept' from r where k = 'ab2'));
insert into r select 'ab3', public.dm_start((select bea from f), 'hello again');
select pg_temp.expect('0058: starting again reuses the conversation and keeps the limit',
  (select v->>'error' = 'awaiting_accept' and v->>'conversation' = (select v->>'conversation' from r where k = 'ab') from r where k = 'ab3'));
select pg_temp.expect_error('0058: no direct insert into dm_message',
  $q$ insert into public.dm_message (conversation_id, sender, body) select (v->>'conversation')::uuid, (select ann from f), 'x' from r where k = 'ab' $q$);
select pg_temp.expect_error('0058: no direct update of a member row',
  $q$ update public.dm_member set state = 'inbox' $q$);

select pg_temp.as_user((select bea from f));
select pg_temp.expect('0058: Bea gets it as a request with one unread',
  (select state = 'request' and unread = 1 and other_id = (select ann from f) and last_body = 'Hi Bea, love your board'
     from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));
select pg_temp.expect('0058: Bea can read the request message', (select count(*) from public.dm_message) = 1);

select pg_temp.as_user((select dee from f));
select pg_temp.expect('0058: an outsider sees no conversation, member row or message',
  (select count(*) from public.dm_conversation) = 0 and (select count(*) from public.dm_member) = 0
  and (select count(*) from public.dm_message) = 0 and (select count(*) from public.dm_conversations()) = 0);
insert into r select 'dsend', public.dm_send((select (v->>'conversation')::uuid from r where k = 'ab'), 'butting in');
select pg_temp.expect('0058: an outsider cannot post into it', (select v->>'error' = 'not_found' from r where k = 'dsend'));

-- Bea replies, which accepts; then Ann can keep talking.
select pg_temp.as_user((select bea from f));
select public.dm_send((select (v->>'conversation')::uuid from r where k = 'ab'), 'Thanks Ann!');
select pg_temp.expect('0058: replying moves the request to Bea''s inbox and marks it read',
  (select state = 'inbox' and unread = 0 from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));
select pg_temp.as_user((select ann from f));
select pg_temp.expect('0058: Ann has one unread reply',
  (select unread = 1 and last_body = 'Thanks Ann!' from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));
select pg_temp.expect('0058: after a reply Ann can send again',
  (public.dm_send((select (v->>'conversation')::uuid from r where k = 'ab'), 'Great')->>'ok')::boolean);
select public.dm_mark_read((select (v->>'conversation')::uuid from r where k = 'ab'));
select pg_temp.expect('0058: mark read clears unread',
  (select unread = 0 from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));

-- ------------------------------------------------------------ follows go to the inbox

insert into r select 'ac', public.dm_start((select cal from f), 'Hey Cal');
select pg_temp.as_user((select cal from f));
select pg_temp.expect('0058: someone you follow lands in your inbox, not requests',
  (select state = 'inbox' from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ac')));
select pg_temp.expect('0058: accepting is harmless on an inbox conversation',
  (public.dm_accept((select (v->>'conversation')::uuid from r where k = 'ac'))->>'ok')::boolean);

-- ------------------------------------------------------------ dm_policy

select pg_temp.as_user((select dee from f));
select pg_temp.expect('0058: Dee sets messages to people she follows', (public.set_dm_policy('following')->>'ok')::boolean);
select pg_temp.expect_error('0058: the policy cannot be written directly', $q$ update public.profile set dm_policy = 'nobody' where id = (select dee from f) $q$);
select pg_temp.as_user((select ann from f));
select pg_temp.expect('0058: following-only refuses a stranger', public.dm_start((select dee from f), 'hi')->>'error' = 'not_allowed');
select pg_temp.as_owner();
insert into public.follow (user_id, target, target_id) select dee, 'user', ann from f;
select pg_temp.as_user((select ann from f));
insert into r select 'ad', public.dm_start((select dee from f), 'hi Dee');
select pg_temp.expect('0058: following-only lets in someone she follows, straight to inbox',
  (select (v->>'ok')::boolean from r where k = 'ad'));
select pg_temp.as_user((select fay from f));
select public.set_dm_policy('nobody');
select pg_temp.as_user((select bea from f));
select pg_temp.expect('0058: nobody refuses everyone', public.dm_start((select fay from f), 'hi')->>'error' = 'not_allowed');

-- ------------------------------------------------------------ blocks

select pg_temp.as_user((select cal from f));
select pg_temp.expect('0058: Cal blocks Ann', (public.block_user((select ann from f))->>'ok')::boolean);
select pg_temp.expect('0058: Cal sees his block', (select count(*) from public.user_block) = 1
  and (select count(*) from public.blocked_users() where id = (select ann from f)) = 1);
select pg_temp.expect('0058: Cal cannot message Ann while he blocks her',
  public.dm_send((select (v->>'conversation')::uuid from r where k = 'ac'), 'x')->>'error' = 'not_allowed');
select pg_temp.expect('0058: the existing conversation shows as blocked in his list',
  (select blocked from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ac')));
select pg_temp.as_user((select ann from f));
select pg_temp.expect('0058: the blocked person cannot see the block', (select count(*) from public.user_block) = 0);
select pg_temp.expect('0058: the blocked person cannot send into the conversation',
  public.dm_send((select (v->>'conversation')::uuid from r where k = 'ac'), 'why?')->>'error' = 'not_allowed');
select pg_temp.as_user((select cal from f));
select pg_temp.expect('0058: a block refuses a new conversation either way', public.dm_start((select ann from f), 'x')->>'error' = 'not_allowed');
select pg_temp.expect('0058: you cannot block yourself', public.block_user((select cal from f))->>'error' = 'invalid');
select public.unblock_user((select ann from f));
select pg_temp.expect('0058: unblocking reopens the conversation',
  (public.dm_send((select (v->>'conversation')::uuid from r where k = 'ac'), 'sorry')->>'ok')::boolean);

-- A request from someone you then block leaves your requests list.
select pg_temp.as_user((select fay from f));
select public.set_dm_policy('everyone');
select pg_temp.as_user((select bea from f));
insert into r select 'bf', public.dm_start((select fay from f), 'spam spam');
select pg_temp.as_user((select fay from f));
select pg_temp.expect('0058: Fay has a request from Bea', (select count(*) from public.dm_conversations() where state = 'request') = 1);
select public.block_user((select bea from f));
select pg_temp.expect('0058: blocking the sender removes the request', (select count(*) from public.dm_conversations()) = 0);

-- ------------------------------------------------------------ delete clears your copy only

select pg_temp.as_user((select bea from f));
select public.dm_delete((select (v->>'conversation')::uuid from r where k = 'ab'));
select pg_temp.expect('0058: after deleting, Bea sees no messages and no conversation',
  (select count(*) from public.dm_message where conversation_id = (select (v->>'conversation')::uuid from r where k = 'ab')) = 0
  and not exists (select 1 from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));
select pg_temp.as_user((select ann from f));
select pg_temp.expect('0058: Ann keeps the whole history',
  (select count(*) from public.dm_message where conversation_id = (select (v->>'conversation')::uuid from r where k = 'ab')) = 3);
select pg_temp.as_user((select ann from f));
select public.dm_send((select (v->>'conversation')::uuid from r where k = 'ab'), 'Still there?');
select pg_temp.as_user((select bea from f));
select pg_temp.expect('0058: a new message brings it back for Bea with only the new message',
  (select unread = 1 and last_body = 'Still there?' from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab'))
  and (select count(*) from public.dm_message where conversation_id = (select (v->>'conversation')::uuid from r where k = 'ab')) = 1);
select public.dm_mute((select (v->>'conversation')::uuid from r where k = 'ab'), true);
select pg_temp.expect('0058: Bea muted it', (select muted from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));
select pg_temp.as_user((select ann from f));
select pg_temp.expect('0058: mute is per person', not (select muted from public.dm_conversations() where id = (select (v->>'conversation')::uuid from r where k = 'ab')));

-- ------------------------------------------------------------ input and account rules

select pg_temp.as_user((select eve from f));
select pg_temp.expect('0058: an unconfirmed email cannot start a conversation', public.dm_start((select bea from f), 'hi')->>'error' = 'confirm_email');
select pg_temp.as_user((select ann from f));
select pg_temp.expect('0058: a blank body is refused', public.dm_start((select fay from f), '   ')->>'error' = 'empty');
select pg_temp.expect('0058: over 2000 characters is refused', public.dm_start((select fay from f), repeat('a', 2001))->>'error' = 'too_long');
select pg_temp.expect('0058: messaging yourself is refused', public.dm_start((select ann from f), 'me')->>'error' = 'invalid');
select pg_temp.expect('0058: an unknown person is not found', public.dm_start(gen_random_uuid(), 'hi')->>'error' = 'not_found');

-- ------------------------------------------------------------ limits

select pg_temp.as_owner();
insert into auth.users (id, email, email_confirmed_at)
select gen_random_uuid(), 'bulk-' || g || '-' || left(gen_random_uuid()::text, 6) || '@dm-ci.dev', now() from generate_series(1, 21) g;
create temp table bulk as select id from auth.users where email like 'bulk-%@dm-ci.dev';
grant select on bulk to authenticated;
select pg_temp.as_user((select dee from f));
do $$
declare t uuid; n int := 0; res jsonb;
begin
  for t in select id from bulk loop
    res := public.dm_start(t, 'hello');
    n := n + 1;
    if n <= 20 and not (res->>'ok')::boolean then raise exception 'FAIL 0058: conversation % refused early: %', n, res; end if;
    if n = 21 then
      if res->>'error' <> 'rate_limited' or res->>'retry_after' is null then raise exception 'FAIL 0058: 21st conversation allowed: %', res; end if;
    end if;
  end loop;
  raise notice 'ok   0058: the 21st new conversation in 24 hours is rate limited with retry_after';
end $$;

select pg_temp.as_owner();
delete from public.dm_conversation where created_by = (select dee from f) and id <> (select (v->>'conversation')::uuid from r where k = 'ad');
update public.dm_member set state = 'inbox' where conversation_id = (select (v->>'conversation')::uuid from r where k = 'ad');
select pg_temp.as_user((select dee from f));
do $$
declare i int; res jsonb; conv uuid := (select (v->>'conversation')::uuid from r where k = 'ad');
begin
  for i in 1..30 loop
    res := public.dm_send(conv, 'msg ' || i);
    if not (res->>'ok')::boolean then raise exception 'FAIL 0058: message % refused early: %', i, res; end if;
  end loop;
  res := public.dm_send(conv, 'one too many');
  if res->>'error' <> 'rate_limited' or res->>'hint' <> 'short' then raise exception 'FAIL 0058: 31st message in a minute allowed: %', res; end if;
  raise notice 'ok   0058: the 31st message in a minute is rate limited';
end $$;

select pg_temp.as_owner();
select pg_temp.expect('0058: RLS is on for every DM table',
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'
     and tablename in ('user_block', 'dm_conversation', 'dm_member', 'dm_message')));

rollback;
\echo 'v2 direct message tests: all passed'
