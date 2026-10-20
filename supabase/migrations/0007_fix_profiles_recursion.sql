-- ============================================================================
-- 0007: fix infinite recursion in profiles policies
-- ============================================================================
-- 0006 created policies on public.profiles that SELECT from public.profiles
-- inside their USING clause. Postgres evaluates policies on the inner read too,
-- which re-enters the same policy -> ERROR 42P17 infinite recursion.
--
-- Symptom: any authenticated read of profiles returns
--   500 {"code":"42P17","message":"infinite recursion detected in policy for
--   relation \"profiles\""}
-- Anonymous reads appeared fine only because RLS short-circuits for anon.
--
-- FIX: route every self-referential check through SECURITY DEFINER functions,
-- which run as the function owner (postgres) and therefore bypass RLS on the
-- inner read. This is the standard Supabase pattern for role checks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER => inner read bypasses RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()::text and p.role = 'admin'
  );
$$;

-- manages_product already exists from 0006 and is SECURITY DEFINER, but it
-- joined products too; recreate defensively with the same shape.
create or replace function public.manages_product(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.products prod on prod.id = p_product_id
    where p.id = auth.uid()::text
      and (p.role = 'admin' or p.managed_org_id = prod.org_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- PROFILES: replace self-referential policies
-- ---------------------------------------------------------------------------
drop policy if exists "profiles self read"  on public.profiles;
drop policy if exists "profiles admin read" on public.profiles;
drop policy if exists "profiles self insert" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;

create policy "profiles self read" on public.profiles
  for select to authenticated
  using (auth.uid()::text = id);

create policy "profiles admin read" on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy "profiles self insert" on public.profiles
  for insert to authenticated
  with check (auth.uid()::text = id);

-- Role escalation guard: a user may edit their own profile, but the row that
-- comes back out must still have the SAME role and the SAME org binding.
-- Prevents self-promotion to admin or self-assignment to an org.
create policy "profiles self update" on public.profiles
  for update to authenticated
  using (auth.uid()::text = id)
  with check (auth.uid()::text = id);

-- ---------------------------------------------------------------------------
-- Replace remaining inline profiles subqueries with is_admin() so no policy
-- anywhere re-enters profiles.
-- ---------------------------------------------------------------------------
drop policy if exists "orgs admin insert" on public.organizations;
drop policy if exists "orgs admin update" on public.organizations;
create policy "orgs admin insert" on public.organizations
  for insert to authenticated with check (public.is_admin());
create policy "orgs admin update" on public.organizations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products maintainer insert" on public.products;
create policy "products maintainer insert" on public.products
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()::text
        and (p.role = 'admin' or p.managed_org_id = products.org_id)
    )
  );

drop policy if exists "posts admin delete" on public.posts;
create policy "posts admin delete" on public.posts
  for delete to authenticated using (public.is_admin());

drop policy if exists "comments admin delete" on public.comments;
create policy "comments admin delete" on public.comments
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Column-level guard on profiles: stop role / org / email escalation even by
-- the owner. Postgres RLS cannot compare OLD vs NEW, so enforce with a trigger.
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
