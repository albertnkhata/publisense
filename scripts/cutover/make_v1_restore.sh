#!/bin/bash
# Build v1_restore.sql from a verified local restore of a production backup: everything
# migration 0023 drops (v1 tables with their rows, indexes, constraints, triggers, RLS,
# policies and grants; the public_profiles view; the 11 v1 functions; the v1 signup
# trigger on auth.users; the v1 email_log policy and grants). This is the rollback for
# "0023 was applied and v1 has to come back". Never touches production.
#   scripts/cutover/make_v1_restore.sh <local-db-with-restored-backup> <out.sql>
set -euo pipefail
DB=$1; OUT=$2
export PATH=${PGBIN:-/usr/lib/postgresql/17/bin}:$PATH
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-54329}
T=(organizations products profiles posts post_votes post_reposts comments follows notifications comment_votes claim_decisions public_profiles)
F="'handle_new_user','guard_profile_privileges','publisense_sanitise_handle','sync_comment_likes_count','guard_comment_likes_count','send_notification_email','approve_product_claim','reject_product_claim','claim_product_board','manages_product','is_admin'"
{
  echo "-- Publisense v1 rollback: re-creates what 0023_drop_v1.sql removed, with the backed-up rows."
  echo "-- Built $(date -u +%FT%TZ) from local database $DB. Apply in one transaction: psql -1 -f"
  echo "set check_function_bodies = off;"
  echo "-- v1 functions"
  psql -U postgres -d "$DB" -qtA -c "select pg_get_functiondef(p.oid) || ';' from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ($F) order by p.proname"
  echo "-- function grants"
  psql -U postgres -d "$DB" -qtA -c "select format('revoke all on function %s from public, anon, authenticated, service_role;', p.oid::regprocedure) || coalesce((select string_agg(format(' grant execute on function %s to %s;', p.oid::regprocedure, coalesce(quote_ident(r.rolname), 'public')), '') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid = a.grantee where coalesce(r.rolname, 'public') in ('anon','authenticated','service_role','public')), '') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ($F)"
  pg_dump -U postgres -d "$DB" --no-owner --section=pre-data --section=data --section=post-data \
    $(printf -- '-t public.%s ' "${T[@]}") | grep -v '^SET transaction_timeout' | sed '/^SELECT pg_catalog.set_config(.search_path/d'
  echo "-- the v1 signup trigger and the v1 email_log admin policy"
  echo "create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();"
  echo "drop policy if exists \"v2 email log platform admin read\" on public.email_log;"
  echo "create policy \"email log admin read\" on public.email_log for select using (public.is_admin());"
  echo "grant all on table public.email_log to anon, authenticated;"
  echo "do \$\$ begin if to_regclass('public.email_delivery') is not null then grant all on table public.email_delivery to anon, authenticated; end if; end \$\$;"
  echo "-- v1 profiles for users who signed up while only the v2 trigger ran (same shape handle_new_user writes)"
  echo "-- Review before applying: handle_new_user is re-run per missing user."
  echo "do \$\$ declare u auth.users; begin
  for u in select * from auth.users au where not exists (select 1 from public.profiles p where p.id = au.id::text) loop
    raise notice 'v1 profile missing for %; create it from the v1 app or by hand', u.id;
  end loop; end \$\$;"
} > "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
