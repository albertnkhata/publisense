-- Join request messages (0049, #189). Runs as the real API roles inside a transaction
-- that ROLLS BACK: the definer RPC, the column check, RLS on the new column, the
-- notification payload, and that a three-argument call (the old client) still works.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_join_message_test.sql

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
  select gen_random_uuid() as owner, gen_random_uuid() as asker, gen_random_uuid() as quiet,
         gen_random_uuid() as stranger, gen_random_uuid() as board;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select owner,    'own-' || left(owner::text, 8)    || '@jmci-acme.dev', now(), '{"full_name":"Olga Owner"}'::jsonb from f
union all select asker,    'ask-' || left(asker::text, 8)    || '@jmci-acme.dev', now(), '{"full_name":"Asha Asker"}'::jsonb from f
union all select quiet,    'qui-' || left(quiet::text, 8)    || '@jmci-acme.dev', now(), '{"full_name":"Quinn Quiet"}'::jsonb from f
union all select stranger, 'str-' || left(stranger::text, 8) || '@mail.publisense-ci.net', now(), '{"full_name":"Sid Stranger"}'::jsonb from f;

insert into public.board (id, slug, name, site, claimed_at)
select board, 'jmci-acme-' || left(board::text, 6), 'JM Acme', 'jmci-acme.dev', now() from f;
insert into public.membership (user_id, scope, scope_id, role) select owner, 'board', board, 'owner' from f;
insert into public.verified_domain (domain, verified_by, method)
select 'jmci-acme.dev', owner, 'email'::public.v2_domain_method from f
union all select 'jmci-acme.dev', asker, 'email'::public.v2_domain_method from f
union all select 'jmci-acme.dev', quiet, 'email'::public.v2_domain_method from f;

-- ------------------------------------------------------------ schema

select pg_temp.expect('0049: join_request.message exists and is nullable',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'join_request' and column_name = 'message' and is_nullable = 'YES'));
select pg_temp.expect('0049: exactly one request_join, the four-argument one',
  (select count(*) from pg_proc where proname = 'request_join' and pronamespace = 'public'::regnamespace) = 1
  and to_regprocedure('public.request_join(public.v2_scope, uuid, text, text)') is not null);
select pg_temp.expect('0049: anon cannot execute request_join',
  not has_function_privilege('anon', 'public.request_join(public.v2_scope, uuid, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.request_join(public.v2_scope, uuid, text, text)', 'execute'));

-- ------------------------------------------------------------ the RPC

select pg_temp.as_user((select asker from f));
select pg_temp.expect('0049: over 280 characters is refused',
  public.request_join('board', (select board from f), 'asha@jmci-acme.dev', repeat('x', 281)) ->> 'error' = 'message_length');
select pg_temp.expect('0049: nothing was filed by the refused call',
  not exists (select 1 from public.join_request where user_id = (select asker from f)));
select pg_temp.expect('0049: a request with a message is filed (trimmed)',
  (public.request_join('board', (select board from f), 'asha@jmci-acme.dev',
                       E'  I run support here.\n Need to answer bug reports.  ') ->> 'ok')::boolean);
select pg_temp.expect('0049: the requester reads their own message back, trimmed',
  (select message from public.join_request where user_id = (select asker from f))
    = E'I run support here.\n Need to answer bug reports.');
-- Each RPC call is its own statement: a statement's snapshot doesn't see what a
-- function it calls wrote, so the read-back comes in the next statement.
select pg_temp.expect('0049: exactly 280 characters is accepted on a repeat',
  (public.request_join('board', (select board from f), 'asha@jmci-acme.dev', repeat('y', 280)) ->> 'already')::boolean);
select pg_temp.expect('0049: ... and replaces the message',
  (select message from public.join_request where user_id = (select asker from f)) = repeat('y', 280));
select pg_temp.expect('0049: a repeat without a message is accepted',
  (public.request_join('board', (select board from f), 'asha@jmci-acme.dev') ->> 'already')::boolean);
select pg_temp.expect('0049: ... and keeps the old message',
  (select message from public.join_request where user_id = (select asker from f)) = repeat('y', 280));

select pg_temp.as_user((select quiet from f));
select pg_temp.expect('0049: the old three-argument call still works',
  (public.request_join('board', (select board from f), 'quinn@jmci-acme.dev') ->> 'ok')::boolean);
select pg_temp.expect('0049: ... and stores no message',
  (select message is null from public.join_request where user_id = (select quiet from f)));
select pg_temp.as_owner();
update public.join_request set status = 'withdrawn' where user_id = (select quiet from f);
select pg_temp.as_user((select quiet from f));
select pg_temp.expect('0049: a whitespace-only message is accepted',
  (public.request_join('board', (select board from f), 'quinn@jmci-acme.dev', E'   \n  ') ->> 'ok')::boolean);
select pg_temp.expect('0049: ... and stored as null',
  (select message is null from public.join_request where user_id = (select quiet from f) and status = 'pending'));

-- ------------------------------------------------------------ who reads it

select pg_temp.as_user((select owner from f));
select pg_temp.expect('0049: the board owner reads the message on the request',
  (select message from public.join_request where user_id = (select asker from f)) = repeat('y', 280));
select pg_temp.expect('0049: the owner''s pending notification carries the first message',
  exists (select 1 from public.notification
           where kind = 'join' and actor = (select asker from f) and data ->> 'status' = 'pending'
             and data ->> 'message' = E'I run support here.\n Need to answer bug reports.'));
select pg_temp.expect('0049: no message key when there was no message',
  exists (select 1 from public.notification where kind = 'join' and actor = (select quiet from f))
  and not exists (select 1 from public.notification where kind = 'join' and actor = (select quiet from f) and data ? 'message'));

select pg_temp.as_user((select stranger from f));
select pg_temp.expect('0049: a stranger reads no requests (or messages)',
  not exists (select 1 from public.join_request where scope_id = (select board from f)));

select pg_temp.as_user((select asker from f));
select pg_temp.expect_error('0049: the client cannot write message directly',
  format('update public.join_request set message = %L where user_id = %L', 'hi', (select asker from f)));
select pg_temp.expect_error('0049: ... nor insert one',
  format('insert into public.join_request (scope, scope_id, work_email, message) values (''board'', %L, ''a@jmci-acme.dev'', ''hi'')', (select board from f)));

select pg_temp.as_owner();
select pg_temp.expect_error('0049: the column check refuses an empty string even for the table owner',
  format('update public.join_request set message = %L where user_id = %L', '', (select asker from f)));

rollback;
