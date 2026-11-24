-- Rollback for 0073 (analytics exclusion flag & canonical email matching).
-- Restores private.is_excluded_analytics_email and private.is_excluded_analytics_user
-- to their 0069 definitions and drops private.analytics_excluded_user and
-- private.canonical_analytics_email.
begin;

create or replace function private.is_excluded_analytics_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with norm as (
    select lower(btrim(coalesce(p_email, ''))) as e
  )
  select case
    when e = '' then false
    when e ~ '(\.test|\.example|\.invalid|@localhost)$' then true
    when exists (
      select 1
        from public.platform_admin pa
        join auth.users au on au.id = pa.user_id
       where au.email is not null
         and regexp_replace(lower(btrim(au.email)), '\+[^@]*@', '@')
           = regexp_replace(e, '\+[^@]*@', '@')
    ) then true
    else false
  end
  from norm;
$$;

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
    else coalesce((
      select private.is_excluded_analytics_email(au.email)
        from auth.users au
       where au.id = p_uid
    ), false)
  end;
$$;

revoke all on function private.is_excluded_analytics_email(text) from public, anon, authenticated;
revoke all on function private.is_excluded_analytics_user(uuid) from public, anon, authenticated;

drop table if exists private.analytics_excluded_user;
drop function if exists private.canonical_analytics_email(text);

commit;
notify pgrst, 'reload schema';
