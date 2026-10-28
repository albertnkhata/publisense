-- Rollback for 0054_v2_command_centre.sql. Schema grants on `private` are untouched
-- (they come from 0042/0047).

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'v2-analytics-rollup';
  end if;
exception when others then
  null;
end
$cron$;

drop function if exists public.admin_command_centre(integer);
drop function if exists private.rollup_analytics_events();
drop function if exists public.record_event(uuid, text, text, uuid, uuid, text, jsonb);
drop function if exists private.analytics_buckets(timestamptz);
drop function if exists private.analytics_detail(text, jsonb);
drop function if exists private.analytics_claim_fail_reason(text);
drop function if exists private.analytics_claim_method(text);
drop function if exists private.analytics_term_is_personal(text);
drop table if exists private.analytics_daily;
drop table if exists private.analytics_event;
