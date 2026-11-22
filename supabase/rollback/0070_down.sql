-- Rollback for 0070 (weekly digest). Stops the schedule and drops the sender and its
-- once-a-week index. The 'weekly_digest' value stays in v2_notification_kind: Postgres
-- can't drop an enum value, and an unused one is harmless. Any notification_pref rows
-- for it are removed. email_log rows of kind 'v2_weekly_digest' are kept as history.
begin;
do $$
declare v_found boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = $1)' into v_found using 'v2-weekly-digest';
    if v_found then
      execute 'select cron.unschedule($1)' using 'v2-weekly-digest';
    end if;
  end if;
end $$;
drop function if exists public.v2_weekly_digest_send(timestamptz, int);
drop index if exists public.email_log_weekly_digest_once_idx;
delete from public.notification_pref where kind::text = 'weekly_digest';
commit;
notify pgrst, 'reload schema';
