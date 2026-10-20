-- ============================================================================
-- 0010: seeded fixture profiles must not occupy real email addresses
-- ============================================================================
-- PROBLEM
--   profiles.email is unique, and the seeded catalog ships eight demo personas
--   (usr-albert, usr-maya, usr-elena, …) carrying realistic addresses — plus
--   the owner's real Gmail on `usr-albert`.
--
--   0004's handler assumes the email is free and plain-inserts. When a real
--   person signs up — or requests a magic link with create_user — using an
--   address a fixture already holds, the insert violates profiles_email_key and
--   the whole auth transaction aborts:
--
--     POST /auth/v1/otp {"email":"albertnkhata.s@gmail.com","create_user":true}
--     -> HTTP 500  duplicate key value violates unique constraint
--                   "profiles_email_key"  (Key (email)=(…) already exists)
--
--   The owner could not sign in to his own product with his own address, and
--   any early tester whose email matched a fixture hit the same 500. A failed
--   signup is silent data loss from the user's point of view: Supabase creates
--   nothing and the modal just errors.
--
-- FIX — two parts
--   1. Fixture rows are moved to a reserved, non-routable domain
--      (`@publisense.invalid`, RFC 2606 `.invalid`). A row with no matching
--      auth user is seed data, not an account, and it has no business holding
--      a deliverable address.
--
--   2. `guard_profile_privileges` (0007) blocks all email changes for
--      non-admins. That guard is correct for account rows, so it is narrowed —
--      not removed: a profile may have its email neutralised **only** when the
--      row is not backed by an auth user and the new value is on
--      `publisense.invalid`. Every other column stays guarded, and an account
--      row's email stays immutable.
--
--   3. `handle_new_user` neutralises any remaining fixture that holds the
--      incoming email before inserting, so the collision cannot recur when new
--      seed data is loaded.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Narrow the guard: allow fixture email neutralisation, nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- admins may change anything
  if public.is_admin() then
    return new;
  end if;

  -- Fixture neutralisation: an unclaimed seed row (no auth user behind it) may
  -- be moved onto the reserved .invalid domain so it stops blocking a real
  -- signup. Nothing else about the row may change in this path.
  if new.email is distinct from old.email
     and new.email like '%@publisense.invalid'
     and not exists (select 1 from auth.users au where au.id::text = old.id)
  then
    if new.id <> old.id then
      raise exception 'profiles.id is immutable';
    end if;
    if new.role is distinct from old.role then
      raise exception 'profiles.role cannot be changed by the owner';
    end if;
    if new.managed_org_id is distinct from old.managed_org_id then
      raise exception 'profiles.managed_org_id cannot be changed by the owner';
    end if;
    return new;
  end if;

  if new.id <> old.id then
    raise exception 'profiles.id is immutable';
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role cannot be changed by the owner';
  end if;

  if new.managed_org_id is distinct from old.managed_org_id then
    raise exception 'profiles.managed_org_id cannot be changed by the owner';
  end if;

  if new.email is distinct from old.email then
    raise exception 'profiles.email cannot be changed here (requires email change flow)';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileges_trg on public.profiles;

create trigger guard_profile_privileges_trg
  before update on public.profiles
  for each row
  execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- 2. Move existing fixture emails onto the reserved domain.
-- ---------------------------------------------------------------------------
update public.profiles p
   set email = p.id || '@publisense.invalid'
 where not exists (select 1 from auth.users au where au.id::text = p.id)
   and p.email is distinct from (p.id || '@publisense.invalid');

-- ---------------------------------------------------------------------------
-- 3. handle_new_user: free a fixture that is squatting on the incoming email.
--    (Body otherwise identical to 0004 — see that file for the rationale on
--    column derivation and the uuid-suffixed handle.)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text;
  v_raw     text;
  v_base    text;
  v_handle  text;
  v_name    text;
  v_avatar  text;
begin
  v_email := lower(coalesce(new.email, new.id::text || '@publisense.app'));

  -- A fixture row holding this address would fail the insert below on
  -- profiles_email_key and abort signup. Neutralise it first; the guard permits
  -- this only for rows with no auth user behind them.
  update public.profiles p
     set email = p.id || '@publisense.invalid'
   where p.email = v_email
     and not exists (select 1 from auth.users au where au.id::text = p.id);

  v_raw := coalesce(
    new.raw_user_meta_data ->> 'handle',
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(v_email, '@', 1)
  );

  v_base := lower(v_raw);
  v_base := regexp_replace(v_base, '^@', '');
  v_base := regexp_replace(v_base, '[^a-z0-9_]+', '_', 'g');
  v_base := regexp_replace(v_base, '_+', '_', 'g');
  v_base := trim(both '_' from v_base);
  v_base := left(v_base, 24);
  if v_base = '' then
    v_base := 'user_' || substr(new.id::text, 1, 6);
  end if;

  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'user_name', ''),
    v_base
  );

  v_avatar := coalesce(nullif(new.raw_user_meta_data ->> 'avatar_url', ''), '');

  begin
    if not exists (select 1 from public.profiles p where p.handle = v_base) then
      v_handle := v_base;
    else
      v_handle := left(v_base, 19) || '_' || substr(new.id::text, 1, 4);
    end if;

    insert into public.profiles (id, handle, name, email, avatar_url, bio, role)
    values (
      new.id::text,
      v_handle,
      v_name,
      v_email,
      v_avatar,
      'Builder sharing product feedback and backing community signals on Publisense.',
      'user'
    );
  exception when unique_violation then
    if exists (select 1 from public.profiles p where p.id = new.id::text) then
      return new;
    end if;
    insert into public.profiles (id, handle, name, email, avatar_url, bio, role)
    values (
      new.id::text,
      left(v_base, 14) || '_' || new.id::text,
      v_name,
      v_email,
      v_avatar,
      'Builder sharing product feedback and backing community signals on Publisense.',
      'user'
    );
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
