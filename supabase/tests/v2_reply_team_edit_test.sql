-- Official replies are editable only by a current team member (0053). Runs as the real
-- API roles inside a transaction that ROLLS BACK, with its own fixtures (.test
-- addresses), so it runs on CI and, read-only in effect, against production.
--
--   * A current teammate (board team or hub team) edits their official reply while the
--     post is open, any age.
--   * Once they leave the team, or an admin removes them, the database refuses with hint
--     edit_not_team_member and writes nothing; rejoining restores it.
--   * A locked post still answers edit_locked_status first.
--   * A former teammate's community replies follow the 1-hour window like anyone's.
--   * Deleting their own old official reply is unchanged (still allowed).
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_reply_team_edit_test.sql

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
create function pg_temp.expect_error(label text, stmt text, want_hint text default null) returns void language plpgsql as $$
declare h text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics h = pg_exception_hint;
    if want_hint is not null and h is distinct from want_hint then
      raise exception 'FAIL % : refused with hint % (%), wanted %', label, coalesce(h, 'none'), sqlerrm, want_hint;
    end if;
    raise notice 'ok   % (refused: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % : statement succeeded but should have been refused', label;
end $$;

-- ------------------------------------------------------------ fixtures (as owner)

create temp table f as
  select gen_random_uuid() as own, gen_random_uuid() as adm, gen_random_uuid() as lea, gen_random_uuid() as rem,
         gen_random_uuid() as hubm, gen_random_uuid() as ben,
         gen_random_uuid() as hub, gen_random_uuid() as board,
         gen_random_uuid() as open_post, gen_random_uuid() as shipped_post;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select own, 'own-' || left(own::text, 8) || '@re53.test', now(), '{"full_name":"Olive Owner"}'::jsonb from f
union all select adm,  'adm-'  || left(adm::text, 8)  || '@re53.test', now(), '{"full_name":"Ada Admin"}'::jsonb from f
union all select lea,  'lea-'  || left(lea::text, 8)  || '@re53.test', now(), '{"full_name":"Leo Leaver"}'::jsonb from f
union all select rem,  'rem-'  || left(rem::text, 8)  || '@re53.test', now(), '{"full_name":"Remy Removed"}'::jsonb from f
union all select hubm, 'hubm-' || left(hubm::text, 8) || '@re53.test', now(), '{"full_name":"Hana Hub"}'::jsonb from f
union all select ben,  'ben-'  || left(ben::text, 8)  || '@re53.test', now(), '{"full_name":"Ben"}'::jsonb from f;

insert into public.hub (id, slug, name, claimed_at) select hub, 're53hub', 'RE53 Hub', now() from f;
insert into public.board (id, slug, name, site, claimed_at, hub_id)
select board, 're53board', 'RE53 Board', 're53.test', now(), hub from f;
insert into public.membership (user_id, scope, scope_id, role)
select own, 'board'::public.v2_scope, board, 'owner'::public.v2_role from f
union all select adm,  'board', board, 'admin'  from f
union all select lea,  'board', board, 'member' from f
union all select rem,  'board', board, 'member' from f
union all select hubm, 'hub',   hub,   'member' from f;

insert into public.post (id, board_id, author_id, type, title, body)
select open_post,    board, ben, 'feature'::public.v2_post_type, 'Team edit open post',    '' from f union all
select shipped_post, board, ben, 'feature', 'Team edit shipped post', '' from f;

create temp table r (name text primary key, id uuid);
grant select on r to anon, authenticated;
create function pg_temp.reply(name text, post uuid, author uuid, official boolean, age interval) returns void language plpgsql as $$
declare v uuid;
begin
  insert into public.reply (post_id, author_id, body, is_official) values (post, author, 'original ' || name, official)
  returning id into v;
  update public.reply set created_at = now() - age where id = v;
  insert into r values (reply.name, v);
end $$;
select pg_temp.reply('own_off',      (select open_post from f),    (select own from f),  true,  interval '3 days');
select pg_temp.reply('hub_off',      (select open_post from f),    (select hubm from f), true,  interval '2 days');
select pg_temp.reply('lea_off',      (select open_post from f),    (select lea from f),  true,  interval '2 days');
select pg_temp.reply('lea_off_del',  (select open_post from f),    (select lea from f),  true,  interval '2 days');
select pg_temp.reply('lea_comm',     (select open_post from f),    (select lea from f),  false, interval '5 minutes');
select pg_temp.reply('lea_comm_old', (select open_post from f),    (select lea from f),  false, interval '61 minutes');
select pg_temp.reply('rem_off',      (select open_post from f),    (select rem from f),  true,  interval '5 minutes');
select pg_temp.reply('lea_ship_off', (select shipped_post from f), (select lea from f),  true,  interval '5 minutes');
update public.post set status = 'shipped' where id = (select shipped_post from f);

create function pg_temp.body(name text) returns text language sql as $$
  select body from public.reply where id = (select id from r where r.name = body.name);
$$;
create function pg_temp.edit(name text) returns text language sql as $$
  select format('update public.reply set body = %L where id = %L', 'changed ' || name, (select id from r where r.name = edit.name));
$$;

-- ------------------------------------------------------------ schema

select pg_temp.expect('0053: the guard checks team membership with the private helper (hint edit_not_team_member)',
  (select prosrc like '%private.is_board_team(private.post_board(old.post_id), old.author_id)%'
          and prosrc like '%edit_not_team_member%'
     from pg_proc where oid = 'public.v2_reply_author_edit_guard()'::regprocedure));
select pg_temp.expect('0053: the guard stays SECURITY INVOKER and keeps the 0051 hints',
  (select not prosecdef and prosrc like '%edit_locked_status%' and prosrc like '%edit_window_closed%'
     from pg_proc where oid = 'public.v2_reply_author_edit_guard()'::regprocedure));

-- ------------------------------------------------------------ current members edit

select pg_temp.as_user((select own from f));
update public.reply set body = 'owner corrected' where id = (select id from r where name = 'own_off');
select pg_temp.as_user((select hubm from f));
update public.reply set body = 'hub member corrected' where id = (select id from r where name = 'hub_off');
select pg_temp.as_user((select lea from f));
update public.reply set body = 'still on the team' where id = (select id from r where name = 'lea_off');
select pg_temp.as_owner();
select pg_temp.expect('0053: current board-team and hub-team members edit their old official replies',
  pg_temp.body('own_off') = 'owner corrected' and pg_temp.body('hub_off') = 'hub member corrected'
  and pg_temp.body('lea_off') = 'still on the team');

-- ------------------------------------------------------------ leaving the team

select pg_temp.as_user((select lea from f));
delete from public.membership where user_id = (select lea from f) and scope = 'board' and scope_id = (select board from f);
select pg_temp.as_owner();
select pg_temp.expect('fixture: the leaver left the team (API role, own row)',
  not private.is_board_team((select board from f), (select lea from f)));

select pg_temp.as_user((select lea from f));
select pg_temp.expect_error('0053: after leaving, their official reply can no longer be edited',
  pg_temp.edit('lea_off'), 'edit_not_team_member');
select pg_temp.expect_error('0053: a locked post still answers edit_locked_status first',
  pg_temp.edit('lea_ship_off'), 'edit_locked_status');
update public.reply set body = 'my own comment, fixed' where id = (select id from r where name = 'lea_comm');
select pg_temp.expect_error('0053: their old community reply still follows the window (edit_window_closed)',
  pg_temp.edit('lea_comm_old'), 'edit_window_closed');
select pg_temp.as_owner();
select pg_temp.expect('0053: a former teammate still edits a fresh community reply (window rules unchanged)',
  pg_temp.body('lea_comm') = 'my own comment, fixed');

-- ------------------------------------------------------------ removed by an admin

select pg_temp.as_user((select adm from f));
delete from public.membership where user_id = (select rem from f) and scope = 'board' and scope_id = (select board from f);
select pg_temp.as_owner();
select pg_temp.expect('fixture: the admin removed the member (API role)',
  not private.is_board_team((select board from f), (select rem from f)));
select pg_temp.as_user((select rem from f));
select pg_temp.expect_error('0053: a removed member cannot edit their official reply, even a fresh one',
  pg_temp.edit('rem_off'), 'edit_not_team_member');

-- ------------------------------------------------------------ nothing written; rejoin; unchanged

select pg_temp.as_owner();
select pg_temp.expect('0053: the refused edits wrote nothing',
  pg_temp.body('lea_off') = 'still on the team' and pg_temp.body('rem_off') = 'original rem_off'
  and pg_temp.body('lea_ship_off') = 'original lea_ship_off' and pg_temp.body('lea_comm_old') = 'original lea_comm_old');

insert into public.membership (user_id, scope, scope_id, role)
select lea, 'board', board, 'member' from f;
select pg_temp.as_user((select lea from f));
update public.reply set body = 'back on the team' where id = (select id from r where name = 'lea_off');
select pg_temp.as_owner();
select pg_temp.expect('0053: rejoining the team restores editing (the rule is current membership)',
  pg_temp.body('lea_off') = 'back on the team');
delete from public.membership where user_id = (select lea from f) and scope = 'board' and scope_id = (select board from f);

select pg_temp.as_user((select own from f));
update public.reply set body = 'owner rewrite of a former teammate' where id = (select id from r where name = 'rem_off');  -- 0 rows (RLS)
select pg_temp.as_owner();
select pg_temp.expect('0053: still no team edits of someone else''s official reply',
  pg_temp.body('rem_off') = 'original rem_off');

select pg_temp.as_user((select lea from f));
delete from public.reply where id = (select id from r where name = 'lea_off_del');
select pg_temp.as_owner();
select pg_temp.expect('0053: deleting is unchanged: a former teammate still deletes their own old official reply',
  not exists (select 1 from public.reply where id = (select id from r where name = 'lea_off_del')));

update public.reply set body = 'owner support fix' where id = (select id from r where name = 'rem_off');
select pg_temp.expect('0053: the table owner (migrations, support fixes) is not bound by the rule',
  pg_temp.body('rem_off') = 'owner support fix');

rollback;
