-- Rollback for 0059 (DM new-message emails). Stops the schedule and drops the flush
-- and dm_member.emailed_at. The 'message' value stays in v2_notification_kind:
-- Postgres can't drop an enum value, and an unused one is harmless. Any
-- notification_pref rows for it are removed.
begin;
do $$ begin
  if to_regnamespace('cron') is not null and exists (select 1 from cron.job where jobname = 'v2-dm-email-flush') then
    perform cron.unschedule('v2-dm-email-flush');
  end if;
end $$;
drop function if exists public.v2_dm_email_flush();
alter table public.dm_member drop column if exists emailed_at;
delete from public.notification_pref where kind::text = 'message';
commit;
notify pgrst, 'reload schema';
