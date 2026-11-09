-- 0065: Inbound issue sync webhooks for boards and hubs (Phase 6 Track A+).
--
-- Every exported issue (Linear, GitHub Issues, or copied Markdown) embeds the
-- canonical Publisense post URL (`https://publisense.app/post/<id>`).
-- This migration gives each board and hub a secret inbound webhook token so
-- GitHub (`issues` / `pull_request` webhooks), Linear (`Issue` webhooks), or
-- custom release pipelines can POST to `/api/webhook?token=<uuid>` and
-- automatically transition referenced posts (e.g. to `in_progress`, `shipped`,
-- or `declined`), record the timeline note, notify every voter, and trigger
-- outbound Slack/Discord webhooks.

create table if not exists private.scope_inbound_token (
  scope      public.v2_scope not null,
  scope_id   uuid            not null,
  token      uuid            not null default gen_random_uuid() unique,
  actor_id   uuid            references public.profile(id) on delete set null,
  updated_at timestamptz     not null default now(),
  primary key (scope, scope_id)
);

revoke all on table private.scope_inbound_token from public, anon, authenticated;

-- Extend get_scope_webhook so board/hub admins also receive their inbound sync token.
create or replace function public.get_scope_webhook(p_scope public.v2_scope, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_caller uuid := auth.uid();
  w        private.scope_webhook;
  v_has_w  boolean;
  v_token  uuid;
begin
  if v_caller is null then return public.v2_err('sign_in'); end if;
  if p_scope is null or p_scope_id is null then return public.v2_err('not_found'); end if;
  if not coalesce(private.is_scope_admin(p_scope, p_scope_id, v_caller), false) then
    return public.v2_err('not_allowed');
  end if;

  insert into private.scope_inbound_token (scope, scope_id, actor_id)
  values (p_scope, p_scope_id, v_caller)
  on conflict (scope, scope_id) do nothing;

  select token into v_token
    from private.scope_inbound_token
   where scope = p_scope and scope_id = p_scope_id;

  select * into w from private.scope_webhook where scope = p_scope and scope_id = p_scope_id;
  v_has_w := found;

  return jsonb_build_object(
    'ok', true,
    'inbound_token', v_token,
    'webhook', case when v_has_w then jsonb_build_object(
      'kind', w.kind,
      'url', w.url,
      'enabled', w.enabled,
      'updated_at', w.updated_at
    ) else null end
  );
end
$$;

revoke all on function public.get_scope_webhook(public.v2_scope, uuid) from public, anon;
grant execute on function public.get_scope_webhook(public.v2_scope, uuid) to authenticated;

create or replace function public.rotate_scope_inbound_token(p_scope public.v2_scope, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_caller uuid := auth.uid();
  v_token  uuid;
begin
  if v_caller is null then return public.v2_err('sign_in'); end if;
  if p_scope is null or p_scope_id is null then return public.v2_err('not_found'); end if;
  if not coalesce(private.is_scope_admin(p_scope, p_scope_id, v_caller), false) then
    return public.v2_err('not_allowed');
  end if;

  insert into private.scope_inbound_token (scope, scope_id, token, actor_id, updated_at)
  values (p_scope, p_scope_id, gen_random_uuid(), v_caller, now())
  on conflict (scope, scope_id) do update
    set token      = gen_random_uuid(),
        actor_id   = v_caller,
        updated_at = now()
  returning token into v_token;

  return jsonb_build_object('ok', true, 'inbound_token', v_token);
end
$$;

revoke all on function public.rotate_scope_inbound_token(public.v2_scope, uuid) from public, anon;
grant execute on function public.rotate_scope_inbound_token(public.v2_scope, uuid) to authenticated;

-- Token-authenticated RPC called by `/api/webhook?token=<uuid>` when GitHub,
-- Linear, or a release pipeline updates an issue referencing a Publisense post.
create or replace function public.apply_inbound_webhook(
  p_token uuid,
  p_post  uuid,
  p_to    public.v2_post_status,
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  t       private.scope_inbound_token;
  p       public.post;
  v_hub   uuid;
  v_actor uuid;
  v_note  text := left(nullif(btrim(coalesce(p_note, '')), ''), 280);
  f       record;
begin
  if p_token is null or p_post is null or p_to is null or p_to = 'merged'::public.v2_post_status then
    return public.v2_err('invalid_request');
  end if;

  select * into t from private.scope_inbound_token where token = p_token;
  if not found then
    return public.v2_err('invalid_token');
  end if;

  select * into p from public.post where id = p_post for update;
  if not found then
    return public.v2_err('post_not_found');
  end if;

  select hub_id into v_hub from public.board where id = p.board_id;

  if not (
    (t.scope = 'board'::public.v2_scope and t.scope_id = p.board_id) or
    (t.scope = 'hub'::public.v2_scope and t.scope_id = v_hub)
  ) then
    return public.v2_err('scope_mismatch');
  end if;

  if p.status = 'merged'::public.v2_post_status or p.status = p_to then
    return jsonb_build_object('ok', true, 'changed', false, 'status', p.status);
  end if;

  if t.actor_id is not null and coalesce(private.is_board_team(p.board_id, t.actor_id), false) then
    v_actor := t.actor_id;
  else
    select m.user_id into v_actor
      from public.membership m
     where (m.scope = 'board'::public.v2_scope and m.scope_id = p.board_id)
        or (m.scope = 'hub'::public.v2_scope and m.scope_id = v_hub)
     order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end, m.created_at
     limit 1;
  end if;

  insert into public.status_event (post_id, "from", "to", note, actor_id)
  values (p.id, p.status, p_to, v_note, v_actor);

  update public.post set status = p_to where id = p.id returning * into p;

  for f in select user_id from public.follow where target = 'post'::public.v2_follow_target and target_id = p.id loop
    perform public.v2_notify(
      f.user_id,
      'status_change'::public.v2_notification_kind,
      v_actor,
      'post',
      p.id,
      p.id,
      jsonb_strip_nulls(jsonb_build_object('to', p_to, 'note', v_note))
    );
  end loop;

  return jsonb_build_object('ok', true, 'changed', true, 'status', p.status);
end
$$;

revoke all on function public.apply_inbound_webhook(uuid, uuid, public.v2_post_status, text) from public;
grant execute on function public.apply_inbound_webhook(uuid, uuid, public.v2_post_status, text) to anon, authenticated;
