-- The visibility-helper oracle is closed (0047, #179). Runs as the real API roles
-- (anon / authenticated + jwt sub) in one transaction that is ROLLED BACK, with its
-- own fixtures, so it needs no seed and stubs nothing.
--
-- Before 0047 a signed-out visitor could ask, for example,
--   v2_board_visible(<pending board>, uid := <its creator>)  -> true
--   can_see_post(<post on it>, uid := <its creator>)         -> true
--   post_board(<that post>)                                  -> its board id
-- Now the public helpers take no uid (they answer for auth.uid() only), post_board
-- answers only for readable posts, and the uid-taking versions live in `private`,
-- which PostgREST does not expose. The creator, the team and blocked users still get
-- the same answers about themselves, and the policies built on them still hold.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_helper_oracle_test.sql

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
-- creator: adds a pending board and posts on it; also on the team of a live board,
--          and blocked on a second live board.
-- other:   a signed-in member with no relation to any of it.

create temp table f as
  select gen_random_uuid() as creator, gen_random_uuid() as other,
         gen_random_uuid() as live, gen_random_uuid() as blocked_board,
         gen_random_uuid() as live_post, gen_random_uuid() as hidden_post,
         null::uuid as pending, null::uuid as pending_post;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select creator, 'oracle-creator-' || left(creator::text, 8) || '@publisense.test', now(), '{"full_name":"Ora Creator"}'::jsonb from f
union all select other, 'oracle-other-' || left(other::text, 8) || '@publisense.test', now(), '{"full_name":"Oli Other"}'::jsonb from f;

insert into public.board (id, slug, name, tagline, site, category, status, claimed_at)
select live, 'oracle-live-' || left(live::text, 8), 'Oracle Live', 'A live board for the oracle test', 'oracle-live-ci.dev', 'dev', 'live', now() from f
union all
select blocked_board, 'oracle-blk-' || left(blocked_board::text, 8), 'Oracle Blocked', 'A board the creator is blocked on', 'oracle-blk-ci.dev', 'dev', 'live', null from f;
insert into public.membership (user_id, scope, scope_id, role)
select creator, 'board'::public.v2_scope, live, 'admin'::public.v2_role from f;
insert into public.block (scope, scope_id, user_id) select 'board'::public.v2_scope, blocked_board, creator from f;
insert into public.post (id, board_id, author_id, type, title, body)
select live_post,   live, other, 'feature'::public.v2_post_type, 'Oracle live post',   'readable by everyone' from f union all
select hidden_post, live, other, 'bug'::public.v2_post_type,     'Oracle hidden post', 'hidden by the team' from f;
update public.post set hidden_at = now() where id = (select hidden_post from f);

-- The creator adds a product (pending) through the real RPC and posts on it.
select pg_temp.as_user((select creator from f));
create temp table s (k text primary key, v jsonb);
grant select, insert on s to anon, authenticated;
insert into s values ('b', public.create_board('https://oracle-pending-ci.dev', 'Oracle Pending', 'A pending product for the oracle test', 'dev'));
select pg_temp.as_owner();
update f set pending = (select id from public.board where site ilike '%oracle-pending-ci.dev%' and created_by = f.creator);
select pg_temp.expect('fixture: the pending board exists and is pending',
  (select status = 'pending' from public.board where id = (select pending from f)));
select pg_temp.as_user((select creator from f));
insert into public.post (board_id, type, title, body)
select pending, 'bug', 'Oracle pending post', 'only the creator sees this' from f;
select pg_temp.as_owner();
update f set pending_post = (select id from public.post where board_id = f.pending);
select pg_temp.expect('fixture: the post on the pending board exists', (select pending_post is not null from f));

-- ================================================================ 1. the old oracle calls are gone

select pg_temp.expect('schema: no public helper takes a uid any more',
  not exists (select 1 from pg_proc p
               where p.pronamespace = 'public'::regnamespace
                 and p.proname in ('can_see_post', 'v2_board_visible', 'v2_board_open', 'v2_hub_visible', 'is_board_team',
                                   'is_board_admin', 'is_scope_team', 'is_scope_admin', 'v2_scope_role', 'is_blocked', 'post_board')
                 and 'uid' = any(coalesce(p.proargnames, '{}'))));

select pg_temp.as_user(null);
select pg_temp.expect_error('anon: v2_board_visible(board, uid := creator) no longer exists',
  format('select public.v2_board_visible(%L::uuid, uid => %L::uuid)', (select pending from f), (select creator from f)));
select pg_temp.expect_error('anon: can_see_post(post, uid := creator) no longer exists',
  format('select public.can_see_post(%L::uuid, uid => %L::uuid)', (select pending_post from f), (select creator from f)));
select pg_temp.expect_error('anon: is_board_team(board, uid := team member) no longer exists',
  format('select public.is_board_team(%L::uuid, uid => %L::uuid)', (select live from f), (select creator from f)));
select pg_temp.expect_error('anon: is_scope_admin(scope, id, uid) no longer exists',
  format('select public.is_scope_admin(''board'', %L::uuid, uid => %L::uuid)', (select live from f), (select creator from f)));
select pg_temp.expect_error('anon: v2_scope_role(scope, id, uid) no longer exists',
  format('select public.v2_scope_role(''board'', %L::uuid, uid => %L::uuid)', (select live from f), (select creator from f)));
select pg_temp.expect_error('anon: positional two-argument calls no longer resolve either',
  format('select public.v2_board_open(%L::uuid, %L::uuid)', (select pending from f), (select creator from f)));
select pg_temp.expect_error('anon: is_blocked is not callable signed out',
  format('select public.is_blocked(%L::uuid)', (select blocked_board from f)));
select pg_temp.expect_error('anon: private.v2_scope_role is not executable by the API roles',
  format('select private.v2_scope_role(''board'', %L::uuid, %L::uuid)', (select live from f), (select creator from f)));

-- ================================================================ 2. anon learns nothing

select pg_temp.expect('anon: v2_board_visible(pending) is false', not public.v2_board_visible((select pending from f)));
select pg_temp.expect('anon: can_see_post(pending post) is false', not public.can_see_post((select pending_post from f)));
select pg_temp.expect('anon: post_board(pending post) is null', public.post_board((select pending_post from f)) is null);
select pg_temp.expect('anon: post_board(hidden post) is null', public.post_board((select hidden_post from f)) is null);
select pg_temp.expect('anon: is_board_team / is_board_admin are false',
  not public.is_board_team((select live from f)) and not public.is_board_admin((select live from f)));
select pg_temp.expect('anon: is_scope_team / is_scope_admin are false',
  not public.is_scope_team('board', (select live from f)) and not public.is_scope_admin('board', (select live from f)));
select pg_temp.expect('anon: v2_scope_role is null', public.v2_scope_role('board', (select live from f)) is null);
select pg_temp.expect('anon: v2_board_open(pending) is false', not public.v2_board_open((select pending from f)));
-- ...and still sees the public site.
select pg_temp.expect('anon: v2_board_visible(live) is true', public.v2_board_visible((select live from f)));
select pg_temp.expect('anon: can_see_post(live post) is true', public.can_see_post((select live_post from f)));
select pg_temp.expect('anon: post_board(live post) is its board', public.post_board((select live_post from f)) = (select live from f));
select pg_temp.expect('anon: reads the live board and its visible post, not the pending ones',
  (select count(*) from public.board where id in ((select live from f), (select pending from f))) = 1
  and (select count(*) from public.post where id in ((select live_post from f), (select hidden_post from f), (select pending_post from f))) = 1);

-- ================================================================ 3. another member learns nothing

select pg_temp.as_user((select other from f));
select pg_temp.expect_error('other: v2_board_visible(board, uid := creator) no longer exists',
  format('select public.v2_board_visible(%L::uuid, %L::uuid)', (select pending from f), (select creator from f)));
select pg_temp.expect_error('other: can_see_post(post, uid := creator) no longer exists',
  format('select public.can_see_post(%L::uuid, %L::uuid)', (select pending_post from f), (select creator from f)));
select pg_temp.expect_error('other: is_blocked(board, uid := creator) no longer exists',
  format('select public.is_blocked(%L::uuid, %L::uuid)', (select blocked_board from f), (select creator from f)));
select pg_temp.expect('other: v2_board_visible(pending) is false', not public.v2_board_visible((select pending from f)));
select pg_temp.expect('other: can_see_post(pending post) is false', not public.can_see_post((select pending_post from f)));
select pg_temp.expect('other: post_board(pending post) is null', public.post_board((select pending_post from f)) is null);
select pg_temp.expect('other: is_board_team(live) is false (asks about themselves)', not public.is_board_team((select live from f)));
select pg_temp.expect('other: is_blocked(blocked board) is false (asks about themselves)', not public.is_blocked((select blocked_board from f)));
select pg_temp.expect('other: cannot read the pending board or its post',
  not exists (select 1 from public.board where id = (select pending from f))
  and not exists (select 1 from public.post where id = (select pending_post from f)));
select pg_temp.expect('other: the author of a hidden post still reads it', exists (select 1 from public.post where id = (select hidden_post from f)));
select pg_temp.expect('other: post_board(own hidden post) still answers', public.post_board((select hidden_post from f)) = (select live from f));
select pg_temp.expect_error('other: cannot vote on the pending post (policy via private.can_see_post)',
  format('insert into public.vote (post_id) values (%L)', (select pending_post from f)));
insert into public.vote (post_id) select live_post from f;
select pg_temp.expect('other: still votes on a live post', exists (select 1 from public.vote where post_id = (select live_post from f) and user_id = (select other from f)));

-- ================================================================ 4. the creator / team / blocked user: same answers about themselves

select pg_temp.as_user((select creator from f));
select pg_temp.expect('creator: v2_board_visible(own pending) is true', public.v2_board_visible((select pending from f)));
select pg_temp.expect('creator: can_see_post(own pending post) is true', public.can_see_post((select pending_post from f)));
select pg_temp.expect('creator: post_board(own pending post) is the board', public.post_board((select pending_post from f)) = (select pending from f));
select pg_temp.expect('creator: reads own pending board and post',
  exists (select 1 from public.board where id = (select pending from f))
  and exists (select 1 from public.post where id = (select pending_post from f)));
select pg_temp.expect('team: is_board_team / is_board_admin(live) are true',
  public.is_board_team((select live from f)) and public.is_board_admin((select live from f)));
select pg_temp.expect('team: is_scope_admin and v2_scope_role (client RPC) answer',
  public.is_scope_admin('board', (select live from f)) and public.v2_scope_role('board', (select live from f)) = 'admin');
select pg_temp.expect('team: reads the hidden post on its board (policy via private.is_board_team)',
  exists (select 1 from public.post where id = (select hidden_post from f)));
select pg_temp.expect('team: post_board(hidden post) answers for the team', public.post_board((select hidden_post from f)) = (select live from f));
select pg_temp.expect('blocked: is_blocked(blocked board) is true', public.is_blocked((select blocked_board from f)));
select pg_temp.expect_error('blocked: the post insert trigger still refuses (private.is_blocked)',
  format('insert into public.post (board_id, type, title, body) values (%L, ''bug'', ''Oracle blocked try'', '''')', (select blocked_board from f)));
insert into public.reply (post_id, body) select live_post, 'team reply through the trigger' from f;
select pg_temp.expect('team: replies on its board (reply trigger via private.is_board_team / post_board)',
  exists (select 1 from public.reply where post_id = (select live_post from f) and author_id = (select creator from f)));

select pg_temp.as_owner();
select 'v2 helper oracle tests: all passed';
rollback;
