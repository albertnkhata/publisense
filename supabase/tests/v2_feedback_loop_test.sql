-- Feedback-loop polish (QA 2026-10-27, PR #172; migrations 0043-0045). CI only: runs
-- after the dev seed (it uses the seeded `cursor` board). Each check runs as a real API
-- role, like v2_rls_test.sql. Stubs pg_net and Vault inside the transaction so the
-- email path really "sends" (into a temp table), then ROLLS BACK.
--
--   1. Merged posts: readable by everyone at their permalink (0043), hidden stays hidden,
--      still closed to votes and replies.
--   2. Update status with a note: ONE notification per follower carrying the note, the
--      note on the status_event, no official reply, ONE email (0044).
--   3. Edit window: authors edit within the window only, never once shipped, closed or
--      merged; team and staff abilities unchanged (0045).
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_feedback_loop_test.sql

\set ON_ERROR_STOP 1
begin;
set local statement_timeout = '60s';

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

create function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

-- ------------------------------------------------------------ transport stubs (email)

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

-- ------------------------------------------------------------ fixtures (as owner)

create temp table k as
select (select id from public.board where slug = 'cursor') as board,
       '00000000-0000-4000-8000-0000000000a1'::uuid as author,
       '00000000-0000-4000-8000-0000000000a2'::uuid as voter,
       '00000000-0000-4000-8000-0000000000a3'::uuid as team,
       '00000000-0000-4000-8000-0000000000a4'::uuid as stranger,
       '00000000-0000-4000-8000-0000000000a5'::uuid as staff,
       gen_random_uuid() as dup,       -- merged into target
       gen_random_uuid() as target,
       gen_random_uuid() as hidden_dup, -- merged and hidden
       gen_random_uuid() as loop_post,  -- status + note
       gen_random_uuid() as fresh,      -- edit window
       gen_random_uuid() as old_post,
       gen_random_uuid() as shipped_post,
       gen_random_uuid() as closed_post;
grant select on k to anon, authenticated;
select pg_temp.expect('fixture: the seeded cursor board exists', (select board is not null from k));

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select author,   'loop-author@mail.publisense-ci.net',   now(), '{"full_name":"Loop Author"}'::jsonb from k union all
select voter,    'loop-voter@mail.publisense-ci.net',    now(), '{"full_name":"Loop Voter"}'::jsonb from k union all
select team,     'loop-team@mail.publisense-ci.net',     now(), '{"full_name":"Loop Team"}'::jsonb from k union all
select stranger, 'loop-stranger@mail.publisense-ci.net', now(), '{}'::jsonb from k union all
select staff,    'loop-staff@mail.publisense-ci.net',    now(), '{}'::jsonb from k;

update public.board set claimed_at = coalesce(claimed_at, now()) where id = (select board from k);
insert into public.membership (user_id, scope, scope_id, role)
select team, 'board'::public.v2_scope, board, 'member'::public.v2_role from k;
insert into public.platform_admin (user_id) select staff from k;

-- As owner the insert trigger keeps author_id; the author follows each post (trigger).
insert into public.post (id, board_id, author_id, type, title, body)
select dup,          board, author, 'feature'::public.v2_post_type, 'Loop duplicate request',     'same as the target' from k union all
select target,       board, voter,  'feature', 'Loop original request',      'the surviving post' from k union all
select hidden_dup,   board, author, 'feature', 'Loop hidden duplicate',      'merged and hidden' from k union all
select loop_post,    board, author, 'feature', 'Loop status and note post',  '' from k union all
select fresh,        board, author, 'bug',     'Loop fresh post',            'just written' from k union all
select old_post,     board, author, 'bug',     'Loop old post',              'written long ago' from k union all
select shipped_post, board, author, 'feature', 'Loop shipped post',          '' from k union all
select closed_post,  board, author, 'feature', 'Loop closed post',           '' from k;
update public.post set created_at = now() - interval '61 minutes' where id = (select old_post from k);
insert into public.reply (post_id, author_id, body) select dup, voter, 'me too' from k;

-- ================================================================ 1. merged posts (0043)

select pg_temp.as_user((select team from k));
select pg_temp.expect('merged: the team merges the duplicate',
  (public.merge_post((select dup from k), (select target from k)) ->> 'ok')::boolean
  and (public.merge_post((select hidden_dup from k), (select target from k)) ->> 'ok')::boolean);
select 1 from public.set_post_hidden((select hidden_dup from k), true);

select pg_temp.as_user(null);
select pg_temp.expect('merged: a signed-out visitor reads the merged post at its permalink, pointing at the target',
  exists (select 1 from public.post, k where post.id = k.dup and status = 'merged' and merged_into = k.target));
select pg_temp.expect('merged: ... and its status timeline and replies',
  exists (select 1 from public.status_event, k where post_id = k.dup and "to" = 'merged')
  and exists (select 1 from public.reply, k where post_id = k.dup and body = 'me too'));
select pg_temp.expect('merged: ... and the target it was merged into',
  exists (select 1 from public.post, k where post.id = k.target and status <> 'merged'));
select pg_temp.expect('merged: a merged post that is also hidden stays hidden from the public (post and timeline)',
  not exists (select 1 from public.post, k where post.id = k.hidden_dup)
  and not exists (select 1 from public.status_event, k where post_id = k.hidden_dup));
select pg_temp.expect('merged: the feed, search and sitemap filters (hidden_at is null and status <> merged) still leave it out',
  not exists (select 1 from public.post, k where post.id in (k.dup, k.hidden_dup) and hidden_at is null and status <> 'merged')
  and not exists (select 1 from public.post, k where post.id = k.dup and hidden_at is null and status <> 'merged'
                  and search @@ websearch_to_tsquery('english', 'duplicate')));

select pg_temp.as_user((select stranger from k));
select pg_temp.expect('merged: a signed-in stranger reads it too, but not the hidden one',
  exists (select 1 from public.post, k where post.id = k.dup)
  and not exists (select 1 from public.post, k where post.id = k.hidden_dup));
select pg_temp.expect_error('merged: a stranger cannot reply to a merged post',
  $$insert into public.reply (post_id, body) select dup, 'late reply' from k$$);
select pg_temp.expect_error('merged: a stranger cannot vote on a merged post',
  $$insert into public.vote (post_id) select dup from k$$);

select pg_temp.as_user((select author from k));
select pg_temp.expect('merged: the author still sees their merged and hidden post',
  exists (select 1 from public.post, k where post.id = k.hidden_dup));

-- ================================================================ 2. one notification (0044)

select pg_temp.as_owner();
insert into public.vote (post_id, user_id) select loop_post, voter from k;   -- voter follows
delete from public.notification where post_id = (select loop_post from k);
create temp table email_before as select count(*) as n from public.email_log;

select pg_temp.as_user((select team from k));
select 1 from public.set_post_status((select loop_post from k), 'shipped', '  Live for everyone in 2.4.  ');

select pg_temp.as_owner();
select pg_temp.expect('note: the status change stores the trimmed note on its status_event',
  (select count(*) from public.status_event, k where post_id = k.loop_post and "to" = 'shipped'
     and note = 'Live for everyone in 2.4.' and actor_id = k.team) = 1);
select pg_temp.expect('note: no official reply is created',
  not exists (select 1 from public.reply, k where post_id = k.loop_post));
select pg_temp.expect('one notification: the author gets exactly one, a status_change carrying the note',
  (select count(*) from public.notification, k where post_id = k.loop_post and recipient = k.author) = 1
  and exists (select 1 from public.notification, k where post_id = k.loop_post and recipient = k.author
                and kind = 'status_change' and data ->> 'to' = 'shipped' and data ->> 'note' = 'Live for everyone in 2.4.'));
select pg_temp.expect('one notification: a follower (voter) gets exactly one too, and no reply notification goes to anyone',
  (select count(*) from public.notification, k where post_id = k.loop_post and recipient = k.voter) = 1
  and not exists (select 1 from public.notification, k where post_id = k.loop_post and kind = 'reply'));
select pg_temp.expect('one email: one email_log row per recipient for the combined event, both sent',
  (select count(*) from public.email_log l join public.notification n on n.id::text = l.notification_id, k
    where n.post_id = k.loop_post) = 2
  and (select count(*) from public.email_log l join public.notification n on n.id::text = l.notification_id, k
        where n.post_id = k.loop_post and l.status = 'queued' and l.kind = 'v2_notify_status_change') = 2
  and (select count(*) from public.email_log) - (select n from email_before) = 2);
select pg_temp.expect('one email: the email quotes the note',
  (select count(*) from net.sent where body ->> 'text' like '%Live for everyone in 2.4.%') = 2);

select pg_temp.as_user((select team from k));
select pg_temp.expect_error('note: a note with no status change is refused, not dropped',
  $$select public.set_post_status((select loop_post from k), 'shipped', 'just a message')$$, 'note_without_change');
select pg_temp.expect('note: the same status with no note is still a quiet no-op',
  (public.set_post_status((select loop_post from k), 'shipped')).status = 'shipped');
select pg_temp.as_owner();
select pg_temp.expect('note: ... and notifies nobody',
  (select count(*) from public.notification, k where post_id = k.loop_post) = 2);

select pg_temp.as_user((select team from k));
select 1 from public.set_post_status((select loop_post from k), 'in_progress');
select pg_temp.as_owner();
select pg_temp.expect('note: a status change without a note records no note and still sends one notification each',
  exists (select 1 from public.status_event, k where post_id = k.loop_post and "to" = 'in_progress' and note is null)
  and (select count(*) from public.notification, k where post_id = k.loop_post and recipient = k.author) = 2
  and not exists (select 1 from public.notification, k where post_id = k.loop_post and data ->> 'to' = 'in_progress' and data ? 'note'));

-- ================================================================ 3. edit window (0045)

select pg_temp.as_user((select team from k));
select 1 from public.set_post_status((select shipped_post from k), 'shipped');
select 1 from public.set_post_status((select closed_post from k), 'closed');

select pg_temp.as_user((select author from k));
update public.post set title = 'Loop fresh post, edited', body = 'better words' where id = (select fresh from k);
select pg_temp.as_owner();
select pg_temp.expect('edit: the author edits a post inside the window (edited_at stamped)',
  exists (select 1 from public.post, k where post.id = k.fresh and title = 'Loop fresh post, edited' and edited_at is not null));

select pg_temp.as_user((select author from k));
select pg_temp.expect_error('edit: refused once the window has passed (61 minutes)',
  $$update public.post set title = 'Loop old post, edited' where id = (select old_post from k)$$, 'edit_window_closed');
select pg_temp.expect_error('edit: type and platform are locked too after the window',
  $$update public.post set platform = 'web' where id = (select old_post from k)$$, 'edit_window_closed');
select pg_temp.expect_error('edit: refused once the post is shipped, even inside the window',
  $$update public.post set body = 'changed after shipping' where id = (select shipped_post from k)$$, 'edit_locked_status');
select pg_temp.expect_error('edit: refused once the post is closed',
  $$update public.post set body = 'changed after closing' where id = (select closed_post from k)$$, 'edit_locked_status');
update public.post set body = 'changed after merging' where id = (select dup from k);  -- 0 rows (author update policy)
select pg_temp.as_owner();
select pg_temp.expect('edit: nothing was written by the refused edits (merged post included)',
  (select title from public.post, k where post.id = k.old_post) = 'Loop old post'
  and (select platform is null from public.post, k where post.id = k.old_post)
  and (select body from public.post, k where post.id = k.shipped_post) = ''
  and (select body from public.post, k where post.id = k.closed_post) = ''
  and (select body from public.post, k where post.id = k.dup) = 'same as the target');

select pg_temp.as_user((select author from k));
delete from public.post where id = (select old_post from k);
select pg_temp.as_owner();
select pg_temp.expect('edit: the author can still delete their own post after the window',
  not exists (select 1 from public.post, k where post.id = k.old_post));

-- Team moderation is unchanged on locked posts.
select pg_temp.as_user((select team from k));
select 1 from public.set_post_status((select shipped_post from k), 'in_progress');
select 1 from public.set_post_hidden((select closed_post from k), true);
select pg_temp.as_owner();
select pg_temp.expect('edit: the team still changes status and hides on locked posts',
  (select status from public.post, k where post.id = k.shipped_post) = 'in_progress'
  and (select hidden_at is not null from public.post, k where post.id = k.closed_post));

-- Staff still correct seeded posts at any age (definer RPC, 0031).
select pg_temp.as_user((select staff from k));
create temp table seeded as
  select (public.seed_post((select board from k), 'feature', 'Loop seeded post from a source', 'body',
                           'https://github.com/example/loop/issues/1', now() - interval '30 days') ->> 'id')::uuid as id;
select pg_temp.expect('edit: staff can still edit an old seeded post',
  (public.edit_seeded_post((select id from seeded), 'feature', 'Loop seeded post, corrected', 'body',
                           'https://github.com/example/loop/issues/1') ->> 'ok')::boolean);

select pg_temp.as_owner();
select pg_temp.expect('edit: the window is one setting, 1 hour today',
  public.v2_post_edit_window() = interval '1 hour');

rollback;
