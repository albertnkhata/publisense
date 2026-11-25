-- Admin post deletion (0075): platform admins can permanently delete any post
-- (regular community or seeded) with full dependent cleanup, while anon and
-- non-admin users are refused. Runs inside a rolled-back transaction with own fixtures.

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

create temp table f as
  select gen_random_uuid() as admin_u,
         gen_random_uuid() as author_u,
         gen_random_uuid() as other_u,
         gen_random_uuid() as hub,
         gen_random_uuid() as board,
         gen_random_uuid() as p_regular,
         gen_random_uuid() as p_merged_src,
         gen_random_uuid() as p_seeded,
         gen_random_uuid() as r_root,
         gen_random_uuid() as r_child;
grant select on f to authenticated, anon;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
select admin_u,  'admin-del-'  || left(admin_u::text, 8)  || '@example.test', '{"full_name":"Admin"}'::jsonb,  now() from f
union all
select author_u, 'author-del-' || left(author_u::text, 8) || '@example.test', '{"full_name":"Author"}'::jsonb, now() from f
union all
select other_u,  'other-del-'  || left(other_u::text, 8)  || '@example.test', '{"full_name":"Other"}'::jsonb,  now() from f;

insert into public.platform_admin (user_id)
  select admin_u from f;

insert into public.hub (id, slug, name, status)
  select hub, 'admin-del-hub-' || left(hub::text, 8), 'Admin Delete Hub', 'live' from f;

insert into public.board (id, hub_id, slug, name, status)
  select board, hub, 'admin-del-board-' || left(board::text, 8), 'Admin Delete Board', 'live' from f;

insert into public.post (id, board_id, author_id, source_url, source_author, type, title, body)
select p_regular, board, author_u, null, null, 'bug'::public.v2_post_type,
       'Regular community post to delete', 'Body with details.' from f
union all
select p_merged_src, board, other_u, null, null, 'bug'::public.v2_post_type,
       'Duplicate post merged into target', 'Duplicate body.' from f
union all
select p_seeded, board, null::uuid, 'https://x.com/someone/status/999', '@someone', 'feature'::public.v2_post_type,
       'Seeded post to delete', 'Seeded body.' from f;

-- Dependent records on p_regular: vote, nested replies, follow, status_event, merge, reports, notifications.
insert into public.vote (post_id, user_id) select p_regular, other_u from f;
insert into public.vote (post_id, user_id) select p_seeded, other_u from f;

insert into public.reply (id, post_id, parent_id, author_id, body)
  select r_root, p_regular, null::uuid, other_u, 'Top-level reply' from f;
insert into public.reply (id, post_id, parent_id, author_id, body)
  select r_child, p_regular, r_root, author_u, 'Nested reply' from f;

insert into public.follow (user_id, target, target_id)
  select other_u, 'post'::public.v2_follow_target, p_regular from f
  on conflict do nothing;

insert into public.status_event (post_id, "from", "to", actor_id, note)
  select p_regular, 'open'::public.v2_post_status, 'under_review'::public.v2_post_status, admin_u, 'Looking into it' from f;

update public.post p
   set status = 'merged', merged_into = f.p_regular
  from f
 where p.id = f.p_merged_src;

insert into public.merge_record (source_post_id, target_post_id, prev_status, merged_by)
  select p_merged_src, p_regular, 'open'::public.v2_post_status, admin_u from f;

insert into public.report (target, target_id, reason, reporter)
select 'post'::public.v2_report_target, p_regular, 'Off-topic spam report', other_u from f
union all
select 'reply'::public.v2_report_target, r_root, 'Abusive reply report', author_u from f
union all
select 'post'::public.v2_report_target, p_seeded, 'Broken seeded link', other_u from f;

-- 1. anon cannot execute admin_delete_post
select pg_temp.expect(
  'anon cannot execute admin_delete_post',
  not has_function_privilege('anon', 'public.admin_delete_post(uuid)', 'execute')
);

-- 2. Non-admin user (and even post author) is refused by admin_delete_post
select pg_temp.as_user((select other_u from f));
select pg_temp.expect(
  'non-admin refused on regular post',
  (public.admin_delete_post((select p_regular from f))->>'error') = 'not_allowed'
);
select pg_temp.expect(
  'non-admin refused on seeded post',
  (public.admin_delete_post((select p_seeded from f))->>'error') = 'not_allowed'
);
select pg_temp.as_user((select author_u from f));
select pg_temp.expect(
  'non-admin author refused by admin_delete_post',
  (public.admin_delete_post((select p_regular from f))->>'error') = 'not_allowed'
);

-- 3. Platform admin deletes regular post with full dependent cleanup
select pg_temp.as_user((select admin_u from f));
select pg_temp.expect(
  'admin deletes regular community post cleanly',
  (public.admin_delete_post((select p_regular from f))->>'ok')::boolean
);

select pg_temp.as_owner();
select pg_temp.expect(
  'regular post and all dependent rows removed',
  not exists (select 1 from public.post p, f where p.id = f.p_regular)
  and not exists (select 1 from public.vote v, f where v.post_id = f.p_regular)
  and not exists (select 1 from public.reply r, f where r.post_id = f.p_regular)
  and not exists (select 1 from public.follow fl, f where fl.target = 'post' and fl.target_id = f.p_regular)
  and not exists (select 1 from public.status_event se, f where se.post_id = f.p_regular)
  and not exists (select 1 from public.merge_record mr, f where mr.target_post_id = f.p_regular)
  and not exists (select 1 from public.report rp, f where (rp.target = 'post' and rp.target_id = f.p_regular) or (rp.target = 'reply' and rp.target_id = f.r_root))
  and not exists (select 1 from public.notification n, f where n.post_id = f.p_regular or (n.target_type = 'post' and n.target_id = f.p_regular) or (n.target_type = 'reply' and n.target_id in (f.r_root, f.r_child)))
);
select pg_temp.expect(
  'previously merged source post reopened cleanly',
  exists (select 1 from public.post p, f where p.id = f.p_merged_src and p.status = 'open' and p.merged_into is null)
);

-- 4. Platform admin deletes seeded post cleanly via admin_delete_post
select pg_temp.as_user((select admin_u from f));
select pg_temp.expect(
  'admin deletes seeded post cleanly',
  (public.admin_delete_post((select p_seeded from f))->>'ok')::boolean
);
select pg_temp.expect(
  'deleting already-deleted post returns not_found',
  (public.admin_delete_post((select p_seeded from f))->>'error') = 'not_found'
);

select pg_temp.as_owner();
select pg_temp.expect(
  'seeded post and its vote/report removed, board.post_count accurate (1 remaining)',
  not exists (select 1 from public.post p, f where p.id = f.p_seeded)
  and not exists (select 1 from public.vote v, f where v.post_id = f.p_seeded)
  and not exists (select 1 from public.report rp, f where rp.target = 'post' and rp.target_id = f.p_seeded)
  and (select b.post_count from public.board b, f where b.id = f.board) = 1
);

rollback;
