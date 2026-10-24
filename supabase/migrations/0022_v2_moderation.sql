-- Publisense v2, step 8 of docs/v2/BUILD.md: moderation and people.
--
-- ADDITIVE. New functions, one new table (platform_admin_event), two new nullable
-- columns on merge_record, execute grants, and three deliberate changes to step 3/7
-- objects, each explained where it happens:
--   * v2_guard_last_owner (0017) also lets the last owner go once the scope is no
--     longer claimed, so release_scope can hand a board or hub back;
--   * ownership_dispute loses its client insert path (policy + grant), so disputes
--     only arrive through open_dispute (0021) with its domain check;
--   * platform_admin gets a last-admin guard trigger, the backstop for revoke and
--     for account deletion (the delete-account Edge Function checks first).
-- No v1 object is read, altered or dropped.
--
-- Every RPC returns jsonb { ok, error?, ... } in the 0021 style.
--
--   merge_post / unmerge_post        board team (FOUNDATION §7: unmerge within 10 min)
--   decide_reports                   platform admins: resolve, hide-and-resolve, dismiss
--   decide_dispute                   platform admins: transfer ownership or reject
--   admin_find_user                  platform admins: look up by handle or email
--   grant_ / revoke_platform_admin   platform admins, audited in platform_admin_event
--   release_scope                    an owner gives a claimed board or hub back

-- ================================================================ merge and unmerge

-- What a merge copied onto the target, so unmerge can take exactly that back off.
-- moved_voters (0016) are the source's voters who had not voted on the target.
alter table public.merge_record add column if not exists moved_followers uuid[] not null default '{}';
alter table public.merge_record add column if not exists status_event_id uuid;
create index if not exists merge_record_source_idx on public.merge_record (source_post_id, merged_at desc);

-- Votes and followers move to the target (FOUNDATION §7). The source's own vote rows
-- stay where they are: the source is merged away (invisible to the public, closed to
-- votes by the 0017 trigger), so nothing is counted twice in any list, and unmerge
-- only has to remove what was added to the target.
create or replace function public.merge_post(p_source uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  s      post;
  t      post;
  voters uuid[];
  fols   uuid[];
  ev     uuid;
  f      record;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if p_source = p_target then return public.v2_err('same_post'); end if;
  -- Lock both rows in a fixed order so two merges cannot deadlock.
  perform 1 from post where id in (p_source, p_target) order by id for update;
  select * into s from post where id = p_source;
  select * into t from post where id = p_target;
  if s.id is null or t.id is null then return public.v2_err('not_found'); end if;
  if not (coalesce(public.is_board_team(s.board_id), false) and coalesce(public.is_board_team(t.board_id), false)) then
    return public.v2_err('not_allowed');
  end if;
  if s.status = 'merged' then return public.v2_err('merged'); end if;
  if t.status = 'merged' or t.hidden_at is not null then return public.v2_err('target_unavailable'); end if;

  select coalesce(array_agg(v.user_id), '{}') into voters
    from vote v
   where v.post_id = s.id
     and not exists (select 1 from vote w where w.post_id = t.id and w.user_id = v.user_id);
  select coalesce(array_agg(fo.user_id), '{}') into fols
    from follow fo
   where fo.target = 'post' and fo.target_id = s.id
     and not exists (select 1 from follow g where g.target = 'post' and g.target_id = t.id and g.user_id = fo.user_id);

  -- Followers first: the vote trigger auto-follows, and those follows must not be
  -- mistaken for ones this merge moved.
  insert into follow (user_id, target, target_id)
  select unnest(fols), 'post', t.id on conflict do nothing;
  insert into vote (post_id, user_id)
  select t.id, unnest(voters) on conflict do nothing;

  insert into status_event (post_id, "from", "to", note, actor_id)
  values (s.id, s.status, 'merged', null, uid) returning id into ev;
  update post set status = 'merged', merged_into = t.id where id = s.id;

  insert into merge_record (source_post_id, target_post_id, prev_status, moved_voters, moved_followers, merged_by, status_event_id)
  values (s.id, t.id, s.status, voters, fols, uid, ev);

  -- Everyone who followed the duplicate (voters follow automatically) hears where it went.
  for f in select user_id from follow where target = 'post' and target_id = s.id loop
    perform v2_notify(f.user_id, 'status_change', uid, 'post', s.id, s.id,
                      jsonb_build_object('to', 'merged', 'into', t.id, 'into_title', t.title));
  end loop;

  return jsonb_build_object('ok', true, 'moved', cardinality(voters), 'target', t.id);
end $$;

-- Reverse the latest merge of a post within 10 minutes: status back, moved votes and
-- follows off the target, the source live again, and a status_event so the timeline
-- stays truthful.
create or replace function public.unmerge_post(p_source uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s   post;
  m   merge_record;
  t   post;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into s from post where id = p_source for update;
  if not found then return public.v2_err('not_found'); end if;
  if not coalesce(public.is_board_team(s.board_id), false) then return public.v2_err('not_allowed'); end if;
  if s.status <> 'merged' then return public.v2_err('not_merged'); end if;
  select * into m from merge_record
   where source_post_id = s.id and undone_at is null
   order by merged_at desc limit 1 for update;
  if not found then return public.v2_err('not_merged'); end if;
  if m.merged_at < now() - interval '10 minutes' then return public.v2_err('too_late'); end if;
  select * into t from post where id = m.target_post_id for update;
  -- The target was merged on in turn: its votes have moved again, so this one can't be undone cleanly.
  if t.status = 'merged' then return public.v2_err('target_merged'); end if;

  delete from vote where post_id = m.target_post_id and user_id = any (m.moved_voters);
  delete from follow where target = 'post' and target_id = m.target_post_id and user_id = any (m.moved_followers);

  insert into status_event (post_id, "from", "to", note, actor_id)
  values (s.id, 'merged', m.prev_status, null, uid);
  update post set status = m.prev_status, merged_into = null where id = s.id;
  update merge_record set undone_at = now() where id = m.id;
  return jsonb_build_object('ok', true, 'status', m.prev_status);
end $$;

-- ================================================================ reports (platform admins)

-- Decide every open report on one target at once (the queue groups them by target).
--   resolve: mark actioned       hide: hide the post or reply, then mark actioned
--   dismiss: mark dismissed
create or replace function public.decide_reports(p_target public.v2_report_target, p_target_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  if p_action not in ('resolve', 'hide', 'dismiss') then return public.v2_err('invalid_action'); end if;
  if p_action = 'hide' then
    if p_target = 'post' then
      update post set hidden_at = coalesce(hidden_at, now()) where id = p_target_id;
    elsif p_target = 'reply' then
      update reply set hidden_at = coalesce(hidden_at, now()) where id = p_target_id;
    else
      return public.v2_err('invalid_action');
    end if;
  end if;
  update report
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end::public.v2_report_status,
         decided_by = uid, decided_at = now()
   where target = p_target and target_id = p_target_id and status = 'open';
  get diagnostics n = row_count;
  if n = 0 then return public.v2_err('decided'); end if;
  return jsonb_build_object('ok', true, 'decided', n);
end $$;

-- ================================================================ ownership disputes (platform admins)

-- Approving transfers the scope: the person who proved the domain becomes its only
-- owner and the incumbent team (put there by the wrong owner) is removed. They can
-- re-add teammates, who still need an address on the domain. Rejecting changes
-- nothing. Either way the filer hears the answer; the incumbent team never decides.
create or replace function public.decide_dispute(p_dispute uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   ownership_dispute;
  dom text;
  nm  text;
  sl  text;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into d from ownership_dispute where id = p_dispute for update;
  if not found then return public.v2_err('not_found'); end if;
  if d.status <> 'pending' then return public.v2_err('decided'); end if;

  if d.scope = 'board' then select name, slug into nm, sl from board where id = d.scope_id;
  else select name, slug into nm, sl from hub where id = d.scope_id; end if;
  if nm is null then return public.v2_err('not_found'); end if;

  if p_approve then
    dom := public.v2_scope_domain(d.scope, d.scope_id);
    if dom is null or not public.v2_has_verified(dom, d.user_id) then return public.v2_err('not_verified'); end if;
    -- New owner first, so the last-owner guard never sees the scope without one.
    insert into membership (user_id, scope, scope_id, role) values (d.user_id, d.scope, d.scope_id, 'owner')
    on conflict (user_id, scope, scope_id) do update set role = 'owner';
    delete from membership where scope = d.scope and scope_id = d.scope_id and user_id <> d.user_id;
    if d.scope = 'board' then
      update board set claimed_at = coalesce(claimed_at, now()) where id = d.scope_id;
    else
      update hub set claimed_at = coalesce(claimed_at, now()) where id = d.scope_id;
      update board set claimed_at = coalesce(claimed_at, now()) where hub_id = d.scope_id;
    end if;
    update join_request set status = 'withdrawn'
     where scope = d.scope and scope_id = d.scope_id and status = 'pending' and user_id <> d.user_id;
  end if;

  update ownership_dispute
     set status = case when p_approve then 'approved' else 'rejected' end::public.v2_request_status,
         decided_by = uid, decided_at = now()
   where id = d.id;
  perform public.v2_notify(d.user_id, 'claim', uid, d.scope::text, d.scope_id, null,
    jsonb_build_object('scope', d.scope, 'slug', sl, 'name', nm,
                       'dispute', case when p_approve then 'approved' else 'rejected' end));
  return jsonb_build_object('ok', true);
end $$;

-- 0021 left a direct insert path on ownership_dispute (policy + column grant). Close
-- it: disputes arrive only through open_dispute, which checks the domain proof.
drop policy if exists "v2 dispute insert" on public.ownership_dispute;
revoke insert on public.ownership_dispute from anon, authenticated;

-- ================================================================ platform admins

create table if not exists public.platform_admin_event (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references public.profile (id) on delete set null,
  action   text not null check (action in ('grant', 'revoke')),
  actor_id uuid references public.profile (id) on delete set null,
  at       timestamptz not null default now()
);
create index if not exists platform_admin_event_at_idx on public.platform_admin_event (at desc);
alter table public.platform_admin_event enable row level security;
revoke all on public.platform_admin_event from anon, authenticated;
grant select on public.platform_admin_event to authenticated;
drop policy if exists "v2 platform_admin_event read" on public.platform_admin_event;
create policy "v2 platform_admin_event read" on public.platform_admin_event for select to authenticated
  using (public.is_platform_admin());

-- The last platform admin can never be removed, by revoke or by a cascade. The
-- delete-account Edge Function refuses first ("last_platform_admin"); this is the backstop.
create or replace function public.v2_guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admin where user_id <> old.user_id) then
    raise exception 'Publisense must keep at least one platform admin' using errcode = 'check_violation';
  end if;
  return old;
end $$;
drop trigger if exists v2_platform_admin_last on public.platform_admin;
create trigger v2_platform_admin_last before delete on public.platform_admin
  for each row execute function public.v2_guard_last_admin();

-- Look someone up by handle or email. Non-admins get not_allowed before any lookup,
-- so the answer never says whether an account exists.
create or replace function public.admin_find_user(p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  who text := lower(btrim(coalesce(p_who, '')));
  p   profile;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  if who = '' then return public.v2_err('not_found'); end if;
  if position('@' in who) > 1 then
    select pr.* into p from profile pr join auth.users u on u.id = pr.id where lower(u.email) = who;
  else
    select * into p from profile where handle = ltrim(who, '@');
  end if;
  if p.id is null then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true, 'user', jsonb_build_object(
    'id', p.id, 'handle', p.handle, 'name', p.name, 'avatar_path', p.avatar_path,
    'is_admin', exists (select 1 from platform_admin where user_id = p.id)));
end $$;

create or replace function public.grant_platform_admin(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  if not exists (select 1 from profile where id = p_user) then return public.v2_err('not_found'); end if;
  if exists (select 1 from platform_admin where user_id = p_user) then return public.v2_err('already_admin'); end if;
  insert into platform_admin (user_id, granted_by) values (p_user, uid);
  insert into platform_admin_event (user_id, action, actor_id) values (p_user, 'grant', uid);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.revoke_platform_admin(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  -- Serialise appointments so two admins revoking each other cannot leave none.
  perform 1 from platform_admin for update;
  if not exists (select 1 from platform_admin where user_id = p_user) then return public.v2_err('not_admin'); end if;
  if not exists (select 1 from platform_admin where user_id <> p_user) then return public.v2_err('last_admin'); end if;
  delete from platform_admin where user_id = p_user;
  insert into platform_admin_event (user_id, action, actor_id) values (p_user, 'revoke', uid);
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ releasing a board or hub

-- 0017's guard keeps an owner on a CLAIMED scope. Once a scope is unclaimed (only
-- release_scope does that; claimed_at is never client-writable) there is nothing
-- left to guard, so its last owner may go. A board inside a claimed hub is covered
-- by the hub's owners, so its own board-level team may empty too. Same rule otherwise.
create or replace function public.v2_guard_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from membership
                      where scope = old.scope and scope_id = old.scope_id and role = 'owner'
                        and user_id <> old.user_id)
     and (case old.scope
            when 'board' then exists (select 1 from board b left join hub h on h.id = b.hub_id
                                       where b.id = old.scope_id and b.claimed_at is not null and h.claimed_at is null)
            else exists (select 1 from hub where id = old.scope_id and claimed_at is not null)
          end) then
    raise exception 'a claimed % must keep an owner', old.scope using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

-- An owner gives the scope up: every membership on it goes, it becomes unclaimed,
-- open join requests and disputes are withdrawn and its blocks are lifted. A hub
-- release also unclaims the hub's boards, except any board with its own owner.
-- Only an owner of this exact scope may do it (a hub owner releases the hub).
create or replace function public.release_scope(p_scope public.v2_scope, p_scope_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hub_claimed boolean;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not exists (select 1 from membership where user_id = uid and scope = p_scope and scope_id = p_scope_id and role = 'owner') then
    return public.v2_err('owners_only');
  end if;

  if p_scope = 'board' then
    select h.claimed_at is not null into hub_claimed
      from board b left join hub h on h.id = b.hub_id where b.id = p_scope_id;
    -- Unclaim first: the guard lets the last owner go only from an unclaimed scope.
    -- A board inside a claimed hub stays claimed (the hub team still covers it).
    if not coalesce(hub_claimed, false) then update board set claimed_at = null where id = p_scope_id; end if;
    delete from membership where scope = 'board' and scope_id = p_scope_id;
  else
    perform 1 from hub where id = p_scope_id for update;
    update hub set claimed_at = null where id = p_scope_id;
    delete from membership where scope = 'hub' and scope_id = p_scope_id;
    update board b set claimed_at = null
     where b.hub_id = p_scope_id
       and not exists (select 1 from membership m where m.scope = 'board' and m.scope_id = b.id and m.role = 'owner');
  end if;

  update join_request set status = 'withdrawn' where scope = p_scope and scope_id = p_scope_id and status = 'pending';
  update ownership_dispute set status = 'withdrawn' where scope = p_scope and scope_id = p_scope_id and status = 'pending';
  delete from block where scope = p_scope and scope_id = p_scope_id;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ grants

do $$
declare f text;
begin
  foreach f in array array[
    'public.merge_post(uuid, uuid)',
    'public.unmerge_post(uuid)',
    'public.decide_reports(public.v2_report_target, uuid, text)',
    'public.decide_dispute(uuid, boolean)',
    'public.admin_find_user(text)',
    'public.grant_platform_admin(uuid)',
    'public.revoke_platform_admin(uuid)',
    'public.release_scope(public.v2_scope, uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.v2_guard_last_admin() from public, anon, authenticated;
