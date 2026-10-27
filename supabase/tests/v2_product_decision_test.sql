-- Product decisions with a reason (0046). CI only: stubs pg_net and Vault inside the
-- transaction so the notification email actually "sends" (into a temp table), then
-- ROLLS BACK. Runs as the real API roles (anon / authenticated + jwt sub), so RLS,
-- grants and the definer RPC are exercised together.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_product_decision_test.sql

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
grant usage on schema net, vault to anon, authenticated;

-- ------------------------------------------------------------ fixtures

create temp table f as
  select gen_random_uuid() as sub, gen_random_uuid() as sub_test, gen_random_uuid() as other,
         gen_random_uuid() as admin, gen_random_uuid() as quiet;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select sub,      'sub-'   || left(sub::text, 8)   || '@mail.publisense-ci.net', now(), '{"full_name":"Sam Submitter"}'::jsonb from f
union all select sub_test, 'subt-' || left(sub_test::text, 8) || '@publisense.test', now(), '{"full_name":"Tess Test"}'::jsonb from f
union all select other,    'oth-'  || left(other::text, 8)    || '@mail.publisense-ci.net', now(), '{"full_name":"Olu Other"}'::jsonb from f
union all select admin,    'adm-'  || left(admin::text, 8)    || '@mail.publisense-ci.net', now(), '{"full_name":"Ada Admin"}'::jsonb from f
union all select quiet,    'qui-'  || left(quiet::text, 8)    || '@mail.publisense-ci.net', now(), '{"full_name":"Quinn Quiet"}'::jsonb from f;
insert into public.platform_admin (user_id) select admin from f;
-- Quinn turned product emails off.
insert into public.notification_pref (user_id, kind, channel, enabled) select quiet, 'product', 'email', false from f;

create temp table s (k text primary key, v jsonb);
grant select, insert on s to anon, authenticated;

select pg_temp.as_user((select sub from f));
insert into s values
  ('rej',  public.create_board('https://pd-reject-ci.dev', 'Reject Me', 'A product to reject', 'prod')),
  ('app',  public.create_board('https://pd-approve-ci.dev', 'Muse', 'Notes that think with you', 'prod')),
  ('bare', public.create_board('https://pd-bare-ci.dev', 'Bare', 'Approved with no note', 'prod'));
select pg_temp.as_user((select sub_test from f));
insert into s values ('t', public.create_board('https://pd-test-ci.dev', 'Testy', 'Submitter on a reserved domain', 'prod'));
select pg_temp.as_user((select quiet from f));
insert into s values ('q', public.create_board('https://pd-quiet-ci.dev', 'Quiet', 'Submitter with product emails off', 'prod'));
select pg_temp.expect('fixture: five pending boards', (select bool_and((v ->> 'ok')::boolean and v ->> 'status' = 'pending') from s));

create function pg_temp.bid(p_k text) returns uuid language sql as $$ select (v ->> 'id')::uuid from s where k = p_k $$;

-- ------------------------------------------------------------ decide_board

select pg_temp.as_user((select other from f));
select pg_temp.expect('decide: a non-admin still cannot decide', public.decide_board(pg_temp.bid('rej'), false, null, null, null, 'nope') ->> 'error' = 'not_allowed');

select pg_temp.as_user((select admin from f));
select pg_temp.expect('decide: a rejection without a reason is refused',
  public.decide_board(pg_temp.bid('rej'), false) ->> 'error' = 'reason_required'
  and public.decide_board(pg_temp.bid('rej'), false, null, null, null, '   ') ->> 'error' = 'reason_required');
select pg_temp.expect('decide: ... and leaves the board pending, with no decision row',
  (select status = 'pending' from public.board where id = pg_temp.bid('rej'))
  and not exists (select 1 from public.board_decision where board_id = pg_temp.bid('rej')));
select pg_temp.expect('decide: reasons and notes are capped at 500 characters',
  public.decide_board(pg_temp.bid('rej'), false, null, null, null, repeat('x', 501)) ->> 'error' = 'reason_length'
  and public.decide_board(pg_temp.bid('app'), true, null, null, null, repeat('x', 501)) ->> 'error' = 'reason_length');
select pg_temp.expect('decide: reject with a reason',
  (public.decide_board(pg_temp.bid('rej'), false, null, null, null, '  Already on Publisense as Reject Me Pro  ') ->> 'ok')::boolean);
select pg_temp.expect('decide: approve with an optional note',
  (public.decide_board(pg_temp.bid('app'), true, null, null, null, 'Welcome aboard. We tidied the tagline.') ->> 'ok')::boolean);
select pg_temp.expect('decide: approve with no note',
  (public.decide_board(pg_temp.bid('bare'), true) ->> 'ok')::boolean);
select pg_temp.expect('decide: the other two (reserved-domain and quiet submitters) are rejected with reasons',
  (public.decide_board(pg_temp.bid('t'), false, null, null, null, 'Test product') ->> 'ok')::boolean
  and (public.decide_board(pg_temp.bid('q'), false, null, null, null, 'Duplicate') ->> 'ok')::boolean);

select pg_temp.as_owner();
select pg_temp.expect('decide: each decision is stored with its reason or note, who decided, the submitter and when',
  (select decision = 'rejected' and note = 'Already on Publisense as Reject Me Pro' and decided_by = f.admin and submitter = f.sub and decided_at is not null
     from public.board_decision, f where board_id = pg_temp.bid('rej'))
  and (select decision = 'approved' and note = 'Welcome aboard. We tidied the tagline.' and decided_by = f.admin and submitter = f.sub
     from public.board_decision, f where board_id = pg_temp.bid('app'))
  and (select decision = 'approved' and note is null from public.board_decision where board_id = pg_temp.bid('bare'))
  and (select count(*) from public.board_decision where board_id in (pg_temp.bid('rej'), pg_temp.bid('app'), pg_temp.bid('bare'), pg_temp.bid('t'), pg_temp.bid('q'))) = 5);
select pg_temp.expect('decide: the rejected board still carries its reason (the board page reads it); an approved one carries none',
  (select review_note = 'Already on Publisense as Reject Me Pro' from public.board where id = pg_temp.bid('rej'))
  and (select review_note is null and status = 'live' from public.board where id = pg_temp.bid('app')));
select pg_temp.expect_error('table: a new rejection without a reason is refused by the table too',
  $$insert into public.board_decision (board_id, decision) select (v ->> 'id')::uuid, 'rejected' from s where k = 'rej'$$);

-- ------------------------------------------------------------ RLS on board_decision

select pg_temp.as_user((select sub from f));
select pg_temp.expect('rls: the submitter reads the decisions on their own boards, reasons included',
  (select count(*) from public.board_decision) = 3
  and exists (select 1 from public.board_decision where board_id = pg_temp.bid('rej') and note = 'Already on Publisense as Reject Me Pro')
  and exists (select 1 from public.board_decision where board_id = pg_temp.bid('app') and note = 'Welcome aboard. We tidied the tagline.'));
select pg_temp.expect_error('rls: the submitter cannot write a decision',
  $$insert into public.board_decision (board_id, decision, note) select (v ->> 'id')::uuid, 'approved', 'self-approved' from s where k = 'rej'$$);
select pg_temp.expect_error('rls: ... nor change one',
  $$update public.board_decision set note = 'changed', decision = 'approved'$$);
select pg_temp.expect_error('rls: ... nor delete one', $$delete from public.board_decision$$);

select pg_temp.as_user((select other from f));
select pg_temp.expect('rls: another signed-in member reads none (not the approved public board''s note either)',
  (select count(*) from public.board_decision) = 0);

select pg_temp.as_user(null);
select pg_temp.expect_error('rls: anon has no access at all', $$select count(*) from public.board_decision$$);

select pg_temp.as_user((select admin from f));
select pg_temp.expect('rls: staff read every decision',
  (select count(*) from public.board_decision where board_id in (pg_temp.bid('rej'), pg_temp.bid('app'), pg_temp.bid('bare'), pg_temp.bid('t'), pg_temp.bid('q'))) = 5);
select pg_temp.expect_error('rls: staff cannot write decisions directly either',
  $$update public.board_decision set note = 'edited by staff'$$);

-- ------------------------------------------------------------ notifications

select pg_temp.as_user((select sub from f));
select pg_temp.expect('notify: the rejection carries its reason, in-app',
  exists (select 1 from public.notification where kind = 'product' and target_id = pg_temp.bid('rej')
            and data ->> 'status' = 'rejected' and data ->> 'reason' = 'Already on Publisense as Reject Me Pro'));
select pg_temp.expect('notify: the approval carries its note, and no reason',
  exists (select 1 from public.notification where kind = 'product' and target_id = pg_temp.bid('app')
            and data ->> 'status' = 'approved' and data ->> 'note' = 'Welcome aboard. We tidied the tagline.' and data ->> 'reason' is null));
select pg_temp.expect('notify: an approval without a note has none',
  exists (select 1 from public.notification where kind = 'product' and target_id = pg_temp.bid('bare') and data ->> 'note' is null));

-- ------------------------------------------------------------ email

select pg_temp.as_owner();
select pg_temp.expect('email: one email per decision to the submitter, queued through the pipeline',
  (select count(*) from public.email_log l join public.notification n on n.id::text = l.notification_id, f
    where n.recipient = f.sub and l.kind = 'v2_notify_product' and l.status = 'queued') = 3);
select pg_temp.expect('email: the rejection email names the product and quotes the reason, linking to the board',
  exists (select 1 from net.sent
           where body -> 'to' ->> 0 like 'sub-%'
             and body ->> 'subject' = 'Reject Me wasn’t approved'
             and body ->> 'text' like 'Reject Me, the product you added, wasn’t approved for Publisense. The reason from the team:%Already on Publisense as Reject Me Pro%'
             and body ->> 'text' like '%https://publisense.app/b/reject-me%'
             and body ->> 'html' like '%Already on Publisense as Reject Me Pro%'));
select pg_temp.expect('email: the approval email says it is live and quotes the note',
  exists (select 1 from net.sent
           where body ->> 'subject' = 'Muse is live on Publisense'
             and body ->> 'text' like 'Muse, the product you added, was approved and is now live on Publisense. A note from the team:%Welcome aboard. We tidied the tagline.%'
             and body ->> 'text' like '%https://publisense.app/b/muse%'));
select pg_temp.expect('email: an approval without a note has no "note from the team" line',
  exists (select 1 from net.sent where body ->> 'subject' = 'Bare is live on Publisense'
            and body ->> 'text' like 'Bare, the product you added, was approved and is now live on Publisense.' || E'\n\n' || 'View it:%'));
select pg_temp.expect('email: a reserved test domain is skipped and never sent',
  exists (select 1 from public.email_log l join public.notification n on n.id::text = l.notification_id, f
           where n.recipient = f.sub_test and l.kind = 'v2_notify_product' and l.status = 'skipped' and l.detail = 'reserved domain')
  and not exists (select 1 from net.sent where body -> 'to' ->> 0 like '%@publisense.test'));
select pg_temp.expect('email: product emails turned off in settings means no email (the in-app one still arrives)',
  not exists (select 1 from public.email_log l join public.notification n on n.id::text = l.notification_id, f where n.recipient = f.quiet)
  and exists (select 1 from public.notification n, f where n.recipient = f.quiet and n.kind = 'product'));
select pg_temp.expect('email: nothing is sent to anyone but submitters',
  (select count(*) from net.sent) = 3);
select pg_temp.expect('email: reply and status emails still go through the same trigger',
  (select pg_get_triggerdef(oid) like '%reply%status_change%product%' from pg_trigger where tgname = 'v2_notification_email'));

\echo 'v2 product decision tests: all passed'
rollback;
