-- Reply edit rules (0051, #181). Runs as the real API roles inside a transaction that
-- ROLLS BACK, with its own fixtures (.test addresses), so it runs on CI and, read-only in
-- effect, against production.
--
--   * Community replies: their author edits for v2_post_edit_window() (1 hour, shared with
--     posts), never after; locked once the post is Shipped, Closed or Merged.
--   * Official replies: author-only, exempt from the window while the post is open,
--     locked with the post.
--   * Nobody edits someone else's reply (team members included).
--   * Deleting your own reply and team moderation are unchanged.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_reply_edit_rules_test.sql

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
  select gen_random_uuid() as ann, gen_random_uuid() as ben, gen_random_uuid() as tm1, gen_random_uuid() as tm2,
         gen_random_uuid() as board,
         gen_random_uuid() as open_post, gen_random_uuid() as shipped_post,
         gen_random_uuid() as closed_post, gen_random_uuid() as merged_post;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ann, 'ann-' || left(ann::text, 8) || '@re51.test', now(), '{"full_name":"Ann"}'::jsonb from f
union all select ben, 'ben-' || left(ben::text, 8) || '@re51.test', now(), '{"full_name":"Ben"}'::jsonb from f
union all select tm1, 'tm1-' || left(tm1::text, 8) || '@re51.test', now(), '{"full_name":"Tess Team"}'::jsonb from f
union all select tm2, 'tm2-' || left(tm2::text, 8) || '@re51.test', now(), '{"full_name":"Theo Team"}'::jsonb from f;

insert into public.board (id, slug, name, site, claimed_at)
select board, 're51board', 'RE Board', 're51.test', now() from f;
insert into public.membership (user_id, scope, scope_id, role)
select tm1, 'board'::public.v2_scope, board, 'owner'::public.v2_role from f union all select tm2, 'board', board, 'member' from f;

insert into public.post (id, board_id, author_id, type, title, body)
select open_post,    board, ben, 'feature'::public.v2_post_type, 'Edit rules open post',    '' from f union all
select shipped_post, board, ben, 'feature', 'Edit rules shipped post', '' from f union all
select closed_post,  board, ben, 'feature', 'Edit rules closed post',  '' from f union all
select merged_post,  board, ben, 'feature', 'Edit rules merged post',  '' from f;

-- Replies are written as owner (the insert trigger keeps author_id and is_official), so
-- the rate limit and notifications don't shape the test.
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
select pg_temp.reply('fresh',        (select open_post from f),    (select ann from f), false, interval '5 minutes');
select pg_temp.reply('old',          (select open_post from f),    (select ann from f), false, interval '61 minutes');
select pg_temp.reply('old_del',      (select open_post from f),    (select ann from f), false, interval '2 days');
select pg_temp.reply('off_old',      (select open_post from f),    (select tm1 from f), true,  interval '3 days');
select pg_temp.reply('ship_fresh',   (select shipped_post from f), (select ann from f), false, interval '5 minutes');
select pg_temp.reply('ship_off',     (select shipped_post from f), (select tm1 from f), true,  interval '5 minutes');
select pg_temp.reply('closed_fresh', (select closed_post from f),  (select ann from f), false, interval '5 minutes');
select pg_temp.reply('closed_off',   (select closed_post from f),  (select tm1 from f), true,  interval '2 days');
select pg_temp.reply('merged_fresh', (select merged_post from f),  (select ann from f), false, interval '5 minutes');
select pg_temp.reply('merged_off',   (select merged_post from f),  (select tm1 from f), true,  interval '5 minutes');

update public.post set status = 'shipped' where id = (select shipped_post from f);
update public.post set status = 'closed'  where id = (select closed_post from f);
update public.post set status = 'merged', merged_into = (select open_post from f) where id = (select merged_post from f);

create function pg_temp.body(name text) returns text language sql as $$
  select body from public.reply where id = (select id from r where r.name = body.name);
$$;
create function pg_temp.edit(name text) returns text language sql as $$
  select format('update public.reply set body = %L where id = %L', 'changed ' || name, (select id from r where r.name = edit.name));
$$;

-- ------------------------------------------------------------ schema

select pg_temp.expect('0051: the edit guard trigger is on reply',
  exists (select 1 from pg_trigger where tgrelid = 'public.reply'::regclass and tgname = 'v2_reply_author_edit_guard' and not tgisinternal));
select pg_temp.expect('0051: the guard reads the shared window (v2_post_edit_window), still 1 hour',
  (select prosrc like '%v2_post_edit_window()%' from pg_proc where oid = 'public.v2_reply_author_edit_guard()'::regprocedure)
  and public.v2_post_edit_window() = interval '1 hour');
select pg_temp.expect('0051: the guard is SECURITY INVOKER (it must see the caller''s role)',
  not (select prosecdef from pg_proc where oid = 'public.v2_reply_author_edit_guard()'::regprocedure));

-- ------------------------------------------------------------ community replies

select pg_temp.as_user((select ann from f));
update public.reply set body = 'fixed a typo' where id = (select id from r where name = 'fresh');
select pg_temp.as_owner();
select pg_temp.expect('0051: the author edits a community reply inside the window (edited_at stamped)',
  pg_temp.body('fresh') = 'fixed a typo'
  and (select edited_at is not null from public.reply where id = (select id from r where name = 'fresh')));

select pg_temp.as_user((select ann from f));
select pg_temp.expect_error('0051: a community reply is locked once the window has passed (61 minutes)',
  pg_temp.edit('old'), 'edit_window_closed');
select pg_temp.expect_error('0051: a community reply is locked once the post is Shipped, even inside the window',
  pg_temp.edit('ship_fresh'), 'edit_locked_status');
select pg_temp.expect_error('0051: ... and once it is Closed',
  pg_temp.edit('closed_fresh'), 'edit_locked_status');
select pg_temp.expect_error('0051: ... and once it is Merged',
  pg_temp.edit('merged_fresh'), 'edit_locked_status');

-- ------------------------------------------------------------ official replies

select pg_temp.as_user((select tm1 from f));
update public.reply set body = 'corrected team answer' where id = (select id from r where name = 'off_old');
select pg_temp.as_owner();
select pg_temp.expect('0051: an official reply''s author edits it days later while the post is open',
  pg_temp.body('off_old') = 'corrected team answer'
  and (select edited_at is not null from public.reply where id = (select id from r where name = 'off_old')));

select pg_temp.as_user((select tm1 from f));
select pg_temp.expect_error('0051: an official reply is locked once the post is Shipped',
  pg_temp.edit('ship_off'), 'edit_locked_status');
select pg_temp.expect_error('0051: ... Closed',
  pg_temp.edit('closed_off'), 'edit_locked_status');
select pg_temp.expect_error('0051: ... and Merged',
  pg_temp.edit('merged_off'), 'edit_locked_status');

-- ------------------------------------------------------------ nobody edits someone else's reply

select pg_temp.as_user((select tm2 from f));
update public.reply set body = 'teammate rewrite' where id = (select id from r where name = 'off_old');   -- 0 rows (RLS)
update public.reply set body = 'team rewrite' where id = (select id from r where name = 'fresh');         -- 0 rows (RLS)
select pg_temp.as_user((select ben from f));
update public.reply set body = 'post author rewrite' where id = (select id from r where name = 'fresh');  -- 0 rows (RLS)
select pg_temp.as_user(null);
select pg_temp.expect_error('0051: anon cannot update replies at all',
  pg_temp.edit('fresh'));
select pg_temp.as_owner();
select pg_temp.expect('0051: teammates and the post author changed nothing (no team edits of others'' replies)',
  pg_temp.body('off_old') = 'corrected team answer' and pg_temp.body('fresh') = 'fixed a typo');

select pg_temp.expect('0051: nothing was written by the refused edits',
  pg_temp.body('old') = 'original old' and pg_temp.body('ship_fresh') = 'original ship_fresh'
  and pg_temp.body('closed_fresh') = 'original closed_fresh' and pg_temp.body('merged_fresh') = 'original merged_fresh'
  and pg_temp.body('ship_off') = 'original ship_off' and pg_temp.body('closed_off') = 'original closed_off'
  and pg_temp.body('merged_off') = 'original merged_off');

-- ------------------------------------------------------------ unchanged: delete, moderation, owner

select pg_temp.as_user((select ann from f));
delete from public.reply where id in (select id from r where name in ('old_del', 'ship_fresh'));
select pg_temp.as_owner();
select pg_temp.expect('0051: authors still delete their own replies after the window and on a shipped post',
  not exists (select 1 from public.reply where id in (select id from r where name in ('old_del', 'ship_fresh'))));

select pg_temp.as_user((select tm2 from f));
select 1 from public.set_reply_hidden((select id from r where name = 'closed_fresh'), true);
select pg_temp.as_owner();
select pg_temp.expect('0051: the team still hides a reply on a locked post (definer RPC)',
  (select hidden_at is not null from public.reply where id = (select id from r where name = 'closed_fresh')));

update public.reply set body = 'owner correction' where id = (select id from r where name = 'ship_off');
select pg_temp.expect('0051: the table owner (migrations, support fixes) is not bound by the rule',
  pg_temp.body('ship_off') = 'owner correction');

rollback;
