-- 0070: the weekly digest email (#308). DRAFT: NOT APPLIED.
-- Needs Albert's approval before it runs on production (new enum value, one index,
-- one function, one pg_cron job; no table, column, RLS or grant change, no backfill).
--
-- What it sends. Once a week, to each person who follows at least one board, one email
-- with up to two sections, each only when it has something in it:
--   * "Shipped this week": posts on boards they follow that moved to Shipped in the
--     last 7 days, plus any post they upvoted (on any board) that moved to Shipped,
--     Planned or In progress, tagged "a post you upvoted". Only the post's newest move
--     counts, and only while the post still has that status (a revert is not news).
--   * "Rising on your boards": the top 5 posts created in the last 7 days on boards
--     they follow, by upvotes then replies (posts already listed above are left out).
-- Only posts anyone can see: live board, not hidden, not merged. Nobody gets an empty
-- digest: a person with nothing in either section is skipped without a send or a log row.
-- Subject: "Your week on Publisense: N new posts" (N = every post created on their
-- boards this week), or "... N posts shipped" / "N updates" when nothing new was posted.
--
-- Guards, the same as the other notification emails:
--   * a confirmed, not deleted auth.users email that is not a reserved test domain
--     (reserved domains are logged 'skipped')
--   * the new 'weekly_digest' email setting is on (notification_pref; absent = on).
--     It is a v2_notification_kind value, so the one-click unsubscribe (which turns off
--     every kind through enum_range) turns the digest off too, with no change to it.
--   * the existing 20-a-day cap (v2_email_over_cap; logged 'skipped' when over)
--   * pg_net and the Vault key present (otherwise nothing is sent or logged, as 0059)
-- Every digest carries the recipient's one-click unsubscribe link (email_token) with
-- List-Unsubscribe and List-Unsubscribe-Post headers, and a link to Settings to turn
-- off just the digest. Errors are logged to email_log and swallowed per person.
--
-- Idempotent per person per ISO week. email_log.notification_id is
-- '<user id>:<IYYY-Www>' with kind 'v2_weekly_digest'. A person with any row for this
-- week other than 'error' is not considered again, and a unique partial index makes a
-- second 'queued' row for the same week impossible (the conflicting insert rolls back
-- that person's pg_net request with it). An advisory lock keeps two runs from
-- overlapping.
--
-- Schedule: pg_cron every 15 minutes from 07:00 to 09:45 UTC on Mondays, at most 100
-- people per run, where pg_cron exists (skipped with a NOTICE in CI). Most weeks the
-- 07:00 run sends everything and the rest find nothing to do; the extra runs spread a
-- larger list out and retry anyone whose send errored.
--
-- Rollback: supabase/rollback/0070_down.sql (the enum value stays; Postgres can't drop one).

alter type public.v2_notification_kind add value if not exists 'weekly_digest';

create unique index if not exists email_log_weekly_digest_once_idx
  on public.email_log (notification_id) where kind = 'v2_weekly_digest' and status = 'queued';

create or replace function public.v2_weekly_digest_send(p_now timestamptz default now(), p_limit int default 100)
returns int language plpgsql security definer set search_path = public as $$
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
      v_unsub     := 'https://publisense.app/unsubscribe?token=' || v_token::text;
      v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text;

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
             || 'Turn off the weekly digest: ' || v_settings || E'\n'
             || 'Unsubscribe from all emails: ' || v_unsub;

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
             || '<a href="' || v_settings || '" style="color:#777">Turn off the weekly digest</a> · '
             || '<a href="' || v_unsub || '" style="color:#777">Unsubscribe from all emails</a></p></div>';

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
end $$;

revoke execute on function public.v2_weekly_digest_send(timestamptz, int) from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('v2-weekly-digest', '*/15 7-9 * * 1', 'select public.v2_weekly_digest_send()');
  else
    raise notice '0070: pg_cron is not available here; the weekly digest is not scheduled';
  end if;
end
$cron$;

notify pgrst, 'reload schema';
