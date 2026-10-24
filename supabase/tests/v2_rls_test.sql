-- Publisense v2 permission tests (FOUNDATION section 8), run by CI after the
-- migrations apply. Each check runs as a real API role (anon / authenticated) with
-- request.jwt.claim.sub set, the way PostgREST calls the database, so RLS, column
-- grants and triggers are exercised together. Everything runs in one transaction
-- that is rolled back, so the job can run it against any database.
--
-- A failed expectation raises and psql exits non-zero (ON_ERROR_STOP).

\set ON_ERROR_STOP 1
begin;

-- ------------------------------------------------------------ harness

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

-- expect_error('label', 'sql'): the statement must fail.
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

-- ------------------------------------------------------------ fixtures (as owner)

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'alice@example.org', '{"full_name":"Alice Banda"}'),
  ('00000000-0000-4000-8000-00000000000b', 'bob@example.org',   '{}'),
  ('00000000-0000-4000-8000-00000000000c', 'carol@cursor.com',  '{}'),
  ('00000000-0000-4000-8000-00000000000d', 'dave@example.org',  '{}'),
  ('00000000-0000-4000-8000-00000000000e', 'erin@figma.com',    '{}'),
  ('00000000-0000-4000-8000-00000000000f', 'staff@publisense.app', '{}'),
  ('00000000-0000-4000-8000-000000000010', 'Alice@other.org',   '{}');

create temp table ids as
select (select id from public.board where slug = 'cursor')   as cursor,
       (select id from public.board where slug = 'figjam')   as figjam,
       (select id from public.board where slug = 'linear')   as linear,
       (select id from public.hub   where slug = 'figma')    as figma_hub,
       '00000000-0000-4000-8000-00000000000a'::uuid as alice,
       '00000000-0000-4000-8000-00000000000b'::uuid as bob,
       '00000000-0000-4000-8000-00000000000c'::uuid as carol,
       '00000000-0000-4000-8000-00000000000d'::uuid as dave,
       '00000000-0000-4000-8000-00000000000e'::uuid as erin,
       '00000000-0000-4000-8000-00000000000f'::uuid as staff,
       null::uuid as post;
grant select, update on ids to anon, authenticated;

insert into public.membership (user_id, scope, scope_id, role)
select carol, 'board'::public.v2_scope, cursor, 'owner'::public.v2_role from ids union all
select erin,  'hub', figma_hub, 'admin' from ids;
insert into public.block (scope, scope_id, user_id) select 'board'::public.v2_scope, cursor, dave from ids;
-- Carol's team exists because the board is claimed (memberships only ever exist on a claimed scope).
update public.board set claimed_at = now() where slug = 'cursor';
insert into public.platform_admin (user_id) select staff from ids;

select pg_temp.expect('seed: 14 boards, 1 hub, figma hub holds 3',
  (select count(*) from public.board) = 14 and (select count(*) from public.hub) = 1
  and (select count(*) from public.board b join public.hub h on h.id = b.hub_id where h.slug = 'figma') = 3);
select pg_temp.expect('sign-up makes a profile and an email token',
  (select count(*) from public.profile where id in (select alice from ids union select bob from ids)) = 2
  and exists (select 1 from public.email_token, ids where user_id = ids.alice));
select pg_temp.expect('handles are unique and sanitised (alice, alice2)',
  (select handle from public.profile where id = '00000000-0000-4000-8000-00000000000a') = 'alice'
  and (select handle from public.profile where id = '00000000-0000-4000-8000-000000000010') = 'alice2');
select pg_temp.expect('profile name comes from full_name',
  (select name from public.profile, ids where id = ids.alice) = 'Alice Banda');
select pg_temp.expect_error('shared domain refused in verified_domain',
  $$insert into public.verified_domain (domain, verified_by, method)
    values ('gmail.com', '00000000-0000-4000-8000-00000000000a', 'email')$$);
select pg_temp.expect_error('shared subdomain refused (acme.vercel.app)',
  $$insert into public.verified_domain (domain, verified_by, method)
    values ('acme.vercel.app', '00000000-0000-4000-8000-00000000000a', 'dns')$$);

-- ------------------------------------------------------------ anon

select pg_temp.as_user(null);
select pg_temp.expect('anon reads boards and hubs',
  (select count(*) from public.board) = 14 and (select count(*) from public.hub) = 1);
select pg_temp.expect_error('anon cannot post',
  $$insert into public.post (board_id, type, title) select cursor, 'bug', 'Anon post' from ids$$);
select pg_temp.expect_error('anon cannot read notifications', $$select * from public.notification$$);
select pg_temp.expect_error('anon cannot read memberships',  $$select * from public.membership$$);

-- ------------------------------------------------------------ posting

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
insert into public.post (board_id, type, title, body)
select cursor, 'bug'::public.v2_post_type, 'Composer drops edits on rebase', 'Steps...' from ids;
select pg_temp.as_owner();
update ids set post = (select id from public.post where title = 'Composer drops edits on rebase');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('post is the author''s, open, unseeded',
  (select author_id = ids.alice and status = 'open' and source_url is null from public.post, ids where post.id = ids.post));
select pg_temp.expect('board post_count went up',
  (select post_count from public.board, ids where board.id = ids.cursor) = 1);
select pg_temp.expect_error('author cannot set status on insert',
  $$insert into public.post (board_id, type, title, status) select cursor, 'bug'::public.v2_post_type, 'Sneaky', 'shipped'::public.v2_post_status from ids$$);
select pg_temp.expect_error('author cannot forge another author',
  $$insert into public.post (board_id, type, title, author_id) select cursor, 'bug', 'Forged', bob from ids$$);
select pg_temp.expect_error('author cannot write counters',
  $$update public.post set vote_count = 999 where id = (select post from ids)$$);
select pg_temp.expect_error('author cannot change status directly',
  $$update public.post set status = 'shipped' where id = (select post from ids)$$);
update public.post set title = 'Composer drops edits during rebase' where id = (select post from ids);
select pg_temp.expect('author edit stamps edited_at',
  (select edited_at is not null from public.post, ids where post.id = ids.post));

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
update public.post set title = 'Hijacked' where id = (select post from ids);
select pg_temp.expect('others cannot edit the post (0 rows changed)',
  (select title from public.post, ids where post.id = ids.post) = 'Composer drops edits during rebase');

select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.expect_error('blocked user cannot post on that board',
  $$insert into public.post (board_id, type, title) select cursor, 'bug', 'From dave' from ids$$);
insert into public.post (board_id, type, title) select linear, 'feature'::public.v2_post_type, 'Dave on Linear' from ids;
select pg_temp.expect('blocked user can still post elsewhere',
  exists (select 1 from public.post where title = 'Dave on Linear'));
select pg_temp.expect_error('blocked user cannot vote on that board',
  $$insert into public.vote (post_id) select post from ids$$);

-- ------------------------------------------------------------ votes and replies

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
insert into public.vote (post_id) select post from ids;
select pg_temp.expect('vote counts and auto-follows',
  (select vote_count from public.post, ids where post.id = ids.post) = 1
  and exists (select 1 from public.follow, ids where user_id = ids.bob and target = 'post' and target_id = ids.post));
select pg_temp.expect_error('cannot vote as someone else',
  $$insert into public.vote (post_id, user_id) select post, alice from ids$$);
select pg_temp.expect_error('cannot vote twice', $$insert into public.vote (post_id) select post from ids$$);
insert into public.reply (post_id, body) select post, 'Same here on 0.44' from ids;
select pg_temp.expect_error('non-team cannot reply officially',
  $$insert into public.reply (post_id, body, is_official) select post, 'Official!', true from ids$$);

select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
insert into public.reply (post_id, body, is_official) select post, 'Looking into it', true from ids;
select pg_temp.expect('post reply_count is 2',
  (select reply_count from public.post, ids where post.id = ids.post) = 2);

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('author got a reply notification per reply',
  (select count(*) from public.notification where kind = 'reply') = 2);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('nobody reads another person''s notifications',
  (select count(*) from public.notification where recipient = '00000000-0000-4000-8000-00000000000a') = 0);

-- ------------------------------------------------------------ status, team powers

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect_error('author cannot change status via RPC',
  $$select public.set_post_status((select post from ids), 'planned')$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select public.set_post_status((select post from ids), 'planned', 'Next sprint');
select pg_temp.expect('team status change writes a status_event',
  (select count(*) from public.status_event, ids where post_id = ids.post and "to" = 'planned' and "from" = 'open') = 1);
select pg_temp.expect_error('merge goes through merge_post, not set_post_status',
  $$select public.set_post_status((select post from ids), 'merged')$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('followers (voters) hear about status changes',
  (select count(*) from public.notification where kind = 'status_change') = 1);

select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select public.set_post_hidden((select post from ids), true);
select pg_temp.as_user(null);
select pg_temp.expect('hidden post invisible to the public',
  not exists (select 1 from public.post, ids where post.id = ids.post));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('hidden post invisible to other users',
  not exists (select 1 from public.post, ids where post.id = ids.post));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('author still sees their hidden post',
  exists (select 1 from public.post, ids where post.id = ids.post));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect_error('non-team cannot unhide',
  $$select public.set_post_hidden((select post from ids), false)$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select public.set_post_hidden((select post from ids), false);
select pg_temp.as_user(null);
select pg_temp.expect('platform admin can unhide',
  exists (select 1 from public.post, ids where post.id = ids.post));

-- ------------------------------------------------------------ boards, hubs, memberships

select pg_temp.as_user('00000000-0000-4000-8000-00000000000e');
select pg_temp.expect('hub admin is admin of every board in the hub',
  public.is_board_admin((select figjam from ids)));
update public.board set tagline = 'Whiteboard for teams' where slug = 'figjam';
select pg_temp.expect('hub admin edits a hub board',
  (select tagline from public.board where slug = 'figjam') = 'Whiteboard for teams');
update public.board set tagline = 'Hacked' where slug = 'cursor';
select pg_temp.expect('hub admin cannot edit a board outside the hub',
  (select tagline from public.board where slug = 'cursor') = 'The AI code editor');
select pg_temp.expect_error('nobody claims a board by writing claimed_at',
  $$update public.board set claimed_at = now() where slug = 'figjam'$$);

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('outsiders see no team memberships',
  (select count(*) from public.membership) = 0);
select pg_temp.expect_error('nobody makes themselves a member',
  $$insert into public.membership (user_id, scope, scope_id, role) select alice, 'board'::public.v2_scope, cursor, 'owner'::public.v2_role from ids$$);
select pg_temp.expect_error('nobody makes themselves platform admin',
  $$insert into public.platform_admin (user_id) select alice from ids$$);
select pg_temp.expect_error('nobody writes verified domains directly',
  $$insert into public.verified_domain (domain, verified_by, method) select 'example.org', alice, 'email' from ids$$);
-- Disputes arrive only through open_dispute since 0022 (step 8 tests that); this
-- fixture row stands in for one filed that way.
select pg_temp.as_owner();
insert into public.ownership_dispute (user_id, scope, scope_id, reason, work_email)
select alice, 'board'::public.v2_scope, cursor, 'I run the Cursor team, this owner left.', 'alice@cursor.com' from ids;

select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('team sees its own memberships',
  (select count(*) from public.membership) = 1);
select pg_temp.expect('incumbent team cannot read disputes against it',
  (select count(*) from public.ownership_dispute) = 0);
select pg_temp.expect_error('sole owner cannot leave',
  $$delete from public.membership where user_id = (select carol from ids)$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select pg_temp.expect('platform admin sees the dispute',
  (select count(*) from public.ownership_dispute) = 1);

-- ------------------------------------------------------------ reports, prefs, unsubscribe

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
insert into public.report (target, target_id, reason) select 'post'::public.v2_report_target, post, 'Spam link' from ids;
select pg_temp.expect_error('reporter cannot decide their own report',
  $$update public.report set status = 'actioned'$$);
insert into public.notification_pref (kind, channel, enabled) values ('reply', 'email', false);
select pg_temp.expect('own notification prefs are writable',
  (select count(*) from public.notification_pref) = 1);

select pg_temp.as_owner();
create temp table tok as select token from public.email_token where user_id = '00000000-0000-4000-8000-00000000000b';
grant select on tok to anon;
select pg_temp.as_user(null);
select pg_temp.expect('unsubscribe works without sign-in',
  public.unsubscribe((select token from tok), null));
select pg_temp.expect('unknown token is a quiet false',
  public.unsubscribe(gen_random_uuid(), null) = false);
select pg_temp.expect_error('anon cannot read email tokens', $$select * from public.email_token$$);
select pg_temp.as_owner();
select pg_temp.expect('unsubscribe turned off every email kind',
  (select count(*) from public.notification_pref
    where user_id = '00000000-0000-4000-8000-00000000000b' and channel = 'email' and not enabled) = 8);

-- ------------------------------------------------------------ storage

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
insert into storage.objects (bucket_id, name)
values ('avatars', '00000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.png');
select pg_temp.expect('user uploads under their own avatar prefix', true);
select pg_temp.expect_error('user cannot upload under someone else''s prefix',
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '00000000-0000-4000-8000-00000000000b/11111111-1111-4111-8111-111111111111.png')$$);
select pg_temp.expect_error('svg is not accepted (path rule)',
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '00000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.svg')$$);
select pg_temp.expect_error('non-admin cannot upload a board logo',
  $$insert into storage.objects (bucket_id, name)
    select 'board-logos', cursor || '/22222222-2222-4222-8222-222222222222.png' from ids$$);
select pg_temp.expect_error('malformed logo path is refused, not an error 500',
  $$insert into storage.objects (bucket_id, name) values ('board-logos', 'cursor/logo.png')$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
insert into storage.objects (bucket_id, name)
select 'board-logos', cursor || '/22222222-2222-4222-8222-222222222222.png' from ids;
select pg_temp.expect('board owner uploads its logo', true);

-- ------------------------------------------------------------ step 5: the app's writes, with RETURNING
-- The feed and post page write through PostgREST with `return=representation`, so
-- every write below also needs the row back through the SELECT policies. RLS filters
-- a write on someone else's row to zero rows (no error); the api layer reports that.

create temp table s5 (post uuid, reply uuid);
insert into s5 values (null, null);
grant select, update on s5 to anon, authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
-- (Inserted without RETURNING: the composer is step 6. See the PR notes on insert-returning.)
insert into public.post (board_id, type, title, body) select linear, 'feature', 'Step five sample post', 'details' from ids;
update s5 set post = (select id from public.post where title = 'Step five sample post' and author_id = auth.uid());
select pg_temp.expect('step 5: the author sees their new post', (select post is not null from s5));

with u as (
  update public.post set type = 'bug', title = 'Step five sample, edited', body = ''
   where id = (select post from s5)
  returning id, type, title, body, edited_at)
select pg_temp.expect('step 5: author edit returns the row with edited_at stamped',
  (select count(*) = 1 and bool_and(edited_at is not null and type = 'bug') from u));

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
with u as (update public.post set title = 'Hijacked title' where id = (select post from s5) returning id)
select pg_temp.expect('step 5: editing someone else''s post changes zero rows', (select count(*) = 0 from u));
with d as (delete from public.post where id = (select post from s5) returning id)
select pg_temp.expect('step 5: deleting someone else''s post deletes zero rows', (select count(*) = 0 from d));

insert into public.vote (post_id) select post from s5;
select pg_temp.expect('step 5: upvote sends post_id only; user_id, count and auto-follow are server-side',
  (select vote_count = 1 from public.post where id = (select post from s5))
  and exists (select 1 from public.follow where user_id = auth.uid() and target = 'post' and target_id = (select post from s5)));
select pg_temp.expect_error('step 5: a second upvote is a unique violation (the app treats 23505 as done)',
  $$insert into public.vote (post_id) select post from s5$$);
select pg_temp.expect_error('step 5: following a post twice is a unique violation (the app treats 23505 as done)',
  $$insert into public.follow (target, target_id) select 'post', post from s5$$);

with r as (
  insert into public.reply (post_id, parent_id, body) select post, null, 'A reply from Alice' from s5
  returning id, author_id, is_official)
update s5 set reply = (select id from r)
 where (select author_id from r) = '00000000-0000-4000-8000-00000000000a' and not (select is_official from r);
select pg_temp.expect('step 5: a reply comes back with its author set by the server', (select reply is not null from s5));
with u as (update public.reply set body = 'A reply from Alice, edited' where id = (select reply from s5) returning id, edited_at)
select pg_temp.expect('step 5: reply author edit returns the row with edited_at', (select count(*) = 1 and bool_and(edited_at is not null) from u));

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
insert into public.reply (post_id, parent_id, body) select post, reply, 'Bob answers in the thread' from s5;
with u as (update public.reply set body = 'Hijacked' where id = (select reply from s5) returning id)
select pg_temp.expect('step 5: editing someone else''s reply changes zero rows', (select count(*) = 0 from u));

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
with d as (delete from public.reply where id = (select reply from s5) returning id)
select pg_temp.expect('step 5: reply author delete returns the deleted row', (select count(*) = 1 from d));
select pg_temp.expect('step 5: deleting a reply takes its thread with it and the counter follows',
  (select reply_count = 0 from public.post where id = (select post from s5)));
delete from public.vote where post_id = (select post from s5) and user_id = auth.uid();
select pg_temp.expect('step 5: removing an upvote lowers the count',
  (select vote_count = 0 from public.post where id = (select post from s5)));

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
with d as (delete from public.post where id = (select post from s5) returning id)
select pg_temp.expect('step 5: post author delete returns the deleted row', (select count(*) = 1 from d));
select pg_temp.as_owner();

-- ------------------------------------------------------------ step 6: composer and search
-- The composer inserts with RETURNING (supabase-js insert().select()), which needs the
-- SELECT policy to see the new row (0020). Search reads boards, hubs and posts as anon.

create temp table s6 (post uuid);
insert into s6 values (null);
grant select, update on s6 to anon, authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
with i as (
  insert into public.post (board_id, type, title, body)
  select linear, 'feature'::public.v2_post_type, 'Keyboard shortcut for cycles', 'Let me jump between cycles' from ids
  returning id, author_id, status, vote_count)
update s6 set post = (select id from i)
 where (select author_id = '00000000-0000-4000-8000-00000000000b' and status = 'open' and vote_count = 0 from i);
select pg_temp.expect('step 6: insert with RETURNING gives the author their new post back', (select post is not null from s6));
select pg_temp.expect_error('step 6: the composer still cannot choose the id',
  $$insert into public.post (id, board_id, type, title) select gen_random_uuid(), linear, 'bug', 'Chosen id' from ids$$);

select pg_temp.as_user(null);
select pg_temp.expect('step 6: anon finds the post by full-text search (similar posts, /search)',
  exists (select 1 from public.post where search @@ websearch_to_tsquery('english', 'cycle shortcuts')));
select pg_temp.expect('step 6: anon searches boards and hubs by name and tagline',
  (select count(*) from public.board where name ilike '%fig%' or tagline ilike '%fig%') = 3
  and (select count(*) from public.hub where name ilike '%fig%') = 1);

select pg_temp.as_owner();
select public.set_post_hidden((select post from s6), true) from (select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000f', true)) x;
select pg_temp.as_user(null);
select pg_temp.expect('step 6: a hidden post drops out of anon search',
  not exists (select 1 from public.post where id = (select post from s6)));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 6: its author still sees it', exists (select 1 from public.post where id = (select post from s6)));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('step 6: another user does not', not exists (select 1 from public.post where id = (select post from s6)));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select pg_temp.expect('step 6: a platform admin does', exists (select 1 from public.post where id = (select post from s6)));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
delete from public.post where id = (select post from s6);
select pg_temp.as_owner();

-- ------------------------------------------------------------ deletion

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
delete from public.post where id = (select post from ids);
select pg_temp.as_owner();
select pg_temp.expect('author deletes own post; its votes, replies and follows go with it',
  not exists (select 1 from public.vote, ids where post_id = ids.post)
  and not exists (select 1 from public.reply, ids where post_id = ids.post)
  and not exists (select 1 from public.follow, ids where target_id = ids.post)
  and (select post_count from public.board, ids where board.id = ids.cursor) = 0);

-- ------------------------------------------------------------ account deletion
-- What the delete-account Edge Function relies on (supabase/functions/delete-account).
-- The function refuses sole owners up front and removes follows that point at the user;
-- these checks cover what deleting the auth user then does to the v2 tables.

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000020', 'frank@example.org', '{"full_name":"Frank"}');
insert into public.membership (user_id, scope, scope_id, role)
select '00000000-0000-4000-8000-000000000020'::uuid, 'board'::public.v2_scope, cursor, 'owner'::public.v2_role from ids;

select pg_temp.as_user('00000000-0000-4000-8000-000000000020');
insert into public.post (board_id, type, title) select linear, 'bug'::public.v2_post_type, 'Frank''s post outlives his account' from ids;
insert into public.vote (post_id) select id from public.post where title = 'Frank''s post outlives his account';
insert into public.reply (post_id, body) select id, 'and so does this reply' from public.post where title = 'Frank''s post outlives his account';
insert into public.follow (target, target_id) select 'board'::public.v2_follow_target, linear from ids;
insert into public.notification_pref (kind, channel, enabled) values ('reply', 'email', false);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
insert into public.follow (target, target_id) values ('user', '00000000-0000-4000-8000-000000000020');

select pg_temp.as_owner();
create temp table before_delete as
select (select follower_count from public.board, ids where board.id = ids.linear) as linear_followers;

-- The function's own cleanup, then the auth delete (GoTrue's admin delete does the same row delete).
delete from public.follow where target = 'user' and target_id = '00000000-0000-4000-8000-000000000020';
delete from auth.users where id = '00000000-0000-4000-8000-000000000020';

select pg_temp.expect('deleting a co-owner removes their profile, token, prefs, votes, follows and membership',
  not exists (select 1 from public.profile where id = '00000000-0000-4000-8000-000000000020')
  and not exists (select 1 from public.email_token where user_id = '00000000-0000-4000-8000-000000000020')
  and not exists (select 1 from public.notification_pref where user_id = '00000000-0000-4000-8000-000000000020')
  and not exists (select 1 from public.vote where user_id = '00000000-0000-4000-8000-000000000020')
  and not exists (select 1 from public.follow where user_id = '00000000-0000-4000-8000-000000000020')
  and not exists (select 1 from public.membership where user_id = '00000000-0000-4000-8000-000000000020'));
select pg_temp.expect('their posts and replies stay, shown as from a deleted user (author null)',
  (select author_id is null and vote_count = 0 and reply_count = 1
     from public.post where title = 'Frank''s post outlives his account')
  and (select author_id is null from public.reply where body = 'and so does this reply'));
select pg_temp.expect('counters follow the cascade (board followers back down by one)',
  (select follower_count from public.board, ids where board.id = ids.linear)
    = (select linear_followers - 1 from before_delete));
select pg_temp.expect('the remaining owner keeps the board',
  exists (select 1 from public.membership, ids
           where user_id = ids.carol and scope = 'board' and scope_id = ids.cursor and role = 'owner'));
select pg_temp.expect_error('a sole owner''s auth user cannot be deleted (last-owner trigger is the backstop)',
  $$delete from auth.users where id = '00000000-0000-4000-8000-00000000000c'$$);

-- ------------------------------------------------------------ step 7: claiming, teams, join requests, disputes
-- Mail and DNS transport (pg_net, Vault) do not exist here, so start_domain_email
-- answers 'email_unavailable' after storing the challenge; the tests then set a
-- known code hash as the owner, the way a delivered email would carry the code.

select pg_temp.as_owner();
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000071', 'gina@linear.app'),
  ('00000000-0000-4000-8000-000000000072', 'hank@linear.app');
create temp table s7 as
select (select id from public.board where slug = 'figma')  as figma,
       (select id from public.board where slug = 'figjam') as figjam,
       (select id from public.board where slug = 'arc')    as arc,
       '00000000-0000-4000-8000-000000000071'::uuid as gina,
       '00000000-0000-4000-8000-000000000072'::uuid as hank;
grant select on s7 to anon, authenticated;

select pg_temp.as_user(null);
select pg_temp.expect_error('step 7: anon cannot claim',
  $$select public.claim_board((select linear from ids))$$);
select pg_temp.expect_error('step 7: anon cannot start a domain check',
  $$select public.start_domain_email('x@linear.app', 'linear.app')$$);

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 7: shared domains are refused before any mail',
  public.start_domain_email('bob@gmail.com', 'gmail.com') ->> 'error' = 'shared_domain'
  and public.start_domain_dns('acme.vercel.app') ->> 'error' = 'shared_domain');
select pg_temp.expect('step 7: the email must be on the domain being proved',
  public.start_domain_email('bob@example.org', 'linear.app') ->> 'error' = 'wrong_domain');
select pg_temp.expect('step 7: no mail transport here, so the send reports email_unavailable',
  public.start_domain_email('bob@linear.app', 'linear.app') ->> 'error' = 'email_unavailable');
select pg_temp.expect_error('step 7: challenges are server-only (no client read)',
  $$select * from public.domain_challenge$$);
select pg_temp.expect('step 7: claiming before proving the domain is refused',
  public.claim_board((select linear from ids)) ->> 'error' = 'not_verified');

select pg_temp.as_owner();
select pg_temp.expect('step 7: the code is stored hashed, never in clear',
  (select code_hash ~ '^[0-9a-f]{32}\$[0-9a-f]{64}$' and work_email = 'bob@linear.app' and expires_at > now()
     from public.domain_challenge, ids where user_id = ids.bob));
update public.domain_challenge set code_hash = public.v2_code_hash('salt', '123456')
 where user_id = '00000000-0000-4000-8000-00000000000b';

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 7: a wrong code is refused and counted',
  public.verify_domain_email('bob@linear.app', '000000') ->> 'error' = 'wrong_code');
select pg_temp.expect('step 7: the right code verifies the domain',
  public.verify_domain_email('Bob@Linear.app', '123456') ->> 'domain' = 'linear.app');
select pg_temp.expect('step 7: ... and records it as proved by email',
  exists (select 1 from public.verified_domain, ids where verified_by = ids.bob and domain = 'linear.app' and method = 'email'));
select pg_temp.expect('step 7: a used code cannot be replayed',
  public.verify_domain_email('bob@linear.app', '123456') ->> 'error' = 'expired');
select pg_temp.expect('step 7: claim board succeeds once the domain is proved',
  (public.claim_board((select linear from ids)) ->> 'ok')::boolean);
select pg_temp.expect('step 7: claimer is owner, board is claimed, claim notification written',
  exists (select 1 from public.membership, ids where user_id = ids.bob and scope = 'board' and scope_id = ids.linear and role = 'owner')
  and (select claimed_at is not null from public.board, ids where board.id = ids.linear)
  and exists (select 1 from public.notification where kind = 'claim' and target_id = (select linear from ids)));
select pg_temp.expect_error('step 7: membership is still not client-writable',
  $$insert into public.membership (user_id, scope, scope_id, role) select alice, 'board'::public.v2_scope, linear, 'member'::public.v2_role from ids$$);

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('step 7: a claimed board cannot be claimed again',
  public.claim_board((select linear from ids)) ->> 'error' = 'claimed');

-- attempts, expiry, rate limit
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select public.start_domain_email('dave@arc.net', 'arc.net');
select pg_temp.as_owner();
update public.domain_challenge set code_hash = public.v2_code_hash('salt', '111111') where user_id = '00000000-0000-4000-8000-00000000000d';
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select public.verify_domain_email('dave@arc.net', '000001'), public.verify_domain_email('dave@arc.net', '000002'),
       public.verify_domain_email('dave@arc.net', '000003'), public.verify_domain_email('dave@arc.net', '000004');
select pg_temp.expect('step 7: the fifth wrong code locks the challenge',
  public.verify_domain_email('dave@arc.net', '000005') ->> 'error' = 'too_many_attempts'
  and public.verify_domain_email('dave@arc.net', '111111') ->> 'error' = 'too_many_attempts');
select public.start_domain_email('dave@arc.net', 'arc.net');
select pg_temp.as_owner();
update public.domain_challenge set code_hash = public.v2_code_hash('salt', '222222'), expires_at = now() - interval '1 minute'
 where user_id = '00000000-0000-4000-8000-00000000000d' and attempts = 0;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.expect('step 7: an expired code is refused',
  public.verify_domain_email('dave@arc.net', '222222') ->> 'error' = 'expired');
select public.start_domain_email('dave@arc.net', 'arc.net'), public.start_domain_email('dave@arc.net', 'arc.net'),
       public.start_domain_email('dave@arc.net', 'arc.net');
select pg_temp.expect('step 7: five codes an hour, then rate_limited',
  public.start_domain_email('dave@arc.net', 'arc.net') ->> 'error' = 'rate_limited');

-- DNS
select pg_temp.expect('step 7: DNS check hands out a stable TXT token',
  public.start_domain_dns('arc.net') ->> 'token' like 'publisense-verify=%'
  and public.start_domain_dns('arc.net') ->> 'token' = public.start_domain_dns('ARC.net') ->> 'token');
select pg_temp.expect('step 7: ... and the board shows the claim as pending',
  'arc.net' = any (public.my_pending_dns()));
select pg_temp.expect('step 7: without pg_net the DNS lookup reports dns_unavailable',
  public.check_domain_dns('arc.net') ->> 'error' = 'dns_unavailable'
  and public.check_domain_dns('nothing.example') ->> 'error' = 'no_challenge');

-- hub claim
select pg_temp.as_owner();
insert into public.verified_domain (domain, verified_by, method) values ('figma.com', '00000000-0000-4000-8000-00000000000a', 'dns');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('step 7: claiming a hub board offers the hub when its domain is proved',
  public.claim_board((select figma from s7)) ->> 'hub' = 'figma');
select pg_temp.expect('step 7: claim hub succeeds',
  (public.claim_hub((select figma_hub from ids)) ->> 'ok')::boolean);
select pg_temp.expect('step 7: claim hub covers every board in it',
  (select claimed_at is not null from public.hub, ids where hub.id = ids.figma_hub)
  and not exists (select 1 from public.board, ids where hub_id = ids.figma_hub and claimed_at is null)
  and public.is_board_admin((select figjam from s7)));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000e');
select pg_temp.expect('step 7: a board in a claimed hub cannot be claimed on its own',
  public.claim_board((select figjam from s7)) ->> 'error' = 'hub_claimed'
  and public.claim_hub((select figma_hub from ids)) ->> 'error' = 'claimed');

-- join requests
select pg_temp.as_user('00000000-0000-4000-8000-000000000071');
select pg_temp.expect('step 7: joining needs the domain proved first',
  public.request_join('board', (select linear from ids), 'gina@linear.app') ->> 'error' = 'not_verified'
  and public.request_join('board', (select linear from ids), 'gina@other.org') ->> 'error' = 'wrong_domain'
  and public.request_join('board', (select arc from s7), 'gina@arc.net') ->> 'error' = 'not_claimed');
select pg_temp.as_owner();
insert into public.verified_domain (domain, verified_by, method) values
  ('linear.app', '00000000-0000-4000-8000-000000000071', 'email'),
  ('linear.app', '00000000-0000-4000-8000-00000000000d', 'email');
select pg_temp.as_user('00000000-0000-4000-8000-000000000071');
select pg_temp.expect('step 7: request to join is filed once',
  (public.request_join('board', (select linear from ids), 'gina@linear.app') ->> 'ok')::boolean
  and (public.request_join('board', (select linear from ids), 'gina@linear.app') ->> 'already')::boolean);
select pg_temp.expect('step 7: one pending request',
  (select count(*) from public.join_request where status = 'pending') = 1);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 7: the board admins are told and can read the request',
  exists (select 1 from public.notification where kind = 'join' and actor = '00000000-0000-4000-8000-000000000071')
  and (select count(*) from public.join_request) = 1);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('step 7: outsiders cannot decide a join request',
  public.decide_join_request((select id from public.join_request limit 1), true) ->> 'error' is not null);
select pg_temp.as_owner();
create temp table s7_req as select id from public.join_request where user_id = '00000000-0000-4000-8000-000000000071';
grant select on s7_req to authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('step 7: ... not even by guessing its id',
  public.decide_join_request((select id from s7_req), true) ->> 'error' = 'not_allowed');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 7: approving adds a member and tells the requester',
  (public.decide_join_request((select id from s7_req), true) ->> 'ok')::boolean
  and public.decide_join_request((select id from s7_req), false) ->> 'error' = 'decided');
select pg_temp.as_user('00000000-0000-4000-8000-000000000071');
select pg_temp.expect('step 7: the new member is on the team and was notified',
  public.is_board_team((select linear from ids))
  and not public.is_board_admin((select linear from ids))
  and exists (select 1 from public.notification where kind = 'join' and data ->> 'status' = 'approved')
  and public.request_join('board', (select linear from ids), 'gina@linear.app') ->> 'error' = 'already_member');

-- team management and the last-owner rule
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 7: people outside the domain cannot be added',
  public.add_team_member('board', (select linear from ids), 'alice') ->> 'error' = 'wrong_domain'
  and public.add_team_member('board', (select linear from ids), 'nobody@linear.app') ->> 'error' = 'not_found');
select pg_temp.expect('step 7: an admin adds a teammate by email',
  public.add_team_member('board', (select linear from ids), 'Hank@linear.app') ->> 'handle' = 'hank'
  and public.add_team_member('board', (select linear from ids), '@hank') ->> 'error' = 'already_member');
select pg_temp.as_user('00000000-0000-4000-8000-000000000071');
select pg_temp.expect('step 7: members cannot manage the team',
  public.add_team_member('board', (select linear from ids), 'dave') ->> 'error' = 'not_allowed'
  and public.remove_team_member('board', (select linear from ids), (select hank from s7)) ->> 'error' = 'not_allowed');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 7: the owner makes gina an admin',
  (public.set_member_role('board', (select linear from ids), (select gina from s7), 'admin') ->> 'ok')::boolean);
select pg_temp.as_user('00000000-0000-4000-8000-000000000071');
select pg_temp.expect('step 7: only owners grant or take away ownership',
  public.set_member_role('board', (select linear from ids), (select bob from ids), 'member') ->> 'error' = 'owners_only'
  and public.set_member_role('board', (select linear from ids), (select hank from s7), 'owner') ->> 'error' = 'owners_only'
  and public.remove_team_member('board', (select linear from ids), (select bob from ids)) ->> 'error' = 'owners_only');
select pg_temp.expect('step 7: admins remove members',
  (public.remove_team_member('board', (select linear from ids), (select hank from s7)) ->> 'ok')::boolean);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 7: the last owner cannot step down or leave',
  public.set_member_role('board', (select linear from ids), (select bob from ids), 'admin') ->> 'error' = 'last_owner'
  and public.remove_team_member('board', (select linear from ids), (select bob from ids)) ->> 'error' = 'last_owner'
  and exists (select 1 from public.membership, ids where user_id = ids.bob and scope_id = ids.linear and role = 'owner'));
select pg_temp.expect('step 7: with a second owner, the first can step down',
  (public.set_member_role('board', (select linear from ids), (select gina from s7), 'owner') ->> 'ok')::boolean
  and (public.set_member_role('board', (select linear from ids), (select bob from ids), 'member') ->> 'ok')::boolean);

-- disputes
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.expect('step 7: a dispute needs a reason, a claimed board and a proved domain',
  public.open_dispute('board', (select linear from ids), 'short', 'dave@linear.app') ->> 'error' = 'reason_length'
  and public.open_dispute('board', (select arc from s7), 'Nobody at Arc runs this board', 'dave@arc.net') ->> 'error' = 'not_claimed'
  and public.open_dispute('board', (select linear from ids), 'A former contractor still controls it', 'dave@other.org') ->> 'error' = 'wrong_domain');
select pg_temp.expect('step 7: a dispute is filed once',
  (public.open_dispute('board', (select linear from ids), 'A former contractor still controls it', 'dave@linear.app') ->> 'ok')::boolean
  and (public.open_dispute('board', (select linear from ids), 'A former contractor still controls it', 'dave@linear.app') ->> 'already')::boolean);
select pg_temp.as_user('00000000-0000-4000-8000-000000000071');
select pg_temp.expect('step 7: the incumbent team cannot read disputes against it',
  not exists (select 1 from public.ownership_dispute, ids where scope_id = ids.linear)
  and public.open_dispute('board', (select linear from ids), 'I am on the team already, just testing', 'gina@linear.app') ->> 'error' = 'already_member');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select pg_temp.expect('step 7: platform admins see it',
  exists (select 1 from public.ownership_dispute, ids where scope_id = ids.linear and status = 'pending'));
select pg_temp.expect_error('step 7: the code sender is not callable over RPC',
  $$select public.v2_send_code('a@linear.app', 'linear.app', '123456')$$);

-- ------------------------------------------------------------ step 8: merge, reports, disputes, admins, release
-- State carried over: carol owns the cursor board (dave is blocked there), alice owns
-- the figma hub and the figma board, gina owns linear with bob as a member, dave has a
-- pending dispute on linear, and staff is the only platform admin.

select pg_temp.as_user('00000000-0000-4000-8000-000000000071');
insert into public.post (board_id, type, title) select cursor, 'bug'::public.v2_post_type, 'Cursor jumps to the top after apply' from ids;
select pg_temp.as_user('00000000-0000-4000-8000-000000000072');
insert into public.post (board_id, type, title) select cursor, 'bug'::public.v2_post_type, 'Caret position lost after applying a diff' from ids;
select pg_temp.as_owner();
create temp table s8 as
select (select id from public.post where title = 'Cursor jumps to the top after apply') as src,
       (select id from public.post where title = 'Caret position lost after applying a diff') as dst,
       null::uuid as reply;
grant select on s8 to anon, authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
insert into public.vote (post_id) select src from s8;
insert into public.vote (post_id) select dst from s8;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
insert into public.vote (post_id) select src from s8;
insert into public.reply (post_id, body) select dst, 'Happens to me on every apply' from s8;
select pg_temp.as_owner();
update s8 set reply = (select id from public.reply where body = 'Happens to me on every apply');

select pg_temp.as_user(null);
select pg_temp.expect_error('step 8: anon cannot merge', $$select public.merge_post((select src from s8), (select dst from s8))$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 8: only the board team merges',
  public.merge_post((select src from s8), (select dst from s8)) ->> 'error' = 'not_allowed');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: a post cannot be merged into itself',
  public.merge_post((select src from s8), (select src from s8)) ->> 'error' = 'same_post');
select pg_temp.expect('step 8: a merge across boards needs the team of both',
  public.merge_post((select src from s8), (select id from public.post where title = 'Dave on Linear')) ->> 'error' = 'not_allowed');
select pg_temp.expect('step 8: the team merges the duplicate; votes not already on the target move',
  (public.merge_post((select src from s8), (select dst from s8)) ->> 'moved')::int = 1);
select pg_temp.expect('step 8: target counts the moved vote, source is merged and points at it',
  (select vote_count from public.post, s8 where post.id = s8.dst) = 2
  and (select status = 'merged' and merged_into = s8.dst from public.post, s8 where post.id = s8.src)
  and exists (select 1 from public.status_event, s8 where post_id = s8.src and "to" = 'merged' and "from" = 'open'));
select pg_temp.as_owner();
select pg_temp.expect('step 8: ... gina and bob follow the target, and the merge was recorded',
  (select count(*) from public.follow, s8 where target = 'post' and target_id = s8.dst
     and user_id in ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-00000000000b')) = 2
  and (select cardinality(moved_voters) = 1 and cardinality(moved_followers) = 2 from public.merge_record, s8 where source_post_id = s8.src));
select pg_temp.as_user(null);
select pg_temp.expect('step 8: the merged-away post is gone for the public',
  not exists (select 1 from public.post, s8 where post.id = s8.src));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 8: the duplicate''s voters are told where it went',
  exists (select 1 from public.notification, s8 where kind = 'status_change' and target_id = s8.src
           and data ->> 'to' = 'merged' and (data ->> 'into')::uuid = s8.dst));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.expect_error('step 8: a merged post takes no votes',
  $$insert into public.vote (post_id) select src from s8$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: a merged post cannot be merged again, nor merged into',
  public.merge_post((select src from s8), (select dst from s8)) ->> 'error' = 'merged'
  and public.merge_post((select dst from s8), (select src from s8)) ->> 'error' = 'target_unavailable');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 8: outsiders cannot unmerge',
  public.unmerge_post((select src from s8)) ->> 'error' = 'not_allowed');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: unmerge within 10 minutes restores the status',
  public.unmerge_post((select src from s8)) ->> 'status' = 'open');
select pg_temp.as_owner();
select pg_temp.expect('step 8: ... returns the votes and follows, and leaves a status_event',
  (select vote_count from public.post, s8 where post.id = s8.dst) = 1
  and (select vote_count from public.post, s8 where post.id = s8.src) = 2
  and not exists (select 1 from public.follow, s8 where target = 'post' and target_id = s8.dst
                   and user_id in ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-00000000000b'))
  and exists (select 1 from public.follow, s8 where target = 'post' and target_id = s8.dst and user_id = '00000000-0000-4000-8000-00000000000a')
  and (select status = 'open' and merged_into is null from public.post, s8 where post.id = s8.src)
  and exists (select 1 from public.status_event, s8 where post_id = s8.src and "from" = 'merged' and "to" = 'open')
  and (select undone_at is not null from public.merge_record, s8 where source_post_id = s8.src));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: a post that is not merged cannot be unmerged',
  public.unmerge_post((select src from s8)) ->> 'error' = 'not_merged');
select public.merge_post((select src from s8), (select dst from s8));
select pg_temp.as_owner();
update public.merge_record set merged_at = now() - interval '11 minutes' where source_post_id = (select src from s8) and undone_at is null;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: after 10 minutes a merge is final',
  public.unmerge_post((select src from s8)) ->> 'error' = 'too_late');

-- reports
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
insert into public.report (target, target_id, reason) select 'post'::public.v2_report_target, dst, 'Spam or advertising' from s8;
select pg_temp.expect_error('step 8: one report per person per target',
  $$insert into public.report (target, target_id, reason) select 'post'::public.v2_report_target, dst, 'Again' from s8$$);
select pg_temp.expect_error('step 8: a report cannot be filed as someone else',
  $$insert into public.report (target, target_id, reason, reporter) select 'post'::public.v2_report_target, dst, 'Forged', alice from s8, ids$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
insert into public.report (target, target_id, reason) select 'post'::public.v2_report_target, dst, 'Harassment or hate' from s8;
insert into public.report (target, target_id, reason) select 'reply'::public.v2_report_target, reply, 'Off-topic' from s8;
select pg_temp.expect('step 8: reporters see only their own reports',
  not exists (select 1 from public.report where reporter <> '00000000-0000-4000-8000-00000000000a')
  and (select count(*) from public.report, s8 where target_id in (s8.dst, s8.reply)) = 2);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: board teams cannot read or decide reports',
  not exists (select 1 from public.report)
  and public.decide_reports('post', (select dst from s8), 'dismiss') ->> 'error' = 'not_allowed');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select pg_temp.expect('step 8: platform admins read the whole queue',
  (select count(*) from public.report, s8 where status = 'open' and target_id in (s8.dst, s8.reply)) = 3);
select pg_temp.expect('step 8: hide-and-resolve decides every open report on the target',
  (public.decide_reports('post', (select dst from s8), 'hide') ->> 'decided')::int = 2);
select pg_temp.expect('step 8: ... hides the post and records who decided',
  (select hidden_at is not null from public.post, s8 where post.id = s8.dst)
  and (select count(*) from public.report, s8 where target_id = s8.dst and status = 'actioned' and decided_by = '00000000-0000-4000-8000-00000000000f') = 2);
select pg_temp.expect('step 8: a decided target cannot be decided twice; dismiss works on replies',
  public.decide_reports('post', (select dst from s8), 'dismiss') ->> 'error' = 'decided'
  and (public.decide_reports('reply', (select reply from s8), 'dismiss') ->> 'ok')::boolean);
select pg_temp.expect('step 8: ... and dismissing leaves the reply visible',
  (select hidden_at is null from public.reply, s8 where reply.id = s8.reply));
select public.set_post_hidden((select dst from s8), false);
select pg_temp.expect('step 8: platform admins unhide through the existing RPC',
  (select hidden_at is null from public.post, s8 where post.id = s8.dst));

-- disputes
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.expect_error('step 8: disputes cannot be inserted directly (only open_dispute)',
  $$insert into public.ownership_dispute (scope, scope_id, reason, work_email)
    select 'board'::public.v2_scope, cursor, 'Inserted straight into the table', 'dave@cursor.com' from ids$$);
select pg_temp.as_owner();
create temp table s8d as select id from public.ownership_dispute where user_id = '00000000-0000-4000-8000-00000000000d' and status = 'pending';
insert into public.ownership_dispute (user_id, scope, scope_id, reason, work_email)
select '00000000-0000-4000-8000-000000000072', 'board', linear, 'Second claim on the same board', 'hank@linear.app' from ids;
create temp table s8r as select id from public.ownership_dispute where user_id = '00000000-0000-4000-8000-000000000072';
grant select on s8d, s8r to authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: only platform admins decide disputes',
  public.decide_dispute((select id from s8d), true) ->> 'error' = 'not_allowed');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select pg_temp.expect('step 8: rejecting a dispute is recorded',
  (public.decide_dispute((select id from s8r), false) ->> 'ok')::boolean);
select pg_temp.expect('step 8: ... and changes nothing on the board',
  exists (select 1 from public.membership, ids where scope_id = ids.linear and user_id = '00000000-0000-4000-8000-000000000071' and role = 'owner'));
select pg_temp.expect('step 8: approving a dispute succeeds once',
  (public.decide_dispute((select id from s8d), true) ->> 'ok')::boolean);
select pg_temp.expect('step 8: ... transfers ownership to the filer and removes the incumbent team',
  (select array_agg(user_id::text || ':' || role::text) from public.membership, ids where scope = 'board' and scope_id = ids.linear)
      = array['00000000-0000-4000-8000-00000000000d:owner']
  and public.decide_dispute((select id from s8d), false) ->> 'error' = 'decided');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.expect('step 8: the filer is told and now manages the board',
  exists (select 1 from public.notification where kind = 'claim' and data ->> 'dispute' = 'approved')
  and public.is_board_admin((select linear from ids)));
select pg_temp.as_user('00000000-0000-4000-8000-000000000072');
select pg_temp.expect('step 8: a rejected filer is told too',
  exists (select 1 from public.notification where kind = 'claim' and data ->> 'dispute' = 'rejected'));

-- block (FOUNDATION §6: a team blocks a user from posting on its boards)
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
insert into public.block (scope, scope_id, user_id) select 'board'::public.v2_scope, linear, bob from ids;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect_error('step 8: a blocked user cannot post on the blocking board',
  $$insert into public.post (board_id, type, title) select linear, 'bug', 'Bob is blocked' from ids$$);
select pg_temp.expect_error('step 8: only the scope's owners and admins block',
  $$insert into public.block (scope, scope_id, user_id) select 'board'::public.v2_scope, linear, dave from ids$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
delete from public.block where scope = 'board' and user_id = '00000000-0000-4000-8000-00000000000b';
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
insert into public.post (board_id, type, title) select linear, 'bug'::public.v2_post_type, 'Bob is back' from ids;
select pg_temp.expect('step 8: unblocking lets them post again', exists (select 1 from public.post where title = 'Bob is back'));

-- release a claimed board or hub
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 8: only an owner can release a board',
  public.release_scope('board', (select linear from ids)) ->> 'error' = 'owners_only');
select pg_temp.as_owner();
insert into public.join_request (user_id, scope, scope_id, work_email)
select '00000000-0000-4000-8000-000000000072', 'board', linear, 'hank@linear.app' from ids;
insert into public.block (scope, scope_id, user_id) select 'board'::public.v2_scope, linear, bob from ids;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.expect('step 8: the sole owner releases the board: unclaimed, no team, requests withdrawn, blocks lifted',
  (public.release_scope('board', (select linear from ids)) ->> 'ok')::boolean);
select pg_temp.as_owner();
select pg_temp.expect('step 8: ... and it is really back to unclaimed',
  (select claimed_at is null from public.board, ids where board.id = ids.linear)
  and not exists (select 1 from public.membership, ids where scope_id = ids.linear)
  and not exists (select 1 from public.join_request, ids where scope_id = ids.linear and status = 'pending')
  and not exists (select 1 from public.block, ids where scope_id = ids.linear));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: the last owner still cannot simply leave a claimed board',
  public.remove_team_member('board', (select cursor from ids), (select carol from ids)) ->> 'error' = 'last_owner');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('step 8: an owner can release a board inside a claimed hub',
  (public.release_scope('board', (select figma from s7)) ->> 'ok')::boolean);
select pg_temp.expect('step 8: ... its own team goes but the hub still covers it',
  not exists (select 1 from public.membership where scope = 'board' and scope_id = (select figma from s7))
  and (select claimed_at is not null from public.board where id = (select figma from s7))
  and public.is_board_admin((select figma from s7)));
select pg_temp.as_user('00000000-0000-4000-8000-00000000000e');
select pg_temp.expect('step 8: a hub admin who is not an owner cannot release the hub',
  public.release_scope('hub', (select figma_hub from ids)) ->> 'error' = 'owners_only');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect('step 8: the hub owner releases the hub: hub and its boards unclaimed, no team left',
  (public.release_scope('hub', (select figma_hub from ids)) ->> 'ok')::boolean);
select pg_temp.as_owner();
select pg_temp.expect('step 8: ... every board of the hub is claimable again',
  (select claimed_at is null from public.hub, ids where hub.id = ids.figma_hub)
  and not exists (select 1 from public.board, ids where hub_id = ids.figma_hub and claimed_at is not null)
  and not exists (select 1 from public.membership, ids where scope = 'hub' and scope_id = ids.figma_hub));

-- platform admins: appoint, remove, audit; lookups reveal nothing to non-admins
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect('step 8: non-admins learn nothing from a lookup (same answer for real and made-up accounts)',
  public.admin_find_user('carol@cursor.com') = public.admin_find_user('nobody@nowhere.test')
  and public.admin_find_user('carol@cursor.com') ->> 'error' = 'not_allowed');
select pg_temp.expect('step 8: non-admins cannot appoint or remove admins',
  public.grant_platform_admin((select bob from ids)) ->> 'error' = 'not_allowed'
  and public.revoke_platform_admin((select staff from ids)) ->> 'error' = 'not_allowed');
select pg_temp.expect_error('step 8: platform_admin is not client-writable',
  $$insert into public.platform_admin (user_id) select bob from ids$$);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select pg_temp.expect('step 8: admins look people up by email or handle',
  public.admin_find_user('Carol@Cursor.com') -> 'user' ->> 'handle' = 'carol'
  and (public.admin_find_user('@staff') -> 'user' ->> 'is_admin')::boolean
  and public.admin_find_user('nobody') ->> 'error' = 'not_found');
select pg_temp.expect('step 8: the last admin cannot be removed',
  public.revoke_platform_admin((select staff from ids)) ->> 'error' = 'last_admin');
select pg_temp.expect('step 8: an admin appoints another admin',
  (public.grant_platform_admin((select carol from ids)) ->> 'ok')::boolean);
select pg_temp.expect('step 8: ... once',
  public.grant_platform_admin((select carol from ids)) ->> 'error' = 'already_admin');
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.expect('step 8: the new admin reads the audit log',
  exists (select 1 from public.platform_admin_event, ids where action = 'grant' and user_id = ids.carol and actor_id = ids.staff));
select pg_temp.expect('step 8: ... and removes the first admin',
  (public.revoke_platform_admin((select staff from ids)) ->> 'ok')::boolean);
select pg_temp.expect('step 8: ... but now cannot remove themselves, the last admin',
  public.revoke_platform_admin((select carol from ids)) ->> 'error' = 'last_admin');
select pg_temp.expect('step 8: every appointment and removal is logged',
  (select count(*) from public.platform_admin_event) = 2);
select pg_temp.as_user('00000000-0000-4000-8000-00000000000f');
select pg_temp.expect('step 8: a removed admin loses the queue and the log',
  not exists (select 1 from public.platform_admin_event) and not exists (select 1 from public.report)
  and public.decide_reports('reply', (select reply from s8), 'resolve') ->> 'error' = 'not_allowed');
select pg_temp.as_owner();
select pg_temp.expect_error('step 8: the last admin cannot be deleted even by a cascade',
  $$delete from public.platform_admin$$);

\echo 'v2 RLS tests: all passed'
rollback;
