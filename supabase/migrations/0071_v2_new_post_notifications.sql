-- 0071: maintainer in-app and email notifications for new posts on claimed boards.
--
-- What this changes:
--   1. v2_notification_kind gains 'new_post' (opt-out via notification_pref, and covered
--      automatically by one-click unsubscribe via enum_range).
--   2. v2_post_after(): when a member inserts a visible, non-seeded post on an approved
--      ('live') board, notify every distinct member of that board or its parent hub via
--      v2_notify(..., 'new_post', ...). Seeded posts (author_id is null or source_url is
--      not null), hidden posts, merged posts, non-live boards, and self-authored posts
--      are skipped.
--   3. Email pipeline:
--      - v2_notification_email trigger fires for 'new_post' (and 'mention', which 0050
--        added to v2_email_recipient / v2_email_send). Uses new.kind::text in the WHEN
--        clause so this migration runs cleanly inside --single-transaction (migrate.yml).
--      - v2_email_recipient() allows 'new_post' (still enforcing notification_pref email
--        opt-out and confirmed non-deleted auth.users email; v2_email_notification still
--        enforces reserved-domain skip and the 20/day cap).
--      - v2_email_send() formats the 'new_post' subject, lead, body quote, and /post/:id
--        link with one-click unsubscribe headers.
--
-- Rollback: supabase/rollback/0071_down.sql (the enum value stays; Postgres can't drop one).

alter type public.v2_notification_kind add value if not exists 'new_post';

create or replace function public.v2_post_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  u uuid;
begin
  if tg_op = 'INSERT' then
    update board set post_count = post_count + 1 where id = new.board_id;
    if new.author_id is not null then
      insert into follow (user_id, target, target_id) values (new.author_id, 'post', new.id)
        on conflict do nothing;
    end if;

    -- 0071: notify board and parent-hub team members about new member posts on live boards.
    -- Skip seeded posts, hidden/merged posts, pending/rejected boards, and self-authored posts.
    if new.author_id is not null
       and new.source_url is null
       and new.hidden_at is null
       and new.status <> 'merged' then
      for u in
        select distinct m.user_id
          from membership m
          join board b on b.id = new.board_id
         where b.status = 'live'
           and m.user_id is distinct from new.author_id
           and ((m.scope = 'board' and m.scope_id = b.id)
                or (m.scope = 'hub' and b.hub_id is not null and m.scope_id = b.hub_id))
      loop
        perform v2_notify(u, 'new_post', new.author_id, 'post', new.id, new.id);
      end loop;
    end if;

    return new;
  else
    update board set post_count = greatest(post_count - 1, 0) where id = old.board_id;
    delete from follow where target = 'post' and target_id = old.id;
    delete from notification where target_type = 'post' and target_id = old.id;
    return old;
  end if;
end $function$;

create or replace function public.v2_email_recipient(n public.notification)
returns text
language plpgsql
stable
security definer
set search_path = public
as $function$
declare v_to text;
begin
  -- reply / mention / status_change / new_post are about a post; product (0046) is about the board someone added.
  if not ((n.kind in ('reply', 'mention', 'status_change', 'new_post') and n.post_id is not null)
          or (n.kind = 'product' and n.target_type = 'board' and n.target_id is not null)) then
    return null;
  end if;
  if exists (select 1 from notification_pref
              where user_id = n.recipient and kind = n.kind and channel = 'email' and not enabled) then
    return null;
  end if;
  select u.email into v_to from auth.users u
   where u.id = n.recipient and u.email_confirmed_at is not null and u.deleted_at is null;
  return v_to;
end $function$;

create or replace function public.v2_email_send(n public.notification, p_to text, p_more integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_kind   text := 'v2_notify_' || n.kind::text;
  v_key    text;
  v_req    bigint;
  v_token  uuid;
  v_post   record;
  v_board  record;
  v_actor  text;
  v_official boolean := false;
  v_body   text;
  v_note   text;
  v_status text;
  v_subject text;
  v_lead   text;
  v_quote  text;
  v_more   text := '';
  v_url    text;
  v_unsub  text;
  v_one_click text;
  v_text   text;
  v_html   text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, p_to, 'no_transport', 'pg_net or vault missing');
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'resend_api_key';
  if v_key is null then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, p_to, 'no_secret', 'resend_api_key missing from vault');
    return;
  end if;

  if n.kind = 'product' then
    select b.id, b.name, b.slug into v_board from board b where b.id = n.target_id;
    if v_board.id is null then return; end if;
  else
    select p.id, p.title, p.body, p.author_id, b.name as board into v_post from post p join board b on b.id = p.board_id where p.id = n.post_id;
    if v_post.id is null then return; end if;
  end if;
  select coalesce(nullif(btrim(name), ''), '@' || handle, 'Someone') into v_actor from profile where id = n.actor;
  v_actor := coalesce(v_actor, 'Someone');

  insert into email_token (user_id) values (n.recipient) on conflict (user_id) do nothing;
  select token into v_token from email_token where user_id = n.recipient;

  -- (if/else, not CASE: a record's fields can't be referenced before it is assigned)
  if n.kind = 'product' then
    v_url := 'https://publisense.app/b/' || v_board.slug;
  elsif n.kind in ('reply', 'mention') and n.target_type = 'reply' then
    -- 0050: open the post at the reply itself (the post page scrolls to and highlights it).
    v_url := 'https://publisense.app/post/' || n.post_id::text || '#reply-' || n.target_id::text;
  else
    v_url := 'https://publisense.app/post/' || n.post_id::text;
  end if;
  v_unsub := 'https://publisense.app/unsubscribe?token=' || v_token::text;
  v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text;

  if n.kind = 'product' then
    -- 0046: the person who added a product hears the decision; a rejection carries its reason.
    if n.data ->> 'status' = 'approved' then
      v_quote   := v2_clip(n.data ->> 'note', 600);
      v_subject := v2_clip(v_board.name || ' is live on Publisense', 120);
      v_lead    := v_board.name || ', the product you added, was approved and is now live on Publisense.'
                || case when coalesce(v_quote, '') <> '' then ' A note from the team:' else '' end;
    else
      v_quote   := v2_clip(n.data ->> 'reason', 600);
      v_subject := v2_clip(v_board.name || ' wasn’t approved', 120);
      v_lead    := v_board.name || ', the product you added, wasn’t approved for Publisense.'
                || case when coalesce(v_quote, '') <> '' then ' The reason from the team:' else '' end;
    end if;
  elsif n.kind = 'reply' then
    select body, is_official into v_body, v_official from reply where id = n.target_id;
    -- 0048: an official reply speaks as the board, never as the teammate who wrote it.
    if coalesce(v_official, false) then
      v_actor := v_post.board || ' · Team';
    end if;
    v_subject := v2_clip(v_actor || ' replied: ' || v_post.title, 120);
    -- 0050: only the post's author is told it was their post; anyone else was replied to.
    if v_post.author_id is not distinct from n.recipient then
      v_lead  := v_actor || ' replied to your post “' || v2_clip(v_post.title, 100) || '” on ' || v_post.board || ':';
    elsif coalesce((n.data ->> 'team')::boolean, false) then
      v_lead  := v_actor || ' replied to your team on “' || v2_clip(v_post.title, 100) || '” on ' || v_post.board || ':';
    else
      v_lead  := v_actor || ' replied to you on “' || v2_clip(v_post.title, 100) || '” on ' || v_post.board || ':';
    end if;
    v_quote   := v2_clip(v_body, 600);
    if coalesce(p_more, 0) > 0 then
      v_more := 'Plus ' || p_more || ' more ' || case when p_more = 1 then 'reply' else 'replies' end || ' on this post.';
    end if;
  elsif n.kind = 'mention' then
    -- 0050: someone @mentioned the recipient (or their board's team) in a reply.
    select body, is_official into v_body, v_official from reply where id = n.target_id;
    if coalesce(v_official, false) then
      v_actor := v_post.board || ' · Team';
    end if;
    v_subject := v2_clip(v_actor || ' mentioned you: ' || v_post.title, 120);
    v_lead    := v_actor || ' mentioned '
              || case when coalesce((n.data ->> 'team')::boolean, false) then 'your team' else 'you' end
              || ' in a reply on “' || v2_clip(v_post.title, 100) || '” on ' || v_post.board || ':';
    v_quote   := v2_clip(v_body, 600);
  elsif n.kind = 'new_post' then
    -- 0071: a member posted new feedback on a board the recipient's team manages.
    v_subject := v2_clip('New post on ' || v_post.board || ': ' || v_post.title, 120);
    v_lead    := v_actor || ' posted “' || v2_clip(v_post.title, 100) || '” on ' || v_post.board
              || case when coalesce(btrim(v_post.body), '') <> '' then ':' else '.' end;
    v_quote   := v2_clip(v_post.body, 600);
  else
    v_status := replace(coalesce(n.data ->> 'to', ''), '_', ' ');
    v_status := upper(left(v_status, 1)) || substr(v_status, 2);
    select note into v_note from status_event where post_id = n.post_id order by at desc limit 1;
    v_subject := v2_clip(v_status || ': ' || v_post.title, 120);
    v_lead    := v_post.board || ' · Team marked “' || v2_clip(v_post.title, 100) || '” as ' || lower(v_status) || '.';
    v_quote   := v2_clip(v_note, 600);
  end if;

  v_text := v_lead || E'\n\n'
         || case when coalesce(v_quote, '') <> '' then v_quote || E'\n\n' else '' end
         || case when v_more <> '' then v_more || E'\n\n' else '' end
         || 'View it: ' || v_url || E'\n\n'
         || '— Publisense' || E'\n\n'
         || 'You get this because of your Publisense notification settings. Turn these emails off: ' || v_unsub;

  v_html := '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">'
         || '<p>' || v2_html(v_lead) || '</p>'
         || case when coalesce(v_quote, '') <> ''
                 then '<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ddd;color:#333">' || v2_html(v_quote) || '</blockquote>'
                 else '' end
         || case when v_more <> '' then '<p style="color:#555">' || v2_html(v_more) || '</p>' else '' end
         || '<p><a href="' || v_url || '" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#0047AB;color:#fff;text-decoration:none">View on Publisense</a></p>'
         || '<p style="font-size:12px;color:#777;margin-top:32px">You get this because of your Publisense notification settings. '
         || '<a href="' || v_unsub || '" style="color:#777">Unsubscribe from all emails</a> · '
         || '<a href="https://publisense.app/settings" style="color:#777">Choose which emails</a></p></div>';

  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 8000)'
    into v_req
    using 'https://api.resend.com/emails',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          jsonb_build_object(
            'from', 'Publisense <notify@publisense.app>',
            'to', jsonb_build_array(p_to),
            'reply_to', 'support@publisense.app',
            'subject', v_subject,
            'text', v_text,
            'html', v_html,
            'headers', jsonb_build_object(
              'List-Unsubscribe', '<' || v_one_click || '>',
              'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  insert into email_log (notification_id, kind, recipient, status, request_id) values (n.id::text, v_kind, p_to, 'queued', v_req);
exception when others then
  begin
    insert into email_log (notification_id, kind, recipient, status, detail)
    values (n.id::text, v_kind, coalesce(p_to, ''), 'error', left(sqlstate || ' ' || sqlerrm, 300));
  exception when others then null;
  end;
end $function$;

drop trigger if exists v2_notification_email on public.notification;
create trigger v2_notification_email
  after insert on public.notification
  for each row when (new.kind::text in ('reply', 'mention', 'status_change', 'product', 'new_post'))
  execute function public.v2_notification_email_after();

revoke execute on function public.v2_post_after() from public, anon, authenticated;
revoke execute on function public.v2_email_recipient(public.notification) from public, anon, authenticated;
revoke execute on function public.v2_email_send(public.notification, text, int) from public, anon, authenticated;
