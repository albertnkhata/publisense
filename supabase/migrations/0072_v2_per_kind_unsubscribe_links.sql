-- 0072: per-category email unsubscribe links (Appendix A check 7.3).
--
-- public.unsubscribe(p_token uuid, p_kind v2_notification_kind default null) (0017)
-- already supports disabling a single email category when p_kind is passed, leaving
-- other email categories and all in-app notifications enabled. Previously every email
-- omitted `&kind=`, so clicking "Turn these emails off" disabled all email kinds.
--
-- This migration updates:
--   1. v2_email_send(): appends `&kind=<n.kind>` to both the footer /unsubscribe link
--      and the RFC 8058 List-Unsubscribe /api/unsubscribe header, and labels the HTML
--      footer link "Turn these emails off".
--   2. v2_dm_email_flush(): appends `&kind=message` and labels the footer link
--      "Turn these emails off".
--   3. v2_weekly_digest_send(): appends `&kind=weekly_digest` to both the one-click
--      header and the "Turn off the weekly digest" link, while keeping a settings link.
--
-- Rollback: supabase/rollback/0072_down.sql.

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
  v_unsub := 'https://publisense.app/unsubscribe?token=' || v_token::text || '&kind=' || n.kind::text;
  v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text || '&kind=' || n.kind::text;

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
         || '<a href="' || v_unsub || '" style="color:#777">Turn these emails off</a> · '
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

create or replace function public.v2_dm_email_flush()
returns int
language plpgsql
security definer
set search_path = public
as $function$
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
      v_unsub     := 'https://publisense.app/unsubscribe?token=' || v_token::text || '&kind=message';
      v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text || '&kind=message';
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
             || '<a href="' || v_unsub || '" style="color:#777">Turn these emails off</a> · '
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
end $function$;

create or replace function public.v2_weekly_digest_send(p_now timestamptz default now(), p_limit int default 100)
returns int
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_kind   constant text := 'v2_weekly_digest';
  v_week   text := to_char(p_now at time zone 'UTC', 'IYYY-"W"IW');
  v_since  timestamptz := p_now - interval '7 days';
  r        record;
  i        record;
  v_key    text;
  v_id     text;
  v_token  uuid;
  v_new    int;
  v_moved  int;
  v_rising int;
  v_moved_j  jsonb;
  v_rising_j jsonb;
  v_all_shipped boolean;
  v_subject text;
  v_tag    text;
  v_url    text;
  v_unsub  text;
  v_one_click text;
  v_settings constant text := 'https://publisense.app/settings#notifications';
  v_text_moved  text;
  v_html_moved  text;
  v_text_rising text;
  v_html_rising text;
  v_text   text;
  v_html   text;
  v_req    bigint;
  v_sent   int := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('v2_weekly_digest_send')) then return 0; end if;
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return 0; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'resend_api_key';
  if v_key is null then return 0; end if;

  for r in
    select u.id as user_id, u.email as to_addr
      from auth.users u
     where u.email_confirmed_at is not null and u.deleted_at is null and coalesce(u.email, '') <> ''
       and exists (select 1 from follow f join board b on b.id = f.target_id and b.status = 'live'
                    where f.user_id = u.id and f.target = 'board')
       and not exists (select 1 from notification_pref p
                        where p.user_id = u.id and p.kind = 'weekly_digest' and p.channel = 'email' and not p.enabled)
       and not exists (select 1 from email_log l
                        where l.kind = v_kind and l.notification_id = u.id::text || ':' || v_week and l.status <> 'error')
     order by u.id
     limit greatest(coalesce(p_limit, 100), 0)
  loop
    v_id := r.user_id::text || ':' || v_week;
    begin
      -- What moved: the newest status move per post in the window, still current.
      select coalesce(jsonb_agg(to_jsonb(m) order by m.shipped desc, m.at desc), '[]'::jsonb) into v_moved_j
        from (
          select x.post_id, x.title, x.board, x.to_status as status, x.upvoted, x.at, (x.to_status = 'shipped') as shipped
            from (
              select distinct on (p.id) p.id as post_id, p.title, b.name as board, e."to"::text as to_status, e.at,
                     exists (select 1 from vote v where v.post_id = p.id and v.user_id = r.user_id) as upvoted,
                     exists (select 1 from follow f where f.user_id = r.user_id and f.target = 'board' and f.target_id = p.board_id) as followed
                from status_event e
                join post p  on p.id = e.post_id
                join board b on b.id = p.board_id
               where e.at > v_since and e.at <= p_now
                 and b.status = 'live' and p.hidden_at is null and p.merged_into is null and p.status <> 'merged'
                 and (exists (select 1 from follow f where f.user_id = r.user_id and f.target = 'board' and f.target_id = p.board_id)
                   or exists (select 1 from vote v where v.post_id = p.id and v.user_id = r.user_id))
               order by p.id, e.at desc
            ) x
            join post p on p.id = x.post_id and p.status::text = x.to_status
           where (x.followed and x.to_status = 'shipped')
              or (x.upvoted and x.to_status in ('shipped', 'planned', 'in_progress'))
           order by (x.to_status = 'shipped') desc, x.at desc
           limit 10
        ) m;

      -- Rising: the top 5 new posts on followed boards, not already listed above.
      select coalesce(jsonb_agg(to_jsonb(t) order by t.vote_count desc, t.reply_count desc, t.created_at desc), '[]'::jsonb) into v_rising_j
        from (
          select p.id as post_id, p.title, b.name as board, p.vote_count, p.reply_count, p.created_at
            from post p
            join board b on b.id = p.board_id and b.status = 'live'
            join follow f on f.user_id = r.user_id and f.target = 'board' and f.target_id = p.board_id
           where p.created_at > v_since and p.created_at <= p_now
             and p.hidden_at is null and p.merged_into is null and p.status <> 'merged'
             and not exists (select 1 from jsonb_array_elements(v_moved_j) e where (e ->> 'post_id')::uuid = p.id)
           order by p.vote_count desc, p.reply_count desc, p.created_at desc
           limit 5
        ) t;

      v_moved  := jsonb_array_length(v_moved_j);
      v_rising := jsonb_array_length(v_rising_j);
      if v_moved = 0 and v_rising = 0 then continue; end if;   -- never send an empty digest

      if r.to_addr ~* '@([a-z0-9-]+\.)*(invalid|test|example|localhost)$' then
        insert into email_log (notification_id, kind, recipient, status, detail) values (v_id, v_kind, r.to_addr, 'skipped', 'reserved domain');
        continue;
      end if;
      if public.v2_email_over_cap(r.to_addr) then
        insert into email_log (notification_id, kind, recipient, status, detail) values (v_id, v_kind, r.to_addr, 'skipped', 'daily cap');
        continue;
      end if;

      select count(*) into v_new
        from post p
        join board b on b.id = p.board_id and b.status = 'live'
        join follow f on f.user_id = r.user_id and f.target = 'board' and f.target_id = p.board_id
       where p.created_at > v_since and p.created_at <= p_now
         and p.hidden_at is null and p.merged_into is null and p.status <> 'merged';
      select bool_and((e ->> 'shipped')::boolean) into v_all_shipped from jsonb_array_elements(v_moved_j) e;

      v_subject := v2_clip('Your week on Publisense: ' || case
                     when v_new > 0 then v_new || ' new ' || case when v_new = 1 then 'post' else 'posts' end
                     when coalesce(v_all_shipped, false) then v_moved || ' ' || case when v_moved = 1 then 'post' else 'posts' end || ' shipped'
                     else v_moved || ' ' || case when v_moved = 1 then 'update' else 'updates' end
                   end, 120);

      insert into email_token (user_id) values (r.user_id) on conflict (user_id) do nothing;
      select token into v_token from email_token where user_id = r.user_id;
      v_unsub     := 'https://publisense.app/unsubscribe?token=' || v_token::text || '&kind=weekly_digest';
      v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text || '&kind=weekly_digest';

      v_text_moved := ''; v_html_moved := '';
      for i in select e ->> 'post_id' as post_id, e ->> 'title' as title, e ->> 'board' as board, e ->> 'status' as status,
                      (e ->> 'upvoted')::boolean as upvoted
                 from jsonb_array_elements(v_moved_j) with ordinality as a(e, n) order by n loop
        v_url := 'https://publisense.app/post/' || i.post_id;
        v_tag := upper(left(replace(i.status, '_', ' '), 1)) || substr(replace(i.status, '_', ' '), 2)
              || ' · ' || i.board || case when i.upvoted then ' · a post you upvoted' else '' end;
        v_text_moved := v_text_moved || '- ' || v2_clip(i.title, 140) || ' (' || v_tag || ')' || E'\n  ' || v_url || E'\n';
        v_html_moved := v_html_moved
          || '<tr><td style="padding:12px 16px;border-top:1px solid #E5E7EB">'
          || '<a href="' || v_url || '" style="color:#111;font-weight:600;text-decoration:none">' || v2_html(v2_clip(i.title, 140)) || '</a>'
          || '<div style="font-size:13px;color:#6B7280;margin-top:2px">' || v2_html(v_tag) || '</div></td></tr>';
      end loop;

      v_text_rising := ''; v_html_rising := '';
      for i in select e ->> 'post_id' as post_id, e ->> 'title' as title, e ->> 'board' as board,
                      (e ->> 'vote_count')::int as vote_count, (e ->> 'reply_count')::int as reply_count
                 from jsonb_array_elements(v_rising_j) with ordinality as a(e, n) order by n loop
        v_url := 'https://publisense.app/post/' || i.post_id;
        v_tag := i.board || ' · ' || i.vote_count || ' ' || case when i.vote_count = 1 then 'upvote' else 'upvotes' end
              || ' · ' || i.reply_count || ' ' || case when i.reply_count = 1 then 'reply' else 'replies' end;
        v_text_rising := v_text_rising || '- ' || v2_clip(i.title, 140) || ' (' || v_tag || ')' || E'\n  ' || v_url || E'\n';
        v_html_rising := v_html_rising
          || '<tr><td style="padding:12px 16px;border-top:1px solid #E5E7EB">'
          || '<a href="' || v_url || '" style="color:#111;font-weight:600;text-decoration:none">' || v2_html(v2_clip(i.title, 140)) || '</a>'
          || '<div style="font-size:13px;color:#6B7280;margin-top:2px">' || v2_html(v_tag) || '</div></td></tr>';
      end loop;

      v_text := 'Here is your week on the boards you follow.' || E'\n\n'
             || case when v_moved > 0 then 'SHIPPED THIS WEEK' || E'\n' || v_text_moved || E'\n' else '' end
             || case when v_rising > 0 then 'RISING ON YOUR BOARDS' || E'\n' || v_text_rising || E'\n' else '' end
             || '— Publisense' || E'\n\n'
             || 'You get this weekly because you follow boards on Publisense. '
             || 'Turn off the weekly digest: ' || v_unsub || E'\n'
             || 'Choose which emails: ' || v_settings;

      v_html := '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px;background:#fff">'
             || '<p>Here is your week on the boards you follow.</p>'
             || case when v_moved > 0 then
                  '<h2 style="font-size:16px;margin:24px 0 8px">Shipped this week</h2>'
                  || '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-top:0;border-radius:6px">'
                  || v_html_moved || '</table>'
                else '' end
             || case when v_rising > 0 then
                  '<h2 style="font-size:16px;margin:24px 0 8px">Rising on your boards</h2>'
                  || '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-top:0;border-radius:6px">'
                  || v_html_rising || '</table>'
                else '' end
             || '<p style="margin-top:24px"><a href="https://publisense.app/" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#0047AB;color:#fff;text-decoration:none">Open Publisense</a></p>'
             || '<p style="font-size:12px;color:#777;margin-top:32px">You get this weekly because you follow boards on Publisense. '
             || '<a href="' || v_unsub || '" style="color:#777">Turn off the weekly digest</a> · '
             || '<a href="' || v_settings || '" style="color:#777">Choose which emails</a></p></div>';

      -- Claim the week first: a second 'queued' row for it violates the unique index,
      -- which rolls this person's block back, pg_net request included.
      insert into email_log (notification_id, kind, recipient, status) values (v_id, v_kind, r.to_addr, 'queued');
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
      update email_log set request_id = v_req
       where kind = v_kind and notification_id = v_id and status = 'queued';
      v_sent := v_sent + 1;
    exception when others then
      begin
        insert into email_log (notification_id, kind, recipient, status, detail)
        values (v_id, v_kind, coalesce(r.to_addr, ''), 'error', left(sqlstate || ' ' || sqlerrm, 300));
      exception when others then null;
      end;
    end;
  end loop;
  return v_sent;
end $function$;

revoke execute on function public.v2_email_send(public.notification, text, int) from public, anon, authenticated;
revoke execute on function public.v2_dm_email_flush() from public, anon, authenticated;
revoke execute on function public.v2_weekly_digest_send(timestamptz, int) from public, anon, authenticated;
