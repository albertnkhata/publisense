-- 0058: direct messages, step 1 of 4 (database only). NEEDS ALBERT'S APPROVAL
-- before it is applied to production (new tables, RLS, RPCs).
--
-- Model (Albert, 2026-11-05): open DMs on X's pattern. Any signed-in user may start a
-- one-to-one conversation. If the recipient follows the sender, it lands in their
-- Inbox; otherwise it is a Request, which shows the first message only, and the sender
-- cannot send a second message until the recipient accepts (or replies, which accepts).
--
-- What this adds.
--   1. profile.dm_policy: who may start a conversation with you. 'everyone' (default),
--      'following' (people you follow), 'nobody'. Public like the rest of profile, so
--      the client can hide the Message button. Changed only through set_dm_policy.
--   2. user_block: a person-to-person block (distinct from public.block, which is a
--      board/hub moderation ban). Either direction stops new messages. Only the
--      blocker can read their rows; the blocked person is never told.
--   3. dm_conversation (one row per pair, user_a < user_b), dm_member (each person's
--      state: inbox or request, cleared_at, last_read_at, muted) and dm_message.
--   4. RPCs, all security definer and authenticated-only: dm_start, dm_send,
--      dm_accept, dm_delete, dm_mark_read, dm_mute, dm_conversations, set_dm_policy,
--      block_user, unblock_user, blocked_users. Every rule (block, policy, request
--      limit, rate limits, confirmed email) is checked here, server-side.
--   5. RLS: you read only conversations you are in, only your own member row, and
--      only messages newer than when you last cleared the conversation. No client
--      writes at all: tables are SELECT-only for authenticated, nothing for anon.
--   6. dm_message joins the supabase_realtime publication when it exists, so step 3
--      can subscribe to live inserts (Realtime applies the same RLS).
--
-- Not in this step: UI, notification emails (step 3), images, groups, reactions.
-- Reporting uses the existing report on a user ('user' target): report the sender.
--
-- Times use clock_timestamp(), so messages within one transaction still order and
-- compare against read and cleared marks.
--
-- Limits: 20 new conversations per 24 hours, 30 messages per minute and 500 per
-- 24 hours per sender (platform admins exempt). Bodies are trimmed, 1-2000 chars.
--
-- Rollback: supabase/rollback/0058_down.sql (drops everything above; messages lost).

create type public.v2_dm_policy as enum ('everyone', 'following', 'nobody');
create type public.v2_dm_state  as enum ('inbox', 'request');

alter table public.profile add column if not exists dm_policy public.v2_dm_policy not null default 'everyone';
comment on column public.profile.dm_policy is 'Who may start a DM with this person (0058).';

-- ------------------------------------------------------------------ tables

create table public.user_block (
  blocker    uuid not null references public.profile (id) on delete cascade,
  blocked    uuid not null references public.profile (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index user_block_blocked_idx on public.user_block (blocked);

create table public.dm_conversation (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profile (id) on delete cascade,
  user_b          uuid not null references public.profile (id) on delete cascade,
  created_by      uuid references public.profile (id) on delete set null,
  created_at      timestamptz not null default clock_timestamp(),
  last_message_at timestamptz not null default clock_timestamp(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table public.dm_member (
  conversation_id uuid not null references public.dm_conversation (id) on delete cascade,
  user_id         uuid not null references public.profile (id) on delete cascade,
  state           public.v2_dm_state not null,
  cleared_at      timestamptz,
  last_read_at    timestamptz,
  muted           boolean not null default false,
  primary key (conversation_id, user_id)
);
create index dm_member_user_idx on public.dm_member (user_id);

create table public.dm_message (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversation (id) on delete cascade,
  sender          uuid references public.profile (id) on delete set null,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default clock_timestamp()
);
create index dm_message_conv_idx on public.dm_message (conversation_id, created_at desc);
create index dm_message_sender_idx on public.dm_message (sender, created_at desc);

-- ------------------------------------------------------------------ helpers

create function private.dm_is_member(p_conversation uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dm_member m where m.conversation_id = p_conversation and m.user_id = p_user);
$$;

create function private.dm_cleared_at(p_conversation uuid, p_user uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select m.cleared_at from public.dm_member m where m.conversation_id = p_conversation and m.user_id = p_user;
$$;

-- Either person has blocked the other.
create function private.dm_blocked_between(p_one uuid, p_two uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_block b
                  where (b.blocker = p_one and b.blocked = p_two) or (b.blocker = p_two and b.blocked = p_one));
$$;

create function private.dm_follows(p_follower uuid, p_followed uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.follow f
                  where f.user_id = p_follower and f.target = 'user' and f.target_id = p_followed);
$$;

revoke all on function private.dm_is_member(uuid, uuid), private.dm_cleared_at(uuid, uuid),
                       private.dm_blocked_between(uuid, uuid), private.dm_follows(uuid, uuid) from public;
-- The policies below run as the caller, so the API roles execute the two policy helpers.
grant execute on function private.dm_is_member(uuid, uuid), private.dm_cleared_at(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.user_block      enable row level security;
alter table public.dm_conversation enable row level security;
alter table public.dm_member       enable row level security;
alter table public.dm_message      enable row level security;

revoke all on public.user_block, public.dm_conversation, public.dm_member, public.dm_message from anon, authenticated;
grant select on public.user_block, public.dm_conversation, public.dm_member, public.dm_message to authenticated;

create policy "v2 user_block own" on public.user_block for select to authenticated
  using (blocker = auth.uid());
create policy "v2 dm_conversation member" on public.dm_conversation for select to authenticated
  using (private.dm_is_member(id, auth.uid()));
create policy "v2 dm_member own" on public.dm_member for select to authenticated
  using (user_id = auth.uid());
create policy "v2 dm_message member" on public.dm_message for select to authenticated
  using (private.dm_is_member(conversation_id, auth.uid())
         and created_at > coalesce(private.dm_cleared_at(conversation_id, auth.uid()), '-infinity'::timestamptz));

-- ------------------------------------------------------------------ RPCs

create function public.set_dm_policy(p_policy public.v2_dm_policy)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.v2_err('sign_in'); end if;
  if p_policy is null then return public.v2_err('invalid'); end if;
  update public.profile set dm_policy = p_policy where id = me;
  return jsonb_build_object('ok', true, 'policy', p_policy);
end $$;

create function public.block_user(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.v2_err('sign_in'); end if;
  if p_user is null or p_user = me then return public.v2_err('invalid'); end if;
  if not exists (select 1 from public.profile where id = p_user) then return public.v2_err('not_found'); end if;
  insert into public.user_block (blocker, blocked) values (me, p_user) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create function public.unblock_user(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.v2_err('sign_in'); end if;
  delete from public.user_block where blocker = me and blocked = p_user;
  return jsonb_build_object('ok', true);
end $$;

create function public.blocked_users()
returns table (id uuid, handle text, name text, avatar_path text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.handle, p.name, p.avatar_path, b.created_at
    from public.user_block b join public.profile p on p.id = b.blocked
   where b.blocker = auth.uid()
   order by b.created_at desc;
$$;

-- Shared by dm_start and dm_send: the per-sender message limits.
create function private.dm_message_limit(p_sender uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n_min int;
  n_day int;
  oldest timestamptz;
begin
  if private.is_platform_admin(p_sender) then return null; end if;
  select count(*) filter (where created_at > clock_timestamp() - interval '1 minute'), count(*)
    into n_min, n_day
    from public.dm_message where sender = p_sender and created_at > clock_timestamp() - interval '24 hours';
  if n_min >= 30 then
    return public.v2_err('rate_limited', jsonb_build_object('hint', 'short', 'retry_after', clock_timestamp() + interval '1 minute'));
  end if;
  if n_day >= 500 then
    select min(created_at) into oldest from public.dm_message where sender = p_sender and created_at > clock_timestamp() - interval '24 hours';
    return public.v2_err('rate_limited', jsonb_build_object('hint', 'day', 'retry_after', oldest + interval '24 hours'));
  end if;
  return null;
end $$;
revoke all on function private.dm_message_limit(uuid) from public;

create function public.dm_send(p_conversation uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me      uuid := auth.uid();
  v_body  text := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  mine    public.dm_member;
  theirs  public.dm_member;
  v_limit jsonb;
  v_id    uuid;
  v_at    timestamptz;
begin
  if me is null then return public.v2_err('sign_in'); end if;
  if v_body is null then return public.v2_err('empty'); end if;
  if char_length(v_body) > 2000 then return public.v2_err('too_long'); end if;
  select * into mine from public.dm_member where conversation_id = p_conversation and user_id = me;
  if not found then return public.v2_err('not_found'); end if;
  select * into theirs from public.dm_member where conversation_id = p_conversation and user_id <> me;
  if theirs.user_id is null or private.dm_blocked_between(me, theirs.user_id) then return public.v2_err('not_allowed'); end if;

  -- A pending request carries one message until the other person accepts or replies.
  if theirs.state = 'request'
     and exists (select 1 from public.dm_message where conversation_id = p_conversation and sender = me)
     and not exists (select 1 from public.dm_message where conversation_id = p_conversation and sender = theirs.user_id) then
    return public.v2_err('awaiting_accept');
  end if;

  v_limit := private.dm_message_limit(me);
  if v_limit is not null then return v_limit; end if;

  insert into public.dm_message (conversation_id, sender, body) values (p_conversation, me, v_body)
  returning id, created_at into v_id, v_at;
  update public.dm_conversation set last_message_at = v_at where id = p_conversation;
  -- Replying to a request accepts it; sending also counts as reading.
  update public.dm_member set state = 'inbox', last_read_at = v_at where conversation_id = p_conversation and user_id = me;
  return jsonb_build_object('ok', true, 'id', v_id, 'created_at', v_at);
end $$;

create function public.dm_start(p_recipient uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me       uuid := auth.uid();
  v_body   text := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  v_policy public.v2_dm_policy;
  v_conv   uuid;
  v_new    int;
  oldest   timestamptz;
  v_res    jsonb;
begin
  if me is null then return public.v2_err('sign_in'); end if;
  if p_recipient is null or p_recipient = me then return public.v2_err('invalid'); end if;
  if v_body is null then return public.v2_err('empty'); end if;
  if char_length(v_body) > 2000 then return public.v2_err('too_long'); end if;
  if not exists (select 1 from auth.users u where u.id = me and u.email_confirmed_at is not null) then
    return public.v2_err('confirm_email');
  end if;
  select dm_policy into v_policy from public.profile where id = p_recipient;
  if not found then return public.v2_err('not_found'); end if;

  -- An existing conversation just takes the message (its own rules apply there).
  select id into v_conv from public.dm_conversation
   where user_a = least(me, p_recipient) and user_b = greatest(me, p_recipient);
  if found then
    v_res := public.dm_send(v_conv, v_body);
    return v_res || jsonb_build_object('conversation', v_conv);
  end if;

  -- A block either way, or the recipient's setting, refuses with the same answer.
  if private.dm_blocked_between(me, p_recipient)
     or v_policy = 'nobody'
     or (v_policy = 'following' and not private.dm_follows(p_recipient, me)) then
    return public.v2_err('not_allowed');
  end if;

  if not private.is_platform_admin(me) then
    select count(*), min(created_at) into v_new, oldest from public.dm_conversation
     where created_by = me and created_at > clock_timestamp() - interval '24 hours';
    if v_new >= 20 then
      return public.v2_err('rate_limited', jsonb_build_object('hint', 'conversations', 'retry_after', oldest + interval '24 hours'));
    end if;
  end if;
  v_res := private.dm_message_limit(me);
  if v_res is not null then return v_res; end if;

  insert into public.dm_conversation (user_a, user_b, created_by)
  values (least(me, p_recipient), greatest(me, p_recipient), me)
  returning id into v_conv;
  insert into public.dm_member (conversation_id, user_id, state, last_read_at) values
    (v_conv, me, 'inbox', clock_timestamp()),
    (v_conv, p_recipient, case when private.dm_follows(p_recipient, me) then 'inbox' else 'request' end::public.v2_dm_state, null);

  v_res := public.dm_send(v_conv, v_body);
  return v_res || jsonb_build_object('conversation', v_conv);
end $$;

create function public.dm_accept(p_conversation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.v2_err('sign_in'); end if;
  update public.dm_member set state = 'inbox' where conversation_id = p_conversation and user_id = me;
  if not found then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Deleting clears the history for you only (X's "delete conversation"). The other
-- person keeps theirs; a later message brings the conversation back for you.
create function public.dm_delete(p_conversation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.v2_err('sign_in'); end if;
  update public.dm_member set cleared_at = clock_timestamp(), last_read_at = clock_timestamp()
   where conversation_id = p_conversation and user_id = me;
  if not found then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.dm_mark_read(p_conversation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.v2_err('sign_in'); end if;
  update public.dm_member set last_read_at = clock_timestamp() where conversation_id = p_conversation and user_id = me;
  if not found then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.dm_mute(p_conversation uuid, p_muted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.v2_err('sign_in'); end if;
  update public.dm_member set muted = coalesce(p_muted, false) where conversation_id = p_conversation and user_id = me;
  if not found then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- The caller's conversation list: Inbox and Requests, newest first. A conversation
-- you cleared appears again only once a newer message arrives. A request from
-- someone you have since blocked is left out.
create function public.dm_conversations()
returns table (id uuid, state public.v2_dm_state, muted boolean,
               other_id uuid, other_handle text, other_name text, other_avatar_path text,
               last_body text, last_sender uuid, last_at timestamptz, unread int, blocked boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, m.state, m.muted,
         p.id, p.handle, p.name, p.avatar_path,
         last.body, last.sender, last.created_at,
         (select count(*)::int from public.dm_message x
           where x.conversation_id = c.id and x.sender is distinct from auth.uid()
             and x.created_at > greatest(coalesce(m.last_read_at, '-infinity'), coalesce(m.cleared_at, '-infinity'))),
         exists (select 1 from public.user_block b where b.blocker = auth.uid() and b.blocked = p.id)
    from public.dm_member m
    join public.dm_conversation c on c.id = m.conversation_id
    join public.dm_member o on o.conversation_id = c.id and o.user_id <> m.user_id
    join public.profile p on p.id = o.user_id
    cross join lateral (
      select x.body, x.sender, x.created_at from public.dm_message x
       where x.conversation_id = c.id and x.created_at > coalesce(m.cleared_at, '-infinity')
       order by x.created_at desc limit 1) last
   where m.user_id = auth.uid()
     and not (m.state = 'request' and exists (select 1 from public.user_block b where b.blocker = auth.uid() and b.blocked = p.id))
   order by last.created_at desc;
$$;

revoke execute on function
  public.set_dm_policy(public.v2_dm_policy), public.block_user(uuid), public.unblock_user(uuid), public.blocked_users(),
  public.dm_send(uuid, text), public.dm_start(uuid, text), public.dm_accept(uuid), public.dm_delete(uuid),
  public.dm_mark_read(uuid), public.dm_mute(uuid, boolean), public.dm_conversations()
  from public, anon;
grant execute on function
  public.set_dm_policy(public.v2_dm_policy), public.block_user(uuid), public.unblock_user(uuid), public.blocked_users(),
  public.dm_send(uuid, text), public.dm_start(uuid, text), public.dm_accept(uuid), public.dm_delete(uuid),
  public.dm_mark_read(uuid), public.dm_mute(uuid, boolean), public.dm_conversations()
  to authenticated, service_role;

-- ------------------------------------------------------------------ realtime

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_message') then
    execute 'alter publication supabase_realtime add table public.dm_message';
  end if;
end $$;

notify pgrst, 'reload schema';
