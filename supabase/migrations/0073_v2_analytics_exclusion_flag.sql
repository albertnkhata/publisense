-- 0073_v2_analytics_exclusion_flag.sql
-- Strengthen account-level analytics exclusion (Appendix A check 8.3, #309):
--   1. Adds private.analytics_excluded_user so any internal/owner/QA account can be
--      flagged for exclusion independently of platform_admin status (invisible to
--      PostgREST / anon / authenticated).
--   2. Adds private.canonical_analytics_email() (strips +tag aliases and normalizes
--      Gmail dot/googlemail variants) so all +tag QA aliases of any platform admin
--      or excluded base account are matched reliably.
--   3. Excludes @publisense.app internal addresses (e.g. support@publisense.app)
--      alongside reserved test domains (.test, .example, .invalid, localhost).
--   4. Backfills private.analytics_excluded_user for existing owner/QA/support
--      accounts in auth.users.
--
-- Rollback: supabase/rollback/0073_down.sql.

create table if not exists private.analytics_excluded_user (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text not null default '',
  created_at timestamptz not null default now()
);

revoke all on table private.analytics_excluded_user from public, anon, authenticated;

create or replace function private.canonical_analytics_email(p_email text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  with parts as (
    select lower(btrim(coalesce(p_email, ''))) as e
  ),
  split as (
    select split_part(e, '@', 1) as local_part,
           split_part(e, '@', 2) as domain_part,
           e
      from parts
  )
  select case
    when e = '' or position('@' in e) = 0 then ''
    when domain_part in ('gmail.com', 'googlemail.com') then
      replace(regexp_replace(local_part, '\+.*$', ''), '.', '') || '@gmail.com'
    else
      regexp_replace(local_part, '\+.*$', '') || '@' || domain_part
  end
  from split;
$$;

revoke all on function private.canonical_analytics_email(text) from public, anon, authenticated;

create or replace function private.is_excluded_analytics_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with norm as (
    select lower(btrim(coalesce(p_email, ''))) as e,
           private.canonical_analytics_email(p_email) as canon
  )
  select case
    when e = '' then false
    when e ~ '(\.test|\.example|\.invalid|@localhost|@publisense\.app)$' then true
    when exists (
      select 1
        from public.platform_admin pa
        join auth.users au on au.id = pa.user_id
       where au.email is not null
         and private.canonical_analytics_email(au.email) = norm.canon
    ) then true
    when exists (
      select 1
        from private.analytics_excluded_user ex
        join auth.users au on au.id = ex.user_id
       where au.email is not null
         and private.canonical_analytics_email(au.email) = norm.canon
    ) then true
    else false
  end
  from norm;
$$;

revoke all on function private.is_excluded_analytics_email(text) from public, anon, authenticated;

create or replace function private.is_excluded_analytics_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case
    when p_uid is null then false
    when private.is_platform_admin(p_uid) then true
    when exists (select 1 from private.analytics_excluded_user where user_id = p_uid) then true
    else coalesce((
      select private.is_excluded_analytics_email(au.email)
        from auth.users au
       where au.id = p_uid
    ), false)
  end;
$$;

revoke all on function private.is_excluded_analytics_user(uuid) from public, anon, authenticated;

-- Backfill existing owner, support, and QA test accounts (and all their +tag aliases).
insert into private.analytics_excluded_user (user_id, reason)
select u.id, 'owner/internal/qa'
  from auth.users u
 where u.email is not null
   and (
     private.canonical_analytics_email(u.email) in ('albertnkhatas@gmail.com', 'albertnkhata@hotmail.com')
     or lower(btrim(u.email)) like '%@publisense.app'
   )
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
