-- 0049: a join request can carry a short message (#189). NEEDS ALBERT'S APPROVAL
-- before it is applied to production (schema + RPC signature change).
--
-- Why. "Work here?" sent only a work email, so an admin approving someone saw a name,
-- an address and an age, and nothing about who they are or why they want in.
--
-- What changes.
--   1. public.join_request gets `message text` (nullable), at most 280 characters and
--      never blank (blank is stored as null). No backfill: existing rows stay null.
--   2. public.request_join gains a fourth argument, p_message text default null. The
--      three-argument version is DROPPED and replaced, so there is exactly one
--      candidate for PostgREST, and a client that still sends three named arguments
--      (the deployed bundle until this ships) keeps working through the default.
--      The body is the deployed one (pg_get_functiondef, 2026-10-27) plus the message:
--      trimmed, null when blank, refused over 280 with error 'message_length'. A
--      repeat request while one is pending may add or replace the message.
--   3. The owners'/admins' pending 'join' notification carries data.message when set.
--
-- What does NOT change: RLS. join_request already has a table-level SELECT grant and
-- the "v2 join_request read" policy (the requester and the scope's admins), so the new
-- column is readable by exactly those people. The client's INSERT grant stays limited
-- to (scope, scope_id, work_email): only this definer RPC writes `message`. Execute
-- stays authenticated-only. Join notifications are still not emailed.
--
-- Rollback: supabase/rollback/0049_down.sql (restores the three-argument function,
-- then drops the column; messages written meanwhile are lost).

alter table public.join_request add column if not exists message text;
alter table public.join_request drop constraint if exists join_request_message_len;
alter table public.join_request add constraint join_request_message_len
  check (message is null or char_length(message) between 1 and 280);
comment on column public.join_request.message is 'Optional note from the requester to the admins, 1-280 chars (#189).';

drop function if exists public.request_join(public.v2_scope, uuid, text);

create function public.request_join(p_scope public.v2_scope, p_scope_id uuid, p_work_email text,
                                    p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_work_email, '')));
  v_msg  text := nullif(regexp_replace(coalesce(p_message, ''), '^\s+|\s+$', '', 'g'), '');
  d      text;
  v_id   uuid;
  a      record;
  v_hub  uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if char_length(v_msg) > 280 then return public.v2_err('message_length'); end if;
  if not public.v2_scope_claimed(p_scope, p_scope_id) then return public.v2_err('not_claimed'); end if;
  if coalesce(private.is_scope_team(p_scope, p_scope_id, uid), false) then return public.v2_err('already_member'); end if;
  if v_mail !~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_email'); end if;
  d := public.v2_scope_mail_domain(p_scope, p_scope_id, split_part(v_mail, '@', 2));
  if d is null then return public.v2_err('wrong_domain'); end if;
  if not public.v2_has_verified(d) then return public.v2_err('not_verified'); end if;

  -- Requests expire after 14 days (mockup); a stale one makes way for a new one.
  update join_request set status = 'withdrawn'
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending'
     and created_at < now() - interval '14 days';
  select id into v_id from join_request
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending';
  if found then
    if v_msg is not null then update join_request set message = v_msg where id = v_id; end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'already', true);
  end if;

  insert into join_request (user_id, scope, scope_id, work_email, message) values (uid, p_scope, p_scope_id, v_mail, v_msg)
  returning id into v_id;

  if p_scope = 'board' then select hub_id into v_hub from board where id = p_scope_id; end if;
  for a in select distinct user_id from membership
            where role in ('owner', 'admin')
              and ((scope = p_scope and scope_id = p_scope_id) or (scope = 'hub' and scope_id = v_hub)) loop
    perform public.v2_notify(a.user_id, 'join', uid, p_scope::text, p_scope_id, null,
                             jsonb_strip_nulls(jsonb_build_object('request', v_id, 'status', 'pending', 'message', v_msg)));
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke execute on function public.request_join(public.v2_scope, uuid, text, text) from public, anon;
grant execute on function public.request_join(public.v2_scope, uuid, text, text) to authenticated, service_role;
comment on function public.request_join(public.v2_scope, uuid, text, text) is
  'Ask to join a claimed board/company team with a verified work email and an optional message (#189).';

notify pgrst, 'reload schema';
