-- 0059: new-message emails for direct messages (DM rollout step 4b).
--
-- One email per conversation per unread streak: when a conversation has had a message
-- from the other person sitting unread for 15 minutes, the recipient gets one email
-- quoting the newest unread message ("Plus N more" when there are several). Nothing
-- more is sent for that conversation until they read it and a new message arrives.
--
-- Not emailed: requests (they never learn you saw them, and a stranger shouldn't be
-- able to land in your inbox AND your email), muted conversations, a person either
-- side has blocked, unconfirmed or reserved-domain addresses, anyone with the new
-- "message" email setting off, anyone over the existing 20-a-day cap, and unread
-- messages older than 24 hours (never send a stale nudge).
--
--   1. v2_notification_kind gains 'message'. Settings' Notifications table shows it,
--      and the existing one-click unsubscribe (enum_range) covers it automatically.
--   2. dm_member.emailed_at: when this person was last emailed about this conversation.
--   3. v2_dm_email_flush(): finds what is due and sends it through Resend exactly as
--      the other notification emails do (pg_net + the Vault key, same footer, same
--      List-Unsubscribe headers). Logged to email_log as kind 'v2_notify_message', so
--      it shares the 20/day cap. Errors are logged and swallowed.
--   4. pg_cron runs it every 5 minutes where pg_cron exists (skipped with a NOTICE in CI).
--
-- No new grants: the flush is not callable by anon or authenticated.
-- Rollback: supabase/rollback/0059_down.sql (the enum value stays; Postgres can't drop one).

alter type public.v2_notification_kind add value if not exists 'message';

alter table public.dm_member add column if not exists emailed_at timestamptz;
comment on column public.dm_member.emailed_at is 'When this member was last emailed about unread messages here (0059).';

create or replace function public.v2_dm_email_flush()
returns int language plpgsql security definer set search_path = public as $$
declare
  r        record;
  v_key    text;
  v_token  uuid;
  v_actor  text;
  v_subject text;
  v_lead   text;
  v_quote  text;
  v_more   text;
  v_url    text;
  v_unsub  text;
  v_one_click text;
  v_text   text;
  v_html   text;
  v_req    bigint;
  v_sent   int := 0;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return 0; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'resend_api_key';
  if v_key is null then return 0; end if;

  for r in
    with due as (
      select m.conversation_id, m.user_id, m.emailed_at,
             min(x.created_at) as first_unread, max(x.created_at) as last_unread, count(*) as n_unread
        from dm_member m
        join dm_message x on x.conversation_id = m.conversation_id
                         and x.sender is distinct from m.user_id
                         and x.created_at > greatest(coalesce(m.last_read_at, '-infinity'), coalesce(m.cleared_at, '-infinity'))
       where m.state = 'inbox' and not m.muted
       group by m.conversation_id, m.user_id, m.emailed_at
    )
    select d.*, u.email as to_addr,
           (select o.user_id from dm_member o where o.conversation_id = d.conversation_id and o.user_id <> d.user_id limit 1) as other_id
      from due d
      join auth.users u on u.id = d.user_id and u.email_confirmed_at is not null and u.deleted_at is null
     where d.first_unread <= now() - interval '15 minutes'
       and d.last_unread  >  now() - interval '24 hours'
       and (d.emailed_at is null or d.emailed_at < d.first_unread)
       and not exists (select 1 from notification_pref p
                        where p.user_id = d.user_id and p.kind = 'message' and p.channel = 'email' and not p.enabled)
     order by d.first_unread
     limit 200
  loop
    begin
      -- Claim the streak first so a failure below never turns into a retry loop.
      update dm_member set emailed_at = now() where conversation_id = r.conversation_id and user_id = r.user_id;

      if r.other_id is null or private.dm_blocked_between(r.user_id, r.other_id) then continue; end if;
      if r.to_addr ~* '@([a-z0-9-]+\.)*(invalid|test|example|localhost)$' then
        insert into email_log (notification_id, kind, recipient, status, detail)
        values (r.conversation_id::text, 'v2_notify_message', r.to_addr, 'skipped', 'reserved domain');
        continue;
      end if;
      if public.v2_email_over_cap(r.to_addr) then
        insert into email_log (notification_id, kind, recipient, status, detail)
        values (r.conversation_id::text, 'v2_notify_message', r.to_addr, 'skipped', 'daily cap');
        continue;
      end if;

      select case when coalesce(btrim(p.name), '') <> '' then btrim(p.name) || ' (@' || p.handle || ')' else '@' || p.handle end
        into v_actor from profile p where p.id = r.other_id;
      v_actor := coalesce(v_actor, 'Someone');

      select body into v_quote from dm_message
       where conversation_id = r.conversation_id and sender = r.other_id
       order by created_at desc limit 1;
      v_quote := v2_clip(v_quote, 600);

      insert into email_token (user_id) values (r.user_id) on conflict (user_id) do nothing;
      select token into v_token from email_token where user_id = r.user_id;

      v_url       := 'https://publisense.app/messages/' || r.conversation_id::text;
      v_unsub     := 'https://publisense.app/unsubscribe?token=' || v_token::text;
      v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text;
      v_subject   := v2_clip(v_actor || ' sent you a message', 120);
      v_lead      := v_actor || ' sent you a message on Publisense:';
      v_more      := case when r.n_unread > 1
                          then 'Plus ' || (r.n_unread - 1) || ' more unread ' || case when r.n_unread = 2 then 'message' else 'messages' end || '.'
                          else '' end;

      v_text := v_lead || E'\n\n'
             || coalesce(v_quote, '') || E'\n\n'
             || case when v_more <> '' then v_more || E'\n\n' else '' end
             || 'Reply: ' || v_url || E'\n\n'
             || '— Publisense' || E'\n\n'
             || 'You get this because of your Publisense notification settings. Turn these emails off: ' || v_unsub;

      v_html := '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">'
             || '<p>' || v2_html(v_lead) || '</p>'
             || '<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ddd;color:#333">' || v2_html(coalesce(v_quote, '')) || '</blockquote>'
             || case when v_more <> '' then '<p style="color:#555">' || v2_html(v_more) || '</p>' else '' end
             || '<p><a href="' || v_url || '" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#0047AB;color:#fff;text-decoration:none">Reply on Publisense</a></p>'
             || '<p style="font-size:12px;color:#777;margin-top:32px">You get this because of your Publisense notification settings. '
             || '<a href="' || v_unsub || '" style="color:#777">Unsubscribe from all emails</a> · '
             || '<a href="https://publisense.app/settings" style="color:#777">Choose which emails</a></p></div>';

      execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 8000)'
        into v_req
        using 'https://api.resend.com/emails',
              jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
              jsonb_build_object(
                'from', 'Publisense <notify@publisense.app>',
                'to', jsonb_build_array(r.to_addr),
                'reply_to', 'support@publisense.app',
                'subject', v_subject,
                'text', v_text,
                'html', v_html,
                'headers', jsonb_build_object(
                  'List-Unsubscribe', '<' || v_one_click || '>',
                  'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
      insert into email_log (notification_id, kind, recipient, status, request_id)
      values (r.conversation_id::text, 'v2_notify_message', r.to_addr, 'queued', v_req);
      v_sent := v_sent + 1;
    exception when others then
      begin
        insert into email_log (notification_id, kind, recipient, status, detail)
        values (r.conversation_id::text, 'v2_notify_message', coalesce(r.to_addr, ''), 'error', left(sqlstate || ' ' || sqlerrm, 300));
      exception when others then null;
      end;
    end;
  end loop;
  return v_sent;
end $$;

revoke execute on function public.v2_dm_email_flush() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('v2-dm-email-flush', '*/5 * * * *', 'select public.v2_dm_email_flush()');
  else
    raise notice '0059: pg_cron is not available here; DM emails are not scheduled';
  end if;
end
$cron$;

notify pgrst, 'reload schema';
