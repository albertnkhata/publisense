-- Vote privacy (#140, migration 0041): counts are public, who voted is not.
-- Runs after the dev seed (needs one visible post). Rolled back.

\set ON_ERROR_STOP 1
begin;

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

create temp table s (k text primary key, v uuid);
grant select on s to anon, authenticated;
insert into s values ('a', gen_random_uuid()), ('b', gen_random_uuid());
insert into s select 'post', id from public.post
  where status not in ('merged', 'closed') and hidden_at is null order by created_at limit 1;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select v, 'vote-' || k || '-' || left(v::text, 8) || '@votes.invalid', now(), '{"full_name":"Voter"}'::jsonb from s where k in ('a', 'b');
select pg_temp.expect('fixture: a visible post', exists (select 1 from s where k = 'post'));

create temp table before_count as select vote_count as n from public.post where id = (select v from s where k = 'post');
grant select on before_count to anon, authenticated;

select pg_temp.as_user((select v from s where k = 'a'));
insert into public.vote (post_id) select v from s where k = 'post';
select pg_temp.expect('voter: sees their own vote ("did I vote?")',
  exists (select 1 from public.vote where post_id = (select v from s where k = 'post') and user_id = auth.uid()));

select pg_temp.as_user((select v from s where k = 'b'));
select pg_temp.expect('another user: cannot see who voted',
  not exists (select 1 from public.vote where user_id = (select v from s where k = 'a')));
select pg_temp.expect('another user: the public count still moved',
  (select vote_count from public.post where id = (select v from s where k = 'post')) = (select n + 1 from before_count));

select pg_temp.as_user(null);
select pg_temp.expect('anon: cannot list any votes', not exists (select 1 from public.vote));
select pg_temp.expect('anon: counts stay public',
  (select vote_count from public.post where id = (select v from s where k = 'post')) = (select n + 1 from before_count));

select pg_temp.as_user((select v from s where k = 'a'));
delete from public.vote where post_id = (select v from s where k = 'post') and user_id = auth.uid();
select pg_temp.expect('voter: can still remove their own vote',
  (select vote_count from public.post where id = (select v from s where k = 'post')) = (select n from before_count));

select pg_temp.as_owner();
rollback;
