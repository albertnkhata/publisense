-- Whitespace-only titles and replies (0052, #170). Runs as the real API roles inside a
-- transaction that ROLLS BACK, with its own fixtures (.test addresses), so it runs on CI
-- and against production.
--
--   * post.title must be 3-140 characters once trimmed; reply.body 1-5000.
--   * "Trimmed" matches JavaScript's String.prototype.trim(): spaces, tabs, newlines,
--     NBSP, ideographic space and the rest are not content.
--   * Holds on insert and on update, for API callers and for the table owner alike.
--   * Real text with surrounding spaces still saves (the UI trims before sending).
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_trimmed_text_test.sql

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
-- Refused specifically by a check constraint (not RLS or a trigger), so the test proves 0052.
create function pg_temp.expect_check(label text, stmt text, want_constraint text) returns void language plpgsql as $$
declare c text;
begin
  begin
    execute stmt;
  exception
    when check_violation then
      get stacked diagnostics c = constraint_name;
      if c is distinct from want_constraint then
        raise exception 'FAIL % : refused by % (%), wanted %', label, coalesce(c, 'none'), sqlerrm, want_constraint;
      end if;
      raise notice 'ok   % (refused by %)', label, c;
      return;
    when others then
      raise exception 'FAIL % : refused by something other than a check (%: %)', label, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % : statement succeeded but should have been refused', label;
end $$;

-- ------------------------------------------------------------ fixtures (as owner)

create temp table f as
  select gen_random_uuid() as ann, gen_random_uuid() as board, gen_random_uuid() as post;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ann, 'ann-' || left(ann::text, 8) || '@tt52.test', now(), '{"full_name":"Ann"}'::jsonb from f;
insert into public.board (id, slug, name, site, claimed_at)
select board, 'tt52board', 'TT Board', 'tt52.test', now() from f;
insert into public.post (id, board_id, author_id, type, title, body)
select post, board, ann, 'feature'::public.v2_post_type, 'Trim test post', '' from f;

create function pg_temp.post_insert(title text) returns text language sql as $$
  select format('insert into public.post (board_id, type, title, body) values (%L, ''bug'', %L, '''')', (select board from f), title);
$$;
create function pg_temp.reply_insert(body text) returns text language sql as $$
  select format('insert into public.reply (post_id, body) values (%L, %L)', (select post from f), body);
$$;

-- ------------------------------------------------------------ schema

select pg_temp.expect('0052: post_title_check counts the trimmed title',
  (select pg_get_constraintdef(oid) like '%btrim(title%' from pg_constraint where conname = 'post_title_check' and conrelid = 'public.post'::regclass));
select pg_temp.expect('0052: reply_body_check counts the trimmed body',
  (select pg_get_constraintdef(oid) like '%btrim(body%' from pg_constraint where conname = 'reply_body_check' and conrelid = 'public.reply'::regclass));
select pg_temp.expect('0052: both constraints are validated (existing rows checked)',
  (select bool_and(convalidated) from pg_constraint where conname in ('post_title_check', 'reply_body_check')));

-- ------------------------------------------------------------ as a signed-in member (the #170 repro)

select pg_temp.as_user((select ann from f));
select pg_temp.expect_check('0052: a title of three spaces is refused', pg_temp.post_insert('   '), 'post_title_check');
select pg_temp.expect_check('0052: tabs and newlines are not a title', pg_temp.post_insert(E'\t\n \r\n'), 'post_title_check');
select pg_temp.expect_check('0052: NBSP, ideographic space and BOM are not a title (JS trim set)',
  pg_temp.post_insert(E'\u00a0\u3000\ufeff\u2003'), 'post_title_check');
select pg_temp.expect_check('0052: two real characters padded with spaces are still too short', pg_temp.post_insert('  ab  '), 'post_title_check');
select pg_temp.expect_check('0052: over 140 characters is still refused', pg_temp.post_insert(repeat('x', 141)), 'post_title_check');
select pg_temp.expect_check('0052: a reply of spaces is refused', pg_temp.reply_insert('   '), 'reply_body_check');
select pg_temp.expect_check('0052: a reply of newlines and NBSP is refused', pg_temp.reply_insert(E'\n\u00a0\n'), 'reply_body_check');
select pg_temp.expect_check('0052: an empty reply is refused', pg_temp.reply_insert(''), 'reply_body_check');
select pg_temp.expect_check('0052: over 5000 characters is still refused', pg_temp.reply_insert(repeat('x', 5001)), 'reply_body_check');

insert into public.post (board_id, type, title, body) select board, 'bug', 'Real title', '' from f;
insert into public.post (board_id, type, title, body) select board, 'bug', '  abc  ', '' from f;
insert into public.post (board_id, type, title, body) select board, 'bug', repeat('t', 140), '' from f;
insert into public.reply (post_id, body) select post, 'k' from f;
insert into public.reply (post_id, body) select post, '  ok  ' from f;
insert into public.reply (post_id, body) select post, repeat('r', 5000) from f;
select pg_temp.as_owner();
select pg_temp.expect('0052: real text saves (3+ characters, padded text, exactly 140; a 1-character reply, exactly 5000)',
  (select count(*) from public.post where board_id = (select board from f)) = 4
  and (select count(*) from public.reply where post_id = (select post from f)) = 3);

-- Updates are held to the same rule (author edit inside the window).
select pg_temp.as_user((select ann from f));
select pg_temp.expect_check('0052: an author cannot edit a title down to whitespace',
  format('update public.post set title = %L where id = %L', '    ', (select post from f)), 'post_title_check');
select pg_temp.expect_check('0052: an author cannot edit a reply down to whitespace',
  format('update public.reply set body = %L where post_id = %L and body = %L', E' \t ', (select post from f), 'k'), 'reply_body_check');

-- ------------------------------------------------------------ the table owner too

select pg_temp.as_owner();
select pg_temp.expect_check('0052: the table owner is held to it too (imports, definer RPCs)',
  format('insert into public.post (board_id, author_id, type, title, body) values (%L, %L, ''bug'', %L, '''')',
         (select board from f), (select ann from f), '   '), 'post_title_check');
select pg_temp.expect_check('0052: ... for replies as well',
  format('insert into public.reply (post_id, author_id, body) values (%L, %L, %L)', (select post from f), (select ann from f), ' '), 'reply_body_check');

rollback;
