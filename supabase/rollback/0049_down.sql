-- Rollback for 0049 (#189): back to the three-argument request_join as deployed before
-- 0049 (pg_get_functiondef, 2026-10-27), then drop the message column.
-- Messages written while 0049 was live are lost.

drop function if exists public.request_join(public.v2_scope, uuid, text, text);

CREATE OR REPLACE FUNCTION public.request_join(p_scope v2_scope, p_scope_id uuid, p_work_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_work_email, '')));
  d      text;
  v_id   uuid;
  a      record;
  v_hub  uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
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
  if found then return jsonb_build_object('ok', true, 'id', v_id, 'already', true); end if;

  insert into join_request (user_id, scope, scope_id, work_email) values (uid, p_scope, p_scope_id, v_mail)
  returning id into v_id;

  if p_scope = 'board' then select hub_id into v_hub from board where id = p_scope_id; end if;
  for a in select distinct user_id from membership
            where role in ('owner', 'admin')
              and ((scope = p_scope and scope_id = p_scope_id) or (scope = 'hub' and scope_id = v_hub)) loop
    perform public.v2_notify(a.user_id, 'join', uid, p_scope::text, p_scope_id, null,
                             jsonb_build_object('request', v_id, 'status', 'pending'));
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

revoke execute on function public.request_join(public.v2_scope, uuid, text) from public, anon;
grant execute on function public.request_join(public.v2_scope, uuid, text) to authenticated, service_role;

alter table public.join_request drop constraint if exists join_request_message_len;
alter table public.join_request drop column if exists message;

notify pgrst, 'reload schema';
