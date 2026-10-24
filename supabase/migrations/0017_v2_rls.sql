-- Publisense v2: permissions (FOUNDATION section 8), integrity triggers and the
-- status RPCs. RLS and security-definer functions are the guard; the UI only mirrors.
--
-- Two layers, both needed:
--   1. GRANTs say which COLUMNS a client role may write at all. Supabase grants every
--      privilege on public tables to anon and authenticated by default, so this file
--      revokes that first and grants back only what the app writes directly.
--      Counters, status, hidden_at, claimed_at, is_official on other people's rows,
--      etc. are therefore unwritable from the client whatever a policy says.
--   2. POLICIES say which ROWS. Anything that must write an audit row (status changes,
--      hiding) goes through a security-definer RPC instead of a policy.
--
-- Helper functions are SECURITY DEFINER with a pinned search_path so policies on one
-- table can consult another without recursive RLS evaluation.

-- ================================================================ helpers

create or replace function public.is_platform_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from platform_admin where user_id = uid);
$$;

-- Highest role a user holds on a board, directly or through the board's hub.
create or replace function public.board_role(p_board uuid, uid uuid default auth.uid())
returns public.v2_role language sql stable security definer set search_path = public as $$
  select m.role
    from membership m
    join board b on b.id = p_board
   where m.user_id = uid
     and ((m.scope = 'board' and m.scope_id = b.id)
       or (m.scope = 'hub' and m.scope_id = b.hub_id))
   order by m.role            -- enum order: owner < admin < member
   limit 1;
$$;

create or replace function public.hub_role(p_hub uuid, uid uuid default auth.uid())
returns public.v2_role language sql stable security definer set search_path = public as $$
  select role from membership where user_id = uid and scope = 'hub' and scope_id = p_hub;
$$;

create or replace function public.is_board_team(p_board uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and public.board_role(p_board, uid) is not null;
$$;

create or replace function public.is_board_admin(p_board uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and public.board_role(p_board, uid) in ('owner', 'admin');
$$;

create or replace function public.is_scope_admin(p_scope public.v2_scope, p_id uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'board' then public.is_board_admin(p_id, uid)
    else uid is not null and public.hub_role(p_id, uid) in ('owner', 'admin')
  end;
$$;

create or replace function public.is_scope_team(p_scope public.v2_scope, p_id uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'board' then public.is_board_team(p_id, uid)
    else uid is not null and public.hub_role(p_id, uid) is not null
  end;
$$;

-- Blocked on this board, directly or through its hub.
create or replace function public.is_blocked(p_board uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from block k join board b on b.id = p_board
     where k.user_id = uid
       and ((k.scope = 'board' and k.scope_id = b.id)
         or (k.scope = 'hub' and k.scope_id = b.hub_id)));
$$;

-- Who may see a post: everyone while it is live; its author, its team and platform
-- admins also while it is hidden or merged away.
create or replace function public.can_see_post(p_post uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from post p
     where p.id = p_post
       and ((p.hidden_at is null and p.status <> 'merged')
         or (uid is not null and p.author_id = uid)
         or public.is_board_team(p.board_id, uid)
         or public.is_platform_admin(uid)));
$$;

create or replace function public.post_board(p_post uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select board_id from post where id = p_post;
$$;

-- Insert an in-app notification unless it is self-inflicted or switched off.
create or replace function public.v2_notify(
  p_recipient uuid, p_kind public.v2_notification_kind, p_actor uuid,
  p_target_type text, p_target_id uuid, p_post uuid default null, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then return; end if;
  if exists (select 1 from notification_pref
              where user_id = p_recipient and kind = p_kind and channel = 'in_app' and not enabled) then
    return;
  end if;
  insert into notification (recipient, kind, actor, target_type, target_id, post_id, data)
  values (p_recipient, p_kind, p_actor, p_target_type, p_target_id, p_post, p_data);
end $$;
revoke execute on function public.v2_notify(uuid, public.v2_notification_kind, uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;

-- ================================================================ profile on sign-up

create or replace function public.v2_handle_base(p_email text, p_meta jsonb)
returns text language sql immutable as $$
  with c as (
    select left(coalesce(nullif(regexp_replace(lower(coalesce(
             p_meta->>'user_name', p_meta->>'preferred_username', split_part(p_email, '@', 1), '')),
             '[^a-z0-9_]+', '', 'g'), ''), 'user'), 24) as h)
  select case when char_length(h) < 3 then rpad(h, 3, '0') else h end from c;
$$;

create or replace function public.v2_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text := public.v2_handle_base(new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  h    text := base;
  n    int  := 1;
begin
  while exists (select 1 from profile where handle = h) loop
    n := n + 1;
    h := base || n::text;
  end loop;
  insert into profile (id, handle, name)
  values (new.id, h, left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 60))
  on conflict (id) do nothing;
  insert into email_token (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

-- Runs beside v1's on_auth_user_created; the two write different tables.
create trigger v2_on_auth_user_created
  after insert on auth.users
  for each row execute function public.v2_handle_new_user();

-- Backfill everyone who signed up before v2 existed.
do $$
declare u record;
begin
  for u in select id, email, raw_user_meta_data from auth.users
            where id not in (select id from public.profile) order by created_at loop
    declare
      base text := public.v2_handle_base(u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb));
      h text := base; n int := 1;
    begin
      while exists (select 1 from public.profile where handle = h) loop n := n + 1; h := base || n::text; end loop;
      insert into public.profile (id, handle, name)
      values (u.id, h, left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), 60));
      insert into public.email_token (user_id) values (u.id) on conflict do nothing;
    end;
  end loop;
end $$;

-- ================================================================ integrity triggers

-- verified_domain refuses shared hosts and their subdomains (foo.vercel.app).
create or replace function public.v2_guard_verified_domain()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.domain := lower(new.domain);
  if exists (select 1 from shared_domain s
              where new.domain = s.domain or new.domain like '%.' || s.domain) then
    raise exception 'shared domain % cannot be verified', new.domain using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger v2_verified_domain_guard before insert or update on public.verified_domain
  for each row execute function public.v2_guard_verified_domain();

-- A post written through the client is always the caller's, open and unseeded.
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function public.v2_post_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then raise exception 'sign in to post' using errcode = '42501'; end if;
    if public.is_blocked(new.board_id) then raise exception 'blocked on this board' using errcode = '42501'; end if;
    new.author_id   := auth.uid();
    new.status      := 'open';
    new.source_url  := null;
    new.merged_into := null;
    new.hidden_at   := null;
    new.edited_at   := null;
    new.vote_count  := 0;
    new.reply_count := 0;
    new.created_at  := now();
  end if;
  return new;
end $$;
create trigger v2_post_before_insert before insert on public.post
  for each row execute function public.v2_post_before_insert();

create or replace function public.v2_stamp_edited()
returns trigger language plpgsql as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;
create trigger v2_post_edited before update of title, body on public.post
  for each row execute function public.v2_stamp_edited();

create or replace function public.v2_stamp_reply_edited()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
create trigger v2_reply_edited before update of body on public.reply
  for each row execute function public.v2_stamp_reply_edited();

-- Replies: one level of nesting, same post, official only from the board's team.
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function public.v2_reply_before_insert()
returns trigger language plpgsql set search_path = public as $$
declare parent reply;
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then raise exception 'sign in to reply' using errcode = '42501'; end if;
    new.author_id  := auth.uid();
    new.hidden_at  := null;
    new.edited_at  := null;
    new.created_at := now();
    if public.is_blocked(public.post_board(new.post_id)) then
      raise exception 'blocked on this board' using errcode = '42501';
    end if;
    if new.is_official and not public.is_board_team(public.post_board(new.post_id)) then
      raise exception 'only the team can reply officially' using errcode = '42501';
    end if;
  end if;
  if new.parent_id is not null then
    select * into parent from reply where id = new.parent_id;
    if parent.post_id is distinct from new.post_id then
      raise exception 'parent reply belongs to another post' using errcode = 'check_violation';
    end if;
    if parent.parent_id is not null then
      new.parent_id := parent.parent_id;   -- flatten: reply to a reply joins its thread
    end if;
  end if;
  return new;
end $$;
create trigger v2_reply_before_insert before insert on public.reply
  for each row execute function public.v2_reply_before_insert();

-- Votes: not on your blocked boards, not on a merged-away or hidden post.
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function public.v2_vote_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.user_id := auth.uid();
    if public.is_blocked(public.post_board(new.post_id)) then
      raise exception 'blocked on this board' using errcode = '42501';
    end if;
    if exists (select 1 from post where id = new.post_id and (status = 'merged' or hidden_at is not null)) then
      raise exception 'this post is closed to votes' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger v2_vote_before_insert before insert on public.vote
  for each row execute function public.v2_vote_before_insert();

-- Counters and the side effects that hang off them.
create or replace function public.v2_vote_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare total int; author uuid;
begin
  if tg_op = 'INSERT' then
    update post set vote_count = vote_count + 1 where id = new.post_id
      returning vote_count, author_id into total, author;
    -- Voting auto-follows the post.
    insert into follow (user_id, target, target_id) values (new.user_id, 'post', new.post_id)
      on conflict do nothing;
    if total in (10, 50, 100, 500, 1000) then
      perform v2_notify(author, 'upvote_milestone', null, 'post', new.post_id, new.post_id,
                        jsonb_build_object('votes', total));
    end if;
    return new;
  else
    update post set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end $$;
create trigger v2_vote_after after insert or delete on public.vote
  for each row execute function public.v2_vote_after();

create or replace function public.v2_post_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update board set post_count = post_count + 1 where id = new.board_id;
    if new.author_id is not null then
      insert into follow (user_id, target, target_id) values (new.author_id, 'post', new.id)
        on conflict do nothing;
    end if;
    return new;
  else
    update board set post_count = greatest(post_count - 1, 0) where id = old.board_id;
    delete from follow where target = 'post' and target_id = old.id;
    delete from notification where target_type = 'post' and target_id = old.id;
    return old;
  end if;
end $$;
create trigger v2_post_after after insert or delete on public.post
  for each row execute function public.v2_post_after();

create or replace function public.v2_reply_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare p post; parent_author uuid;
begin
  if tg_op = 'DELETE' then
    update post set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  update post set reply_count = reply_count + 1 where id = new.post_id returning * into p;
  if new.parent_id is not null then
    select author_id into parent_author from reply where id = new.parent_id;
    perform v2_notify(parent_author, 'reply', new.author_id, 'reply', new.id, new.post_id);
  end if;
  if p.author_id is distinct from parent_author then
    perform v2_notify(p.author_id, 'reply', new.author_id, 'reply', new.id, new.post_id);
  end if;
  return new;
end $$;
create trigger v2_reply_after after insert or delete on public.reply
  for each row execute function public.v2_reply_after();

create or replace function public.v2_follow_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare r follow; d int;
begin
  if tg_op = 'INSERT' then r := new; d := 1; else r := old; d := -1; end if;
  case r.target
    when 'board' then update board   set follower_count = greatest(follower_count + d, 0) where id = r.target_id;
    when 'hub'   then update hub     set follower_count = greatest(follower_count + d, 0) where id = r.target_id;
    when 'user'  then update profile set follower_count = greatest(follower_count + d, 0) where id = r.target_id;
    else null;
  end case;
  if tg_op = 'INSERT' and r.target = 'user' then
    perform v2_notify(r.target_id, 'follow', r.user_id, 'user', r.user_id);
  end if;
  return r;
end $$;
create trigger v2_follow_after after insert or delete on public.follow
  for each row execute function public.v2_follow_after();

-- A board or hub always keeps at least one owner once it has been claimed.
create or replace function public.v2_guard_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from membership
                      where scope = old.scope and scope_id = old.scope_id and role = 'owner'
                        and user_id <> old.user_id) then
    -- Cascades from a deleted board/hub/profile are allowed through by the account
    -- deletion flow (step 4), which transfers or releases ownership first.
    raise exception 'a claimed % must keep an owner', old.scope using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger v2_membership_last_owner before update or delete on public.membership
  for each row execute function public.v2_guard_last_owner();

-- ================================================================ RPCs

-- Team members move a post along its state machine. Merge has its own RPC (step 8).
create or replace function public.set_post_status(p_post uuid, p_to public.v2_post_status, p_note text default null)
returns public.post language plpgsql security definer set search_path = public as $$
declare p post; f record;
begin
  select * into p from post where id = p_post for update;
  if not found then raise exception 'post not found' using errcode = 'no_data_found'; end if;
  if not is_board_team(p.board_id) then raise exception 'only the team can change status' using errcode = '42501'; end if;
  if p_to = 'merged' then raise exception 'use merge_post to merge' using errcode = 'check_violation'; end if;
  if p.status = 'merged' then raise exception 'a merged post is terminal; use unmerge_post' using errcode = 'check_violation'; end if;
  if p.status = p_to then return p; end if;

  insert into status_event (post_id, "from", "to", note, actor_id)
  values (p.id, p.status, p_to, nullif(btrim(p_note), ''), auth.uid());
  update post set status = p_to where id = p.id returning * into p;

  -- Everyone following the post hears about it; voters follow automatically.
  for f in select user_id from follow where target = 'post' and target_id = p.id loop
    perform v2_notify(f.user_id, 'status_change', auth.uid(), 'post', p.id, p.id,
                      jsonb_build_object('to', p_to));
  end loop;
  return p;
end $$;

-- Team members (or platform admins) hide and unhide posts and replies.
create or replace function public.set_post_hidden(p_post uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := post_board(p_post);
begin
  if b is null then raise exception 'post not found' using errcode = 'no_data_found'; end if;
  if not (is_board_team(b) or is_platform_admin()) then raise exception 'not allowed' using errcode = '42501'; end if;
  update post set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_post;
end $$;

create or replace function public.set_reply_hidden(p_reply uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select post_board(post_id) into b from reply where id = p_reply;
  if b is null then raise exception 'reply not found' using errcode = 'no_data_found'; end if;
  if not (is_board_team(b) or is_platform_admin()) then raise exception 'not allowed' using errcode = '42501'; end if;
  update reply set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_reply;
end $$;

-- One-click unsubscribe from an email link, no sign-in. Turns off the email channel
-- for one kind, or for every kind when p_kind is null.
create or replace function public.unsubscribe(p_token uuid, p_kind public.v2_notification_kind default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid; k public.v2_notification_kind;
begin
  select user_id into uid from email_token where token = p_token;
  if uid is null then return false; end if;   -- never reveal which tokens exist
  for k in select unnest(enum_range(null::public.v2_notification_kind)) loop
    if p_kind is null or k = p_kind then
      insert into notification_pref (user_id, kind, channel, enabled) values (uid, k, 'email', false)
      on conflict (user_id, kind, channel) do update set enabled = false;
    end if;
  end loop;
  return true;
end $$;

-- ================================================================ grants

do $$
declare t text;
begin
  foreach t in array array['profile','platform_admin','hub','board','shared_domain','verified_domain',
    'domain_challenge','membership','join_request','ownership_dispute','post','vote','reply',
    'status_event','merge_record','follow','notification','notification_pref','email_token','report','block'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Reads. Row visibility is still decided by the policies below.
grant select on public.profile, public.hub, public.board, public.post, public.vote, public.reply,
                public.status_event, public.shared_domain to anon, authenticated;
grant select on public.platform_admin, public.verified_domain, public.membership, public.join_request,
                public.ownership_dispute, public.follow, public.notification, public.notification_pref,
                public.report, public.block to authenticated;

-- Writes the app makes directly, column by column.
grant update (handle, name, bio, avatar_path)                   on public.profile to authenticated;
grant update (name, tagline, site, color, logo_path, category)  on public.board to authenticated;
grant update (name, description)                                on public.hub to authenticated;
grant insert (board_id, type, title, body)                      on public.post to authenticated;
grant update (title, body, type)                                on public.post to authenticated;
grant delete                                                    on public.post to authenticated;
grant insert (post_id)                                          on public.vote to authenticated;
grant delete                                                    on public.vote to authenticated;
grant insert (post_id, parent_id, body, is_official)            on public.reply to authenticated;
grant update (body)                                             on public.reply to authenticated;
grant delete                                                    on public.reply to authenticated;
grant insert (target, target_id)                                on public.follow to authenticated;
grant delete                                                    on public.follow to authenticated;
grant update (read_at)                                          on public.notification to authenticated;
grant delete                                                    on public.notification to authenticated;
grant insert, update, delete                                    on public.notification_pref to authenticated;
grant insert (target, target_id, reason)                        on public.report to authenticated;
grant insert (scope, scope_id, work_email)                      on public.join_request to authenticated;
grant update (status)                                           on public.join_request to authenticated;
grant insert (scope, scope_id, reason, work_email)              on public.ownership_dispute to authenticated;
grant insert (scope, scope_id, user_id), delete                 on public.block to authenticated;
grant delete                                                    on public.membership to authenticated;

-- Defaults so the client never has to (and cannot) send these.
alter table public.vote              alter column user_id  set default auth.uid();
alter table public.follow            alter column user_id  set default auth.uid();
alter table public.report            alter column reporter set default auth.uid();
alter table public.join_request      alter column user_id  set default auth.uid();
alter table public.ownership_dispute alter column user_id  set default auth.uid();
alter table public.block             alter column blocked_by set default auth.uid();
alter table public.notification_pref alter column user_id  set default auth.uid();

-- Functions are executable by PUBLIC by default (v1 relies on that, so this file
-- leaves the schema default alone). Every v2 RPC checks auth.uid() itself; only the
-- internal notifier is locked away (above).
grant execute on function public.unsubscribe(uuid, public.v2_notification_kind) to anon, authenticated;
grant execute on function public.set_post_status(uuid, public.v2_post_status, text),
                          public.set_post_hidden(uuid, boolean),
                          public.set_reply_hidden(uuid, boolean),
                          public.is_platform_admin(uuid),
                          public.is_board_team(uuid, uuid),
                          public.is_board_admin(uuid, uuid) to authenticated;
-- RLS evaluates helpers as the calling role; anon reads need these two.
grant execute on function public.can_see_post(uuid, uuid), public.post_board(uuid) to anon, authenticated;

-- ================================================================ policies

-- profile: public; you edit only yourself.
create policy "v2 profile read"   on public.profile for select using (true);
create policy "v2 profile update" on public.profile for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- platform_admin: you can see whether you are one; platform admins see the list.
create policy "v2 platform_admin read" on public.platform_admin for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- hub and board: public; owners and admins edit settings.
create policy "v2 hub read"     on public.hub for select using (true);
create policy "v2 hub update"   on public.hub for update to authenticated
  using (public.is_scope_admin('hub', id)) with check (public.is_scope_admin('hub', id));
create policy "v2 board read"   on public.board for select using (true);
create policy "v2 board update" on public.board for update to authenticated
  using (public.is_board_admin(id)) with check (public.is_board_admin(id));

create policy "v2 shared_domain read" on public.shared_domain for select using (true);

-- verified_domain: yours; platform admins see all. Written only by the step 7 RPCs.
create policy "v2 verified_domain read" on public.verified_domain for select to authenticated
  using (verified_by = auth.uid() or public.is_platform_admin());

-- membership: you, your fellow team members, platform admins. Admins remove
-- non-owners; anyone may leave (the last-owner trigger still applies).
create policy "v2 membership read" on public.membership for select to authenticated
  using (user_id = auth.uid() or public.is_scope_team(scope, scope_id) or public.is_platform_admin());
create policy "v2 membership delete" on public.membership for delete to authenticated
  using (user_id = auth.uid()
      or (role <> 'owner' and public.is_scope_admin(scope, scope_id)));

-- join_request: you ask and may withdraw; the scope's admins see and decide.
create policy "v2 join_request read" on public.join_request for select to authenticated
  using (user_id = auth.uid() or public.is_scope_admin(scope, scope_id));
create policy "v2 join_request insert" on public.join_request for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending'
              and not public.is_scope_team(scope, scope_id));
create policy "v2 join_request withdraw" on public.join_request for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'withdrawn');

-- ownership_dispute: decided by a platform admin, never by the incumbent team, so the
-- team cannot even read it.
create policy "v2 dispute read" on public.ownership_dispute for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy "v2 dispute insert" on public.ownership_dispute for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- post: see section above (can_see_post). Authors edit and delete their own.
create policy "v2 post read" on public.post for select
  using (public.can_see_post(id));
create policy "v2 post insert" on public.post for insert to authenticated
  with check (author_id = auth.uid());
create policy "v2 post author update" on public.post for update to authenticated
  using (author_id = auth.uid() and status <> 'merged')
  with check (author_id = auth.uid());
create policy "v2 post author delete" on public.post for delete to authenticated
  using (author_id = auth.uid());

-- vote: counts are public; you add and remove your own.
create policy "v2 vote read"   on public.vote for select using (public.can_see_post(post_id));
create policy "v2 vote insert" on public.vote for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_post(post_id));
create policy "v2 vote delete" on public.vote for delete to authenticated
  using (user_id = auth.uid());

-- reply: visible with its post unless hidden (author and team still see it).
create policy "v2 reply read" on public.reply for select
  using (public.can_see_post(post_id)
         and (hidden_at is null
              or author_id = auth.uid()
              or public.is_board_team(public.post_board(post_id))
              or public.is_platform_admin()));
create policy "v2 reply insert" on public.reply for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_post(post_id));
create policy "v2 reply author update" on public.reply for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "v2 reply author delete" on public.reply for delete to authenticated
  using (author_id = auth.uid());

create policy "v2 status_event read" on public.status_event for select
  using (public.can_see_post(post_id));

-- follow: private to you; public counts live on the followed row.
create policy "v2 follow read"   on public.follow for select to authenticated using (user_id = auth.uid());
create policy "v2 follow insert" on public.follow for insert to authenticated with check (user_id = auth.uid());
create policy "v2 follow delete" on public.follow for delete to authenticated using (user_id = auth.uid());

create policy "v2 notification read"   on public.notification for select to authenticated using (recipient = auth.uid());
create policy "v2 notification update" on public.notification for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());
create policy "v2 notification delete" on public.notification for delete to authenticated using (recipient = auth.uid());

create policy "v2 notification_pref own" on public.notification_pref for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- report: you file and see your own; platform admins work the queue (via RPC in step 8).
create policy "v2 report read"   on public.report for select to authenticated
  using (reporter = auth.uid() or public.is_platform_admin());
create policy "v2 report insert" on public.report for insert to authenticated
  with check (reporter = auth.uid() and status = 'open');

-- block: the scope's team sees it; owners and admins add and lift.
create policy "v2 block read"   on public.block for select to authenticated
  using (public.is_scope_team(scope, scope_id) or public.is_platform_admin());
create policy "v2 block insert" on public.block for insert to authenticated
  with check (public.is_scope_admin(scope, scope_id) and user_id <> auth.uid());
create policy "v2 block delete" on public.block for delete to authenticated
  using (public.is_scope_admin(scope, scope_id));

-- domain_challenge, merge_record, email_token: RLS on, no policy. Server only.
