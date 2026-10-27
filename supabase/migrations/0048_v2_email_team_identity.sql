-- 0048: notification emails use the team identity (#160 follow-up). DRAFT: NOT APPLIED.
-- Needs Albert's approval before it runs on production (function change only: no table,
-- column, RLS or grant change, no backfill).
--
-- The problem. v2_email_send names the reply's author by profile name/handle, so an
-- official (team) reply emails as the teammate personally ("Test replied: ..."), while
-- the app shows it as "<Board> · Team". Status-change emails say "The <Board> team
-- marked ...", a different wording from the app.
--
-- The fix. Re-create v2_email_send from its deployed definition (pg_get_functiondef on
-- 2026-10-27) with two changes:
--   * reply: read reply.is_official; when true, the sender line is "<Board> · Team"
--     ("Cursor · Team replied: <title>", "Cursor · Team replied to your post ... on Cursor:").
--   * status_change: "Cursor · Team marked “<title>” as planned."
-- Personal replies keep the person's name. CREATE OR REPLACE keeps owner and grants;
-- the revoke below repeats the existing one.
--
-- Rollback: rollback/0048_down.sql re-creates the pre-0048 definition.

CREATE OR REPLACE FUNCTION public.v2_email_send(n notification, p_to text, p_more integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select p.id, p.title, b.name as board into v_post from post p join board b on b.id = p.board_id where p.id = n.post_id;
    if v_post.id is null then return; end if;
  end if;
  select coalesce(nullif(btrim(name), ''), '@' || handle, 'Someone') into v_actor from profile where id = n.actor;
  v_actor := coalesce(v_actor, 'Someone');

  insert into email_token (user_id) values (n.recipient) on conflict (user_id) do nothing;
  select token into v_token from email_token where user_id = n.recipient;

  -- (if/else, not CASE: a record's fields can't be referenced before it is assigned)
  if n.kind = 'product' then
    v_url := 'https://publisense.app/b/' || v_board.slug;
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

revoke execute on function public.v2_email_send(public.notification, text, int) from public, anon, authenticated;
