-- 0038: notification emails inside the 15-minute window are HELD and sent when the
-- window closes, instead of being dropped (#145).
--
-- Before: 0036/0037 sent at most one email per recipient, post and kind every 15
-- minutes and logged every later event in the window as 'skipped / batched'. A team
-- walking a post Planned -> In progress -> Shipped within a minute sent only the
-- "Planned" email; the Shipped email, the one people care about most, never went.
--
-- Now:
--   * The first email in a window still goes straight away (unchanged).
--   * A later event in the window is logged as 'held' rather than dropped.
--   * v2_email_flush_held() sends one email per (recipient, post, kind) whose window
--     has closed:
--       - status changes: the LATEST status only ("Shipped"), and nothing at all if
--         the post ended up back on the status that was already emailed;
--       - replies: the latest reply, saying how many more arrived meanwhile.
--     The held rows it covers become 'batched' (detail names the notification that
--     was sent), so email_log still accounts for every event.
--   * Every guard is re-checked at flush time (email channel still on, confirmed
--     address, 20/day cap), so turning emails off in the window is honoured.
--   * Held rows older than 24 hours are marked 'expired' instead of being sent late.
--
-- What runs the flush:
--   1. pg_cron, every 5 minutes, when the extension is available (it is on Supabase,
--      including the free tier; enabling it is part of applying this migration).
--      Where pg_cron is not available (CI, plain Postgres) the schedule is skipped
--      with a NOTICE.
--   2. Belt and braces: every new reply/status notification first flushes whatever
--      is due, so held emails also go out on the next activity even without pg_cron.
--
-- The composing and sending moved into v2_email_send(); the HTML/text are the same
-- as 0037 (cobalt button), apart from the "N more replies" line on a batched reply.
-- Any error is still logged to email_log and swallowed: email must never make a
-- reply or a status change fail.

create index if not exists email_log_held_idx on public.email_log (created_at) where status = 'held';
create index if not exists email_log_notification_idx on public.email_log (notification_id);

-- ---------------------------------------------------------------- compose + send

create or replace function public.v2_email_send(n public.notification, p_to text, p_more int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kind   text := 'v2_notify_' || n.kind::text;
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
  v_more   text := '';
  v_url    text;
  v_unsub  text;
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
    if coalesce(p_more, 0) > 0 then
      v_more := 'Plus ' || p_more || ' more ' || case when p_more = 1 then 'reply' else 'replies' end || ' on this post.';
    end if;
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
            'headers', jsonb_build_object('List-Unsubscribe', '<' || v_unsub || '>'));
  insert into email_log (notification_id, kind, recipient, status, request_id) values (n.id::text, v_kind, p_to, 'queued', v_req);
exception when others then
  begin
    insert into email_log (notification_id, kind, recipient, status, detail)
    values (n.id::text, v_kind, coalesce(p_to, ''), 'error', left(sqlstate || ' ' || sqlerrm, 300));
  exception when others then null;
  end;
end $$;
revoke execute on function public.v2_email_send(public.notification, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- shared guards

-- The address to email for this notification, or null when it must not be emailed
-- (kind not emailed, email channel off, no confirmed address, reserved domain).
create or replace function public.v2_email_recipient(n public.notification)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_to text;
begin
  if n.kind not in ('reply', 'status_change') or n.post_id is null then return null; end if;
  if exists (select 1 from notification_pref
              where user_id = n.recipient and kind = n.kind and channel = 'email' and not enabled) then
    return null;
  end if;
  select u.email into v_to from auth.users u
   where u.id = n.recipient and u.email_confirmed_at is not null and u.deleted_at is null;
  return v_to;
end $$;
revoke execute on function public.v2_email_recipient(public.notification) from public, anon, authenticated;

-- True while a notification email for (recipient, post, kind) went out in the last 15 minutes.
create or replace function public.v2_email_in_window(p_recipient uuid, p_post uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from email_log l join notification m on m.id::text = l.notification_id
                  where l.kind = p_kind and l.status = 'queued' and l.created_at > now() - interval '15 minutes'
                    and m.recipient = p_recipient and m.post_id = p_post);
$$;
revoke execute on function public.v2_email_in_window(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.v2_email_over_cap(p_to text)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from email_log where recipient = p_to and kind like 'v2_notify_%' and status = 'queued'
            and created_at > now() - interval '24 hours') >= 20;
$$;
revoke execute on function public.v2_email_over_cap(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- flush held emails

create or replace function public.v2_email_flush_held()
returns int language plpgsql security definer set search_path = public as $$
declare
  g        record;
  v_n      public.notification;
  v_to     text;
  v_count  int;
  v_last   text;
  v_sent   int := 0;
begin
  update email_log set status = 'expired', detail = 'held over 24 hours; not sent late'
   where status = 'held' and created_at < now() - interval '24 hours';

  for g in
    select m.recipient, m.post_id, l.kind
      from email_log l join notification m on m.id::text = l.notification_id
     where l.status = 'held'
     group by m.recipient, m.post_id, l.kind
  loop
    begin
      continue when public.v2_email_in_window(g.recipient, g.post_id, g.kind);

      -- Lock this group's held rows so two flushes (cron + trigger) never both send it.
      perform 1 from email_log l join notification m on m.id::text = l.notification_id
        where l.status = 'held' and l.kind = g.kind and m.recipient = g.recipient and m.post_id = g.post_id
        for update of l skip locked;
      continue when not found;  -- another flush has it

      select m.* into v_n
        from email_log l join notification m on m.id::text = l.notification_id
       where l.status = 'held' and l.kind = g.kind and m.recipient = g.recipient and m.post_id = g.post_id
       order by m.created_at desc, l.created_at desc limit 1;
      continue when v_n.id is null;

      select count(*) into v_count
        from email_log l join notification m on m.id::text = l.notification_id
       where l.status = 'held' and l.kind = g.kind and m.recipient = g.recipient and m.post_id = g.post_id;

      v_to := public.v2_email_recipient(v_n);
      if v_to is null or v_to ~* '@([a-z0-9-]+\.)*(invalid|test|example|localhost)$' then
        update email_log l set status = 'skipped', detail = 'email off or no address at send time'
          from notification m
         where m.id::text = l.notification_id and l.status = 'held' and l.kind = g.kind
           and m.recipient = g.recipient and m.post_id = g.post_id;
        continue;
      end if;

      if g.kind = 'v2_notify_status_change' then
        -- The status the follower last heard about by email.
        select m.data ->> 'to' into v_last
          from email_log l join notification m on m.id::text = l.notification_id
         where l.status = 'queued' and l.kind = g.kind and m.recipient = g.recipient and m.post_id = g.post_id
         order by l.created_at desc limit 1;
        if v_last is not distinct from (v_n.data ->> 'to') then
          update email_log l set status = 'skipped', detail = 'status back to the one already emailed'
            from notification m
           where m.id::text = l.notification_id and l.status = 'held' and l.kind = g.kind
             and m.recipient = g.recipient and m.post_id = g.post_id;
          continue;
        end if;
      end if;

      if public.v2_email_over_cap(v_to) then
        update email_log l set status = 'skipped', detail = 'daily cap'
          from notification m
         where m.id::text = l.notification_id and l.status = 'held' and l.kind = g.kind
           and m.recipient = g.recipient and m.post_id = g.post_id;
        continue;
      end if;

      update email_log l set status = 'batched', detail = 'sent as one email: notification ' || v_n.id::text
        from notification m
       where m.id::text = l.notification_id and l.status = 'held' and l.kind = g.kind
         and m.recipient = g.recipient and m.post_id = g.post_id;

      perform public.v2_email_send(v_n, v_to, case when g.kind = 'v2_notify_reply' then v_count - 1 else 0 end);
      v_sent := v_sent + 1;
    exception when others then
      begin
        insert into email_log (notification_id, kind, recipient, status, detail)
        values (null, g.kind, '', 'error', left('flush: ' || sqlstate || ' ' || sqlerrm, 300));
      exception when others then null;
      end;
    end;
  end loop;
  return v_sent;
end $$;
revoke execute on function public.v2_email_flush_held() from public, anon, authenticated;

-- ---------------------------------------------------------------- the trigger's entry point

create or replace function public.v2_email_notification(n public.notification)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kind text := 'v2_notify_' || n.kind::text;
  v_to   text;
begin
  -- Send anything whose window has closed first, so held emails go out on the next
  -- activity even where pg_cron is not running.
  begin
    perform public.v2_email_flush_held();
  exception when others then null;
  end;

  v_to := public.v2_email_recipient(n);
  if v_to is null then return; end if;
  if v_to ~* '@([a-z0-9-]+\.)*(invalid|test|example|localhost)$' then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'skipped', 'reserved domain');
    return;
  end if;

  -- Inside the window: hold it; v2_email_flush_held sends the latest one when the window closes.
  if public.v2_email_in_window(n.recipient, n.post_id, v_kind) then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'held', 'within 15 minutes of the last email; sent when the window closes');
    return;
  end if;
  if public.v2_email_over_cap(v_to) then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, v_to, 'skipped', 'daily cap');
    return;
  end if;

  perform public.v2_email_send(n, v_to, 0);
exception when others then
  begin
    insert into email_log (notification_id, kind, recipient, status, detail)
    values (n.id::text, v_kind, coalesce(v_to, ''), 'error', left(sqlstate || ' ' || sqlerrm, 300));
  exception when others then null;
  end;
end $$;
revoke execute on function public.v2_email_notification(public.notification) from public, anon, authenticated;

-- ---------------------------------------------------------------- schedule (pg_cron, when available)

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- cron.schedule(name, ...) replaces a job of the same name, so re-running is safe.
    perform cron.schedule('v2-email-flush-held', '*/5 * * * *', 'select public.v2_email_flush_held()');
  else
    raise notice '0038: pg_cron is not available here; held emails flush on the next notification only';
  end if;
end
$cron$;
