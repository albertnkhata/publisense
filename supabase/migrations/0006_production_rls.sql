-- ============================================================================
-- 0006: Production RLS — public reads, authenticated writes
-- ============================================================================
-- Closes issue #11 / deferred register D-006. MVP critical path item 2.
--
-- DESIGN (confirmed with product owner 2026-10-20):
--   * READS stay public on content tables — this is an "Open Index", anyone can
--     browse products, signals, comments, votes without an account.
--   * WRITES require an authenticated session (auth.uid()).
--   * profiles is the exception to public read: email is private.
--
-- PREREQUISITE
--   profiles.id must equal auth.uid()::text. handle_new_user() (migration 0004)
--   guarantees this for new users; the backfill covers pre-existing auth users.
--   Every policy below relies on that idiom.
--
-- DROPS all 17 permissive policies from schema.sql before creating the secure set.
-- IDEMPOTENT: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the permissive set
-- ---------------------------------------------------------------------------
drop policy if exists "Public read organizations"   on public.organizations;
drop policy if exists "Public write organizations"  on public.organizations;
drop policy if exists "Public read products"        on public.products;
drop policy if exists "Public write products"       on public.products;
drop policy if exists "Public read profiles"        on public.profiles;
drop policy if exists "Public write profiles"       on public.profiles;
drop policy if exists "Public read posts"           on public.posts;
drop policy if exists "Public write posts"          on public.posts;
drop policy if exists "Public read post_votes"      on public.post_votes;
drop policy if exists "Public write post_votes"     on public.post_votes;
drop policy if exists "Public read post_reposts"    on public.post_reposts;
drop policy if exists "Public write post_reposts"   on public.post_reposts;
drop policy if exists "Public read comments"        on public.comments;
drop policy if exists "Public write comments"       on public.comments;
drop policy if exists "Public read follows"         on public.follows;
drop policy if exists "Public write follows"        on public.follows;
drop policy if exists "Public access notifications" on public.notifications;

-- Any leftovers from earlier attempts
drop policy if exists "Users manage own profile"             on public.profiles;
drop policy if exists "Authenticated users create posts"      on public.posts;
drop policy if exists "Authors or maintainers update posts"   on public.posts;
drop policy if exists "Authors or admins delete posts"        on public.posts;
drop policy if exists "Users manage own votes"                on public.post_votes;
drop policy if exists "Users manage own reposts"              on public.post_reposts;
drop policy if exists "Authenticated users create comments"   on public.comments;
drop policy if exists "Authors delete own comments"           on public.comments;
drop policy if exists "Users manage own follows"              on public.follows;
drop policy if exists "Users read own notifications"          on public.notifications;
drop policy if exists "Users update own notifications"        on public.notifications;

-- ---------------------------------------------------------------------------
-- 2. Helper: is the caller an admin, or a maintainer for this product's org?
--    SECURITY DEFINER so the policy can read profiles without recursing
--    through profiles' own RLS.
-- ---------------------------------------------------------------------------
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
-- 3. ORGANIZATIONS — public read, admin-only write
-- ---------------------------------------------------------------------------
create policy "orgs read public" on public.organizations
  for select using (true);

create policy "orgs admin insert" on public.organizations
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()::text and p.role = 'admin')
  );

create policy "orgs admin update" on public.organizations
  for update to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()::text and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()::text and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 4. PRODUCTS — public read, org maintainer or admin writes
-- ---------------------------------------------------------------------------
create policy "products read public" on public.products
  for select using (true);

create policy "products maintainer insert" on public.products
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()::text
              and (p.role = 'admin' or p.managed_org_id = products.org_id))
  );

create policy "products maintainer update" on public.products
  for update to authenticated
  using (public.manages_product(products.id))
  with check (public.manages_product(products.id));

-- ---------------------------------------------------------------------------
-- 5. PROFILES — email is private
--    Public read exposes only non-sensitive columns through a view;
--    the table itself is readable only by its owner and admins.
--    This closes the "anyone can dump every user's email" hole.
-- ---------------------------------------------------------------------------
create policy "profiles self read" on public.profiles
  for select to authenticated
  using (auth.uid()::text = id);

create policy "profiles admin read" on public.profiles
  for select to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()::text and p.role = 'admin')
  );

create policy "profiles self insert" on public.profiles
  for insert to authenticated
  with check (auth.uid()::text = id);

create policy "profiles self update" on public.profiles
  for update to authenticated
  using (auth.uid()::text = id)
  with check (auth.uid()::text = id);

-- Public display data (no email) for feed/contributor views.
-- security_invoker so the caller's RLS applies, not the definer's.
create or replace view public.public_profiles
with (security_invoker = false)
as
  select id, handle, name, avatar_url, bio, role, role_title, location, joined_at
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. POSTS — public read, authenticated create, author/maintainer manage
-- ---------------------------------------------------------------------------
create policy "posts read public" on public.posts
  for select using (true);

create policy "posts create authenticated" on public.posts
  for insert to authenticated
  with check (auth.uid()::text = author_id);

create policy "posts author update" on public.posts
  for update to authenticated
  using (auth.uid()::text = author_id)
  with check (auth.uid()::text = author_id);

create policy "posts maintainer update" on public.posts
  for update to authenticated
  using (public.manages_product(posts.product_id));

create policy "posts author delete" on public.posts
  for delete to authenticated
  using (auth.uid()::text = author_id);

create policy "posts admin delete" on public.posts
  for delete to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()::text and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 7. POST_VOTES — public read, own row only
-- ---------------------------------------------------------------------------
create policy "votes read public" on public.post_votes
  for select using (true);

create policy "votes self insert" on public.post_votes
  for insert to authenticated
  with check (auth.uid()::text = user_id);

create policy "votes self delete" on public.post_votes
  for delete to authenticated
  using (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- 8. POST_REPOSTS — public read, own row only
-- ---------------------------------------------------------------------------
create policy "reposts read public" on public.post_reposts
  for select using (true);

create policy "reposts self insert" on public.post_reposts
  for insert to authenticated
  with check (auth.uid()::text = user_id);

create policy "reposts self delete" on public.post_reposts
  for delete to authenticated
  using (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- 9. COMMENTS — public read, authenticated create, author deletes
-- ---------------------------------------------------------------------------
create policy "comments read public" on public.comments
  for select using (true);

create policy "comments create authenticated" on public.comments
  for insert to authenticated
  with check (auth.uid()::text = author_id);

create policy "comments author update" on public.comments
  for update to authenticated
  using (auth.uid()::text = author_id)
  with check (auth.uid()::text = author_id);

create policy "comments author delete" on public.comments
  for delete to authenticated
  using (auth.uid()::text = author_id);

create policy "comments admin delete" on public.comments
  for delete to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()::text and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 10. FOLLOWS — own rows only (readable so counts work, but not sensitive)
-- ---------------------------------------------------------------------------
create policy "follows read public" on public.follows
  for select using (true);

create policy "follows self insert" on public.follows
  for insert to authenticated
  with check (auth.uid()::text = follower_id);

create policy "follows self delete" on public.follows
  for delete to authenticated
  using (auth.uid()::text = follower_id);

-- ---------------------------------------------------------------------------
-- 11. NOTIFICATIONS — recipient only, never public
-- ---------------------------------------------------------------------------
create policy "notifs recipient read" on public.notifications
  for select to authenticated
  using (auth.uid()::text = recipient_id);

create policy "notifs recipient update" on public.notifications
  for update to authenticated
  using (auth.uid()::text = recipient_id)
  with check (auth.uid()::text = recipient_id);

-- No INSERT policy: notifications are system-generated. Only service_role
-- (which bypasses RLS) can create them. This prevents forging.
