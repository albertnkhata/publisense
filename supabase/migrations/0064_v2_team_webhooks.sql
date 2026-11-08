-- 0064: outbound team webhooks (Slack, Discord, or generic JSON) for claimed boards and hubs.
--
-- Webhook URLs carry channel tokens (hooks.slack.com/services/..., discord.com/api/webhooks/...),
-- so the table lives in `private` and is never exposed through PostgREST table reads.
-- Only owners and admins of the board or hub can read, save, test or delete its webhook
-- through the SECURITY DEFINER RPCs below.

create table if not exists private.scope_webhook (
  scope       public.v2_scope not null,
  scope_id    uuid not null,
  kind        text not null check (kind in ('slack', 'discord', 'generic')),
  url         text not null check (
    url = btrim(url)
    and char_length(url) between 16 and 500
    and url ~* '^https://[a-z0-9-]+(\.[a-z0-9-]+)+/'
  ),
  enabled     boolean not null default true,
  created_by  uuid references public.profile (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (scope, scope_id)
);

revoke all on table private.scope_webhook from public, anon, authenticated;

-- Format and fire a single HTTP POST through pg_net when available. Never raises,
-- so a slow or unconfigured pg_net cannot block a post or status change.
create or replace function private.fire_scope_webhook(
  p_kind    text,
  p_url     text,
  p_event   text,
  p_title   text,
  p_link    text,
  p_summary text,
  p_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_body jsonb;
  v_req  bigint;
begin
  v_body := case p_kind
    when 'slack' then jsonb_build_object(
      'text', p_summary || ' — <' || p_link || '|' || replace(replace(replace(p_title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '>'
    )
    when 'discord' then jsonb_build_object(
      'content', p_summary || ' — [' || p_title || '](' || p_link || ')'
    )
    else jsonb_build_object(
      'event', p_event,
      'summary', p_summary,
      'url', p_link,
      'data', p_payload,
      'sent_at', now()
    )
  end;

  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
    into v_req
    using p_url,
          jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'Publisense-Webhook/1.0'),
          v_body;
  return v_req is not null;
exception when others then
  return false;
end
$$;

revoke all on function private.fire_scope_webhook(text, text, text, text, text, text, jsonb) from public, anon, authenticated;

-- Dispatch an event for a board (and its parent hub, if the hub also configured a webhook).
create or replace function private.dispatch_board_webhooks(
  p_board_id uuid,
  p_event    text,
  p_title    text,
  p_link     text,
  p_summary  text,
  p_payload  jsonb
) returns int
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_hub_id uuid;
  w        record;
  v_sent   int := 0;
begin
  select hub_id into v_hub_id from public.board where id = p_board_id;

  for w in
    select kind, url
      from private.scope_webhook
     where enabled
       and ((scope = 'board'::public.v2_scope and scope_id = p_board_id)
            or (v_hub_id is not null and scope = 'hub'::public.v2_scope and scope_id = v_hub_id))
  loop
    if private.fire_scope_webhook(w.kind, w.url, p_event, p_title, p_link, p_summary, p_payload) then
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end
$$;

revoke all on function private.dispatch_board_webhooks(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- Trigger on new member posts (skip seeded imports that have no author_id).
create or replace function private.v2_post_webhook_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_board_name text;
  v_board_slug text;
  v_type_label text;
  v_link       text;
  v_summary    text;
begin
  if new.author_id is null or new.hidden_at is not null then
    return new;
  end if;

  select name, slug into v_board_name, v_board_slug from public.board where id = new.board_id;
  if v_board_name is null then return new; end if;

  v_type_label := case new.type
    when 'bug' then 'Bug'
    when 'friction' then 'Friction'
    else 'Feature request'
  end;
  v_link := 'https://publisense.app/post/' || new.id::text;
  v_summary := '[' || v_board_name || '] New ' || lower(v_type_label);

  perform private.dispatch_board_webhooks(
    new.board_id,
    'post.created',
    new.title,
    v_link,
    v_summary,
    jsonb_build_object(
      'board_id', new.board_id,
      'board_slug', v_board_slug,
      'board_name', v_board_name,
      'post_id', new.id,
      'type', new.type,
      'status', new.status,
      'title', new.title,
      'body', left(coalesce(new.body, ''), 500)
    )
  );
  return new;
end
$$;

revoke all on function private.v2_post_webhook_after_insert() from public, anon, authenticated;

drop trigger if exists v2_post_webhook_after_insert on public.post;
create trigger v2_post_webhook_after_insert
after insert on public.post
for each row execute function private.v2_post_webhook_after_insert();

-- Trigger on post status transitions.
create or replace function private.v2_status_webhook_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_post       record;
  v_board_name text;
  v_board_slug text;
  v_status_lbl text;
  v_link       text;
  v_summary    text;
begin
  select id, board_id, title, type, vote_count, hidden_at
    into v_post
    from public.post
   where id = new.post_id;
  if not found or v_post.hidden_at is not null then
    return new;
  end if;

  select name, slug into v_board_name, v_board_slug from public.board where id = v_post.board_id;
  if v_board_name is null then return new; end if;

  v_status_lbl := case new."to"
    when 'under_review' then 'Under review'
    when 'planned' then 'Planned'
    when 'in_progress' then 'In progress'
    when 'shipped' then 'Shipped'
    when 'closed' then 'Closed'
    when 'merged' then 'Merged'
    else 'Open'
  end;
  v_link := 'https://publisense.app/post/' || v_post.id::text;
  v_summary := '[' || v_board_name || '] Marked ' || v_status_lbl;

  perform private.dispatch_board_webhooks(
    v_post.board_id,
    'post.status_changed',
    v_post.title,
    v_link,
    v_summary,
    jsonb_build_object(
      'board_id', v_post.board_id,
      'board_slug', v_board_slug,
      'board_name', v_board_name,
      'post_id', v_post.id,
      'title', v_post.title,
      'from', new."from",
      'to', new."to",
      'note', new.note,
      'vote_count', v_post.vote_count
    )
  );
  return new;
end
$$;

revoke all on function private.v2_status_webhook_after_insert() from public, anon, authenticated;

drop trigger if exists v2_status_webhook_after_insert on public.status_event;
create trigger v2_status_webhook_after_insert
after insert on public.status_event
for each row execute function private.v2_status_webhook_after_insert();

-- ------------------------------------------------------------------ Team Admin RPCs

create or replace function public.get_scope_webhook(p_scope public.v2_scope, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_caller uuid := auth.uid();
  w        private.scope_webhook;
begin
  if v_caller is null then return public.v2_err('sign_in'); end if;
  if p_scope is null or p_scope_id is null then return public.v2_err('not_found'); end if;
  if not coalesce(private.is_scope_admin(p_scope, p_scope_id, v_caller), false) then
    return public.v2_err('not_allowed');
  end if;

  select * into w from private.scope_webhook where scope = p_scope and scope_id = p_scope_id;
  if not found then
    return jsonb_build_object('ok', true, 'webhook', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'webhook', jsonb_build_object(
      'kind', w.kind,
      'url', w.url,
      'enabled', w.enabled,
      'updated_at', w.updated_at
    )
  );
end
$$;

revoke all on function public.get_scope_webhook(public.v2_scope, uuid) from public, anon;
grant execute on function public.get_scope_webhook(public.v2_scope, uuid) to authenticated;

create or replace function public.set_scope_webhook(
  p_scope    public.v2_scope,
  p_scope_id uuid,
  p_kind     text,
  p_url      text,
  p_enabled  boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_caller uuid := auth.uid();
  v_kind   text := lower(btrim(coalesce(p_kind, '')));
  v_url    text := btrim(coalesce(p_url, ''));
  w        private.scope_webhook;
begin
  if v_caller is null then return public.v2_err('sign_in'); end if;
  if p_scope is null or p_scope_id is null then return public.v2_err('not_found'); end if;
  if not coalesce(private.is_scope_admin(p_scope, p_scope_id, v_caller), false) then
    return public.v2_err('not_allowed');
  end if;
  if v_kind not in ('slack', 'discord', 'generic') then
    return public.v2_err('invalid_webhook_kind');
  end if;
  if char_length(v_url) < 16 or char_length(v_url) > 500 or v_url !~* '^https://[a-z0-9-]+(\.[a-z0-9-]+)+/' then
    return public.v2_err('invalid_webhook_url');
  end if;
  if v_url ~* '^https://(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)' then
    return public.v2_err('invalid_webhook_url');
  end if;

  insert into private.scope_webhook (scope, scope_id, kind, url, enabled, created_by, updated_at)
  values (p_scope, p_scope_id, v_kind, v_url, coalesce(p_enabled, true), v_caller, now())
  on conflict (scope, scope_id) do update
    set kind       = excluded.kind,
        url        = excluded.url,
        enabled    = excluded.enabled,
        updated_at = now()
  returning * into w;

  return jsonb_build_object(
    'ok', true,
    'webhook', jsonb_build_object(
      'kind', w.kind,
      'url', w.url,
      'enabled', w.enabled,
      'updated_at', w.updated_at
    )
  );
end
$$;

revoke all on function public.set_scope_webhook(public.v2_scope, uuid, text, text, boolean) from public, anon;
grant execute on function public.set_scope_webhook(public.v2_scope, uuid, text, text, boolean) to authenticated;

create or replace function public.delete_scope_webhook(p_scope public.v2_scope, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then return public.v2_err('sign_in'); end if;
  if p_scope is null or p_scope_id is null then return public.v2_err('not_found'); end if;
  if not coalesce(private.is_scope_admin(p_scope, p_scope_id, v_caller), false) then
    return public.v2_err('not_allowed');
  end if;

  delete from private.scope_webhook where scope = p_scope and scope_id = p_scope_id;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.delete_scope_webhook(public.v2_scope, uuid) from public, anon;
grant execute on function public.delete_scope_webhook(public.v2_scope, uuid) to authenticated;

create or replace function public.test_scope_webhook(p_scope public.v2_scope, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_caller uuid := auth.uid();
  w        private.scope_webhook;
  v_name   text;
  v_slug   text;
  v_link   text;
  v_sent   boolean;
begin
  if v_caller is null then return public.v2_err('sign_in'); end if;
  if p_scope is null or p_scope_id is null then return public.v2_err('not_found'); end if;
  if not coalesce(private.is_scope_admin(p_scope, p_scope_id, v_caller), false) then
    return public.v2_err('not_allowed');
  end if;

  select * into w from private.scope_webhook where scope = p_scope and scope_id = p_scope_id;
  if not found then return public.v2_err('not_found'); end if;

  if p_scope = 'board'::public.v2_scope then
    select name, slug into v_name, v_slug from public.board where id = p_scope_id;
    v_link := 'https://publisense.app/b/' || coalesce(v_slug, '');
  else
    select name, slug into v_name, v_slug from public.hub where id = p_scope_id;
    v_link := 'https://publisense.app/h/' || coalesce(v_slug, '');
  end if;

  v_sent := private.fire_scope_webhook(
    w.kind,
    w.url,
    'webhook.test',
    coalesce(v_name, 'Publisense'),
    v_link,
    '[' || coalesce(v_name, 'Publisense') || '] Webhook connected',
    jsonb_build_object('scope', p_scope, 'scope_id', p_scope_id, 'name', v_name)
  );

  return jsonb_build_object('ok', true, 'queued', v_sent);
end
$$;

revoke all on function public.test_scope_webhook(public.v2_scope, uuid) from public, anon;
grant execute on function public.test_scope_webhook(public.v2_scope, uuid) to authenticated;
