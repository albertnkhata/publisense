-- 0037: the "View on Publisense" button in notification emails uses the brand
-- cobalt (#0047AB, --brand in theme.css) instead of near-black. Same function as
-- 0036 otherwise.

create or replace function public.v2_email_notification(n public.notification)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kind   text := 'v2_notify_' || n.kind::text;
  v_to     text;
  v_key    text;
  v_req    bigint;
  v_token  uuid;
  v_post   record;
  v_actor  text;
  v_body   text;
  v_note   text;
  v_status text;
  v_subject text;
  v_lead   text;
  v_quote  text;
  v_url    text;
  v_unsub  text;
  v_text   text;
  v_html   text;
begin
  if n.kind not in ('reply', 'status_change') or n.post_id is null then return; end if;

  if exists (select 1 from notification_pref
              where user_id = n.recipient and kind = n.kind and channel = 'email' and not enabled) then
    return;
  end if;

  select u.email into v_to from auth.users u
   where u.id = n.recipient and u.email_confirmed_at is not null and u.deleted_at is null;
  if v_to is null then return; end if;
  if v_to ~* '@([a-z0-9-]+\.)*(invalid|test|example|localhost)$' then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'skipped', 'reserved domain');
    return;
  end if;

  -- One email per thread burst, and a daily ceiling.
  if exists (select 1 from email_log l join notification m on m.id::text = l.notification_id
              where l.kind = v_kind and l.status = 'queued' and l.created_at > now() - interval '15 minutes'
                and m.recipient = n.recipient and m.post_id = n.post_id) then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'skipped', 'batched');
    return;
  end if;
  if (select count(*) from email_log where recipient = v_to and kind like 'v2_notify_%' and status = 'queued'
        and created_at > now() - interval '24 hours') >= 20 then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'skipped', 'daily cap');
    return;
  end if;

  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'no_transport', 'pg_net or vault missing');
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'resend_api_key';
  if v_key is null then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'no_secret', 'resend_api_key missing from vault');
    return;
  end if;

  select p.id, p.title, b.name as board into v_post from post p join board b on b.id = p.board_id where p.id = n.post_id;
  if v_post.id is null then return; end if;
  select coalesce(nullif(btrim(name), ''), '@' || handle, 'Someone') into v_actor from profile where id = n.actor;
  v_actor := coalesce(v_actor, 'Someone');

  insert into email_token (user_id) values (n.recipient) on conflict (user_id) do nothing;
  select token into v_token from email_token where user_id = n.recipient;

  v_url   := 'https://publisense.app/post/' || n.post_id::text;
  v_unsub := 'https://publisense.app/unsubscribe?token=' || v_token::text;

  if n.kind = 'reply' then
    select body into v_body from reply where id = n.target_id;
    v_subject := v2_clip(v_actor || ' replied: ' || v_post.title, 120);
    v_lead    := v_actor || ' replied to your post “' || v2_clip(v_post.title, 100) || '” on ' || v_post.board || ':';
    v_quote   := v2_clip(v_body, 600);
  else
    v_status := replace(coalesce(n.data ->> 'to', ''), '_', ' ');
    v_status := upper(left(v_status, 1)) || substr(v_status, 2);
    select note into v_note from status_event where post_id = n.post_id order by at desc limit 1;
    v_subject := v2_clip(v_status || ': ' || v_post.title, 120);
    v_lead    := 'The ' || v_post.board || ' team marked “' || v2_clip(v_post.title, 100) || '” as ' || lower(v_status) || '.';
    v_quote   := v2_clip(v_note, 600);
  end if;

  v_text := v_lead || E'\n\n'
         || case when coalesce(v_quote, '') <> '' then v_quote || E'\n\n' else '' end
         || 'View it: ' || v_url || E'\n\n'
         || '— Publisense' || E'\n\n'
         || 'You get this because of your Publisense notification settings. Turn these emails off: ' || v_unsub;

  v_html := '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">'
         || '<p>' || v2_html(v_lead) || '</p>'
         || case when coalesce(v_quote, '') <> ''
                 then '<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ddd;color:#333">' || v2_html(v_quote) || '</blockquote>'
                 else '' end
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
            'to', jsonb_build_array(v_to),
            'reply_to', 'support@publisense.app',
            'subject', v_subject,
            'text', v_text,
            'html', v_html,
            'headers', jsonb_build_object('List-Unsubscribe', '<' || v_unsub || '>'));
  insert into email_log (notification_id, kind, recipient, status, request_id) values (n.id::text, v_kind, v_to, 'queued', v_req);
exception when others then
  begin
    insert into email_log (notification_id, kind, recipient, status, detail)
    values (n.id::text, v_kind, coalesce(v_to, ''), 'error', left(sqlstate || ' ' || sqlerrm, 300));
  exception when others then null;
  end;
end $$;
revoke execute on function public.v2_email_notification(public.notification) from public, anon, authenticated;
