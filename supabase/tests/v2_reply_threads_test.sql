-- Reply threads (0050): replies nest at any depth, notifications follow the real
-- parent, mentions notify (the board slug pings its team), deleting a reply takes its
-- subtree and the counter follows, and the claim-code limit says when to retry (#183).
-- Runs as the real API roles inside a transaction that ROLLS BACK.
--
--   psql ... -v ON_ERROR_STOP=1 -qtA -f supabase/tests/v2_reply_threads_test.sql

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
  select gen_random_uuid() as poster, gen_random_uuid() as ann, gen_random_uuid() as ben,
         gen_random_uuid() as cat, gen_random_uuid() as tm1, gen_random_uuid() as tm2,
         gen_random_uuid() as board, gen_random_uuid() as post;
grant select on f to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select poster, 'poster-' || left(poster::text, 8) || '@rt50.test', now(), '{"full_name":"Pat Poster"}'::jsonb from f
union all select ann, 'ann-' || left(ann::text, 8) || '@rt50.test', now(), '{"full_name":"Ann"}'::jsonb from f
union all select ben, 'ben-' || left(ben::text, 8) || '@rt50.test', now(), '{"full_name":"Ben"}'::jsonb from f
union all select cat, 'cat-' || left(cat::text, 8) || '@rt50.test', now(), '{"full_name":"Cat"}'::jsonb from f
union all select tm1, 'tm1-' || left(tm1::text, 8) || '@rt50.test', now(), '{"full_name":"Tess Team"}'::jsonb from f
union all select tm2, 'tm2-' || left(tm2::text, 8) || '@rt50.test', now(), '{"full_name":"Theo Team"}'::jsonb from f;

update public.profile set handle = 'rt50_' || case id
  when (select ann from f) then 'ann' when (select ben from f) then 'ben' when (select cat from f) then 'cat'
  when (select tm1 from f) then 'tm1' when (select tm2 from f) then 'tm2' else 'poster' end
 where id in (select unnest(array[poster, ann, ben, cat, tm1, tm2]) from f);

insert into public.board (id, slug, name, site, claimed_at)
select board, 'rt50board', 'RT Board', 'rt50.test', now() from f;
insert into public.membership (user_id, scope, scope_id, role)
select tm1, 'board'::public.v2_scope, board, 'owner'::public.v2_role from f union all select tm2, 'board', board, 'member' from f;
insert into public.post (id, board_id, author_id, type, title, body)
select post, board, poster, 'feature'::public.v2_post_type, 'Threads test post', 'body' from f;

create temp table r (name text primary key, id uuid);
grant select, insert on r to authenticated;
create function pg_temp.say(who uuid, name text, parent text, body text, official boolean default false) returns void language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_user(who);
  insert into public.reply (post_id, parent_id, body, is_official)
  values ((select post from f), (select id from r where r.name = parent), body, official)
  returning id into v;
  insert into r values (say.name, v);
end $$;
create function pg_temp.notes(who uuid, reply text, k text) returns bigint language sql as $$
  select count(*) from public.notification
   where recipient = who and kind::text = k and target_id = (select id from r where r.name = reply);
$$;

-- ------------------------------------------------------------ nesting

select pg_temp.say((select ann from f), 'a', null, 'Top-level from Ann');
select pg_temp.say((select ben from f), 'b', 'a', 'Ben answers Ann');
select pg_temp.say((select cat from f), 'c', 'b', 'Cat answers Ben');
select pg_temp.say((select ann from f), 'd', 'c', 'Ann answers Cat, three deep');
select pg_temp.as_owner();
select pg_temp.expect('0050: a reply to a reply keeps its real parent (no flattening)',
  (select parent_id from public.reply where id = (select id from r where name = 'c')) = (select id from r where name = 'b')
  and (select parent_id from public.reply where id = (select id from r where name = 'd')) = (select id from r where name = 'c'));

-- ------------------------------------------------------------ notifications

select pg_temp.expect('0050: the parent''s author hears about a nested reply (Ben, for Cat''s reply)',
  pg_temp.notes((select ben from f), 'c', 'reply') = 1);
select pg_temp.expect('0050: the thread starter is not told about replies to someone else (Ann, for Cat''s reply)',
  pg_temp.notes((select ann from f), 'c', 'reply') = 0);
select pg_temp.expect('0050: the post''s author hears about every reply, once',
  pg_temp.notes((select poster from f), 'a', 'reply') = 1 and pg_temp.notes((select poster from f), 'c', 'reply') = 1
  and pg_temp.notes((select poster from f), 'd', 'reply') = 1);
select pg_temp.expect('0050: nobody is notified about their own reply',
  not exists (select 1 from public.notification n join public.reply x on x.id = n.target_id
               where n.target_type = 'reply' and n.recipient = x.author_id and x.post_id = (select post from f)));

-- The post's author replying to someone: one notification to that person, none to self.
select pg_temp.say((select poster from f), 'e', 'd', 'Poster answers Ann');
select pg_temp.as_owner();
select pg_temp.expect('0050: replying to a nested reply notifies its author exactly once',
  (select count(*) from public.notification where target_id = (select id from r where name = 'e')) = 1
  and pg_temp.notes((select ann from f), 'e', 'reply') = 1);

-- Mentions: a new person gets 'mention'; someone already told gets nothing more.
select pg_temp.say((select ben from f), 'm', 'a', 'cc @RT50_cat and @rt50_ann, also me@rt50_tm1.test');
select pg_temp.as_owner();
select pg_temp.expect('0050: an @handle mention notifies that person (case-insensitive)',
  pg_temp.notes((select cat from f), 'm', 'mention') = 1);
select pg_temp.expect('0050: no double notification for a parent author who is also mentioned',
  pg_temp.notes((select ann from f), 'm', 'reply') = 1 and pg_temp.notes((select ann from f), 'm', 'mention') = 0);
select pg_temp.expect('0050: an email address is not a mention',
  pg_temp.notes((select tm1 from f), 'm', 'mention') = 0);

-- @<board slug> pings the board's team.
select pg_temp.say((select cat from f), 't', null, 'Hey @rt50board, any news?');
select pg_temp.as_owner();
select pg_temp.expect('0050: @board-slug notifies every team member, marked as a team mention',
  (select count(*) from public.notification
    where kind = 'mention' and target_id = (select id from r where name = 't') and data ->> 'team' = 'true'
      and recipient in ((select tm1 from f), (select tm2 from f))) = 2);

-- A reply to an official (team) reply reaches the whole team, once each.
select pg_temp.say((select tm1 from f), 'o', null, 'We are on it', true);
select pg_temp.say((select ben from f), 'ob', 'o', 'Thanks team');
select pg_temp.as_owner();
select pg_temp.expect('0050: replying to an official reply notifies the team, once each, as the team',
  pg_temp.notes((select tm1 from f), 'ob', 'reply') = 1 and pg_temp.notes((select tm2 from f), 'ob', 'reply') = 1
  and (select bool_and(data ->> 'team' = 'true') from public.notification
        where kind = 'reply' and target_id = (select id from r where name = 'ob') and recipient in ((select tm1 from f), (select tm2 from f))));
select pg_temp.expect('0050: notification emails for .test addresses are skipped, not sent',
  not exists (select 1 from public.email_log l join public.notification n on n.id::text = l.notification_id
               where n.post_id = (select post from f) and l.status <> 'skipped'));

-- ------------------------------------------------------------ deleting a subtree

select pg_temp.as_owner();
create temp table before_count as select reply_count as n from public.post where id = (select post from f);
select pg_temp.as_user((select ben from f));
with d as (delete from public.reply where id = (select id from r where name = 'b') returning id)
select pg_temp.expect('0050: the author deletes their reply', (select count(*) = 1 from d));
select pg_temp.as_owner();
select pg_temp.expect('0050: deleting a reply removes its whole subtree (b, c, d, e)',
  not exists (select 1 from public.reply where id in (select id from r where name in ('b', 'c', 'd', 'e'))));
select pg_temp.expect('0050: reply_count drops by the size of the subtree',
  (select reply_count from public.post where id = (select post from f)) = (select n from before_count) - 4);

-- ------------------------------------------------------------ claim code limit (#183)

insert into public.domain_challenge (user_id, domain, method, work_email, code_hash, expires_at, created_at)
select ann, 'rt50.test', 'email', 'ann@rt50.test', 'x$y', now() - interval '1 minute', now() - make_interval(mins => m)
  from f, generate_series(10, 50, 10) as m;
select pg_temp.as_user((select ann from f));
create temp table rl as select public.start_domain_email('ann@rt50.test', 'rt50.test') as res;
select pg_temp.as_owner();
select pg_temp.expect('0050: the hourly limit still refuses a sixth code',
  (select res ->> 'error' from rl) = 'rate_limited');
select pg_temp.expect('0050: ... and says when to try again (oldest code + 1 hour)',
  abs(extract(epoch from ((select (res ->> 'retry_after')::timestamptz from rl) - (now() + interval '10 minutes')))) < 5);

rollback;
