-- 0062: distinct seeded feedback can share a source, but the same board/source/type/title/body tuple cannot.
-- Run after all migrations; everything is rolled back.
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_duplicate_source_items_test.sql
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
create temp table f as
  select gen_random_uuid() as admin_id, gen_random_uuid() as board_id;
grant select on f to authenticated;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select admin_id, 'seed-source-' || left(admin_id::text, 8) || '@duplicate-source.invalid', now(), '{"full_name":"Seed Source Test"}'::jsonb
from f;
insert into public.board (id, slug, name, site, claimed_at, status)
select board_id, 'dupe-source-' || left(board_id::text, 8), 'Duplicate Source Test', 'duplicate-source.invalid', now(), 'pending'
from f;
insert into public.platform_admin (user_id) select admin_id from f;
create temp table result (case_name text primary key, response jsonb not null);
grant select, insert on result to authenticated;
-- ------------------------------------------------------------ seed_post
select pg_temp.as_user((select admin_id from f));
insert into result values ('first', public.seed_post(
  (select board_id from f), 'bug', 'Login freezes', 'The app freezes after sign-in.',
  'https://example.com/issues/1', null, '@reporter', 'web'));
insert into result values ('second', public.seed_post(
  (select board_id from f), 'bug', 'Uploads disappear', 'Uploads disappear on retry.',
  'https://example.com/issues/1', null, '@another-reporter', 'ios'));
-- Same source, same text, different type is distinct; type is part of the identity.
insert into result values ('third', public.seed_post(
  (select board_id from f), 'feature', 'Login freezes', 'The app freezes after sign-in.',
  'https://example.com/issues/1', null, '@reporter', 'web'));
-- Input trimming/canonicalization does not let an exact duplicate through. Optional metadata is not part of the identity.
insert into result values ('duplicate', public.seed_post(
  (select board_id from f), ' BUG ', '  Login   freezes  ', ' The app freezes after sign-in. ',
  ' https://example.com/issues/1 ', null, '@different-reporter', 'android'));
select pg_temp.expect('0062: distinct items on one board can share a source URL',
  (select count(*) = 3 and bool_and((response->>'ok')::boolean) from result where case_name in ('first', 'second', 'third'))
  and (select count(distinct response->>'id') = 3 from result where case_name in ('first', 'second', 'third')));
select pg_temp.expect('0062: an exact normalized tuple is rejected',
  (select response->>'error' = 'duplicate' from result where case_name = 'duplicate'));
-- ------------------------------------------------------------ edit_seeded_post
insert into result values ('edit_duplicate', public.edit_seeded_post(
  (select (response->>'id')::uuid from result where case_name = 'second'),
  'bug', 'Login freezes', 'The app freezes after sign-in.', 'https://example.com/issues/1'));
select pg_temp.expect('0062: editing cannot create an exact duplicate',
  (select response->>'error' = 'duplicate' from result where case_name = 'edit_duplicate'));
insert into result values ('edit_distinct', public.edit_seeded_post(
  (select (response->>'id')::uuid from result where case_name = 'second'),
  'bug', 'Uploads disappear', 'Uploads vanish when retrying.', 'https://example.com/issues/1'));
select pg_temp.expect('0062: an edit can retain a shared source when the item stays distinct',
  (select (response->>'ok')::boolean from result where case_name = 'edit_distinct'));
insert into result values ('edit_self', public.edit_seeded_post(
  (select (response->>'id')::uuid from result where case_name = 'first'),
  'bug', 'Login freezes', 'The app freezes after sign-in.', 'https://example.com/issues/1'));
select pg_temp.expect('0062: a seeded item can save its own unchanged tuple',
  (select (response->>'ok')::boolean from result where case_name = 'edit_self'));
-- ------------------------------------------------------------ persisted shape before rollback
select pg_temp.as_owner();
select pg_temp.expect('0062: the board has three distinct seeded items from that source',
  (select count(*) = 3 from public.post where board_id = (select board_id from f)
   and source_url = 'https://example.com/issues/1' and author_id is null));
rollback;
