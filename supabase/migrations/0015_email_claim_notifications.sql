-- Send the claim notifications by email, from the database.
--
-- In-app notifications only reach someone who opens the app. A claimant who never
-- comes back never learns the outcome, and an admin who isn't looking never sees a
-- request — which is exactly the case an email exists for. There is already a
-- verified sending domain (publisense.app in Resend), so the missing piece was a
-- way to send without putting an API key anywhere the browser can reach.
--
-- pg_net lets Postgres make the HTTPS call itself: the key lives in Supabase Vault,
-- the request is made by a SECURITY DEFINER trigger function, and the browser never
-- sees either. Nothing new to deploy and no shared secret to hand to the client.
--
-- Every attempt is recorded in email_log, including the ones that could not be
-- made — a silent failure here would be worse than no email at all, because the
-- in-app notification would make it look delivered.
--
-- PORTABILITY. pg_net and supabase_vault are Supabase platform extensions. The CI
-- migrations job applies these files to a stock Postgres that has neither, so every
-- extension-dependent object is created only where the extensions exist. There this
-- migration creates email_log and the trigger function, then stops with a notice:
-- CI proves the file parses and applies in order, not that mail is delivered.
-- Delivery is verified live and recorded in the PR.

do $extensions$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    create extension if not exists supabase_vault;
  end if;
end
$extensions$;

create table if not exists public.email_log (
  id              uuid primary key default gen_random_uuid(),
  notification_id text,
  kind            text,
  recipient       text,
  status          text not null,
  request_id      bigint,
  detail          text,
  created_at      timestamptz not null default now()
);

create index if not exists email_log_created_idx on public.email_log (created_at desc);

alter table public.email_log enable row level security;

-- Admin-readable; nobody writes to it by hand (the trigger does).
drop policy if exists "email log admin read" on public.email_log;
create policy "email log admin read" on public.email_log
  for select using (public.is_admin());


create or replace function public.send_notification_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_email     text;
  v_key       text;
  v_request   bigint;
  v_name      text;
begin
  -- Only the claim lifecycle is emailed. Votes and comments stay in the app: they
  -- are frequent, and emailing them would train people to ignore the ones that
  -- matter.
  if new.kind not in ('claim_requested', 'claim_pending', 'claim_approved', 'claim_rejected') then
    return new;
  end if;

  select nullif(trim(email), '') into v_email from public.profiles where id = new.recipient_id;

  if v_email is null then
    insert into public.email_log (notification_id, kind, recipient, status, detail)
    values (new.id, new.kind, null, 'skipped', 'recipient has no email address');
    return new;
  end if;

  -- Never send to reserved documentation domains. The demo data uses
  -- @publisense.invalid, and bouncing mail at a domain that cannot receive it is
  -- how a sending reputation gets ruined.
  if v_email ~* '@([a-z0-9-]+\.)*(invalid|test|example|localhost)$' then
    insert into public.email_log (notification_id, kind, recipient, status, detail)
    values (new.id, new.kind, v_email, 'skipped', 'reserved domain');
    return new;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key';

  if v_key is null then
    insert into public.email_log (notification_id, kind, recipient, status, detail)
    values (new.id, new.kind, v_email, 'no_secret', 'resend_api_key missing from vault');
    return new;
  end if;

  select coalesce(name, 'your board') into v_name from public.products where id = new.product_id;

  v_request := net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'from', 'Publisense <notify@publisense.app>',
      'to', jsonb_build_array(v_email),
      'subject', new.title,
      'text',
        new.message
        || E'\n\n— Publisense\n'
        || 'You can see this in the app: https://publisense.app'
    ),
    timeout_milliseconds := 8000
  );

  insert into public.email_log (notification_id, kind, recipient, status, request_id)
  values (new.id, new.kind, v_email, 'queued', v_request);

  return new;
end;
$function$;

-- Only the trigger calls this; it holds a secret and must not be reachable over RPC.
revoke all on function public.send_notification_email() from anon, authenticated;


-- The trigger and the delivery view exist only where pg_net and Vault are present.
do $platform$
begin
  if exists (select 1 from pg_namespace where nspname = 'net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then

    execute $trg$
      drop trigger if exists notifications_send_email on public.notifications;
      create trigger notifications_send_email
        after insert on public.notifications
        for each row execute function public.send_notification_email();
    $trg$;

    -- Anything that can fail silently needs somewhere to be looked at. email_log
    -- says what was attempted; pg_net keeps the response; this view pairs them, so
    -- a send that came back 401 or 422 shows up as itself instead of 'queued'.
    execute $view$
      create or replace view public.email_delivery
      with (security_invoker = true) as
      select
        l.id,
        l.created_at,
        l.kind,
        l.recipient,
        l.status,
        l.request_id,
        case
          when l.status <> 'queued' then l.status
          when r.status_code is null then 'in flight'
          when r.status_code between 200 and 299 then 'sent'
          else 'failed'
        end as outcome,
        r.status_code,
        nullif(r.content, '') as provider_response,
        l.detail
      from public.email_log l
      left join net._http_response r on r.id = l.request_id;
    $view$;

    raise notice 'email notifications enabled (pg_net + vault present)';
  else
    raise notice 'pg_net/vault absent: email trigger and delivery view not created (expected off-platform, e.g. CI)';
  end if;
end
$platform$;
