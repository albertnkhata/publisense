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
insert into public.ownership_dispute (scope, scope_id, reason, work_email)
select 'board'::public.v2_scope, cursor, 'I run the Cursor team, this owner left.', 'alice@cursor.com' from ids;

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

\echo 'v2 RLS tests: all passed'
rollback;
