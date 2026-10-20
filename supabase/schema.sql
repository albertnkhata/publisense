-- ============================================================================
-- PUBLISENSE V2 — SUPABASE POSTGRESQL SCHEMA + SEED DATA
-- Product-First Crowdsourced Feedback & Social Signal Platform
-- ============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- 1. ORGANIZATIONS (Lightweight parent layer grouping product suites)
create table if not exists public.organizations (
  id text primary key,
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  logo_url text not null default '',
  website_url text not null default '',
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. PRODUCTS (Primary entity tagged in feedback posts)
create table if not exists public.products (
  id text primary key,
  slug text not null unique,
  org_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  category text not null check (category in ('ai_agents', 'dev_tools', 'design_creative', 'cloud_data', 'productivity')),
  logo_url text not null default '',
  website_url text not null default '',
  is_verified boolean not null default false,
  responsiveness_rate integer not null default 80 check (responsiveness_rate between 0 and 100),
  avg_response_time text not null default '< 24h',
  followers_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_org_id on public.products(org_id);
create index if not exists idx_products_category on public.products(category);

-- 3. PROFILES (Social user & product team accounts)
create table if not exists public.profiles (
  id text primary key,
  handle text not null unique,
  name text not null,
  email text not null unique,
  avatar_url text not null default '',
  bio text not null default '',
  role text not null default 'user' check (role in ('user', 'maintainer', 'admin')),
  managed_org_id text references public.organizations(id) on delete set null,
  role_title text,
  location text,
  joined_at timestamptz not null default now()
);

create index if not exists idx_profiles_handle on public.profiles(handle);

-- 4. FEEDBACK POSTS (Signals, bugs, UX friction, feature requests)
create table if not exists public.posts (
  id text primary key default ('post-' || gen_random_uuid()::text),
  product_id text not null references public.products(id) on delete cascade,
  author_id text not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null check (type in ('bug', 'feature', 'ux', 'performance', 'pricing')),
  severity text not null default 'friction' check (severity in ('annoyance', 'friction', 'blocker')),
  status text not null default 'open' check (status in ('open', 'planned', 'in_progress', 'shipped', 'wont_do')),
  official_note text,
  official_updated_by text,
  official_updated_at timestamptz,
  tags text[] not null default '{}',
  media_urls text[] not null default '{}',
  upvote_count integer not null default 1,
  repost_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_product_id on public.posts(product_id);
create index if not exists idx_posts_author_id on public.posts(author_id);
create index if not exists idx_posts_status on public.posts(status);
create index if not exists idx_posts_created_at on public.posts(created_at desc);

-- 5. POST VOTES (Normalized many-to-many upvotes)
create table if not exists public.post_votes (
  post_id text not null references public.posts(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 6. POST REPOSTS (Social amplification / backing on user profiles & feeds)
create table if not exists public.post_reposts (
  post_id text not null references public.posts(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  quote_text text,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 7. COMMENTS (Discussion, workarounds, and official team responses)
create table if not exists public.comments (
  id text primary key default ('cmt-' || gen_random_uuid()::text),
  post_id text not null references public.posts(id) on delete cascade,
  author_id text not null references public.profiles(id) on delete cascade,
  body text not null,
  kind text not null default 'discussion' check (kind in ('discussion', 'workaround', 'official')),
  likes_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_post_id on public.comments(post_id, created_at asc);

-- 8. FOLLOWS (Follow products or fellow builders)
create table if not exists public.follows (
  follower_id text not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('product', 'user')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);

create index if not exists idx_follows_follower on public.follows(follower_id);

-- 9. NOTIFICATIONS
create table if not exists public.notifications (
  id text primary key default ('notif-' || gen_random_uuid()::text),
  recipient_id text not null references public.profiles(id) on delete cascade,
  actor_id text not null references public.profiles(id) on delete cascade,
  post_id text references public.posts(id) on delete cascade,
  product_id text references public.products(id) on delete cascade,
  kind text not null check (kind in ('upvote', 'comment', 'status_change', 'repost', 'follow')),
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications(recipient_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- RLS is NOT defined in this file. It is defined in supabase/migrations/, which
-- is the only source of truth for access control. This is deliberate:
--
--   * This file is bootstrap DDL (tables, indexes, constraints) plus a local-dev
--     seed. It is meant to be safe to re-run against an existing project.
--   * The policies used to live here as 17 `using (true)` rules. Because CREATE
--     POLICY only adds, re-running this file against a locked-down project
--     re-ADDED permissive policies alongside the secure ones. Permissive
--     policies OR together, so that silently reopened the whole database.
--   * Keeping RLS out of this file makes that failure mode impossible.
--
-- Apply access control in this order, after this file:
--
--   supabase/migrations/0004_handle_new_user.sql       -- profiles row on signup
--   supabase/migrations/0006_production_rls.sql        -- the real policies
--   supabase/migrations/0007_fix_profiles_recursion.sql -- recursion + guards
--
-- RLS is enabled on every table below but with NO policies until the migrations
-- run. That means the tables are closed by default, which is the safe direction
-- to fail: an un-migrated environment denies access rather than allowing it.
-- ============================================================================
alter table public.organizations enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_votes enable row level security;
alter table public.post_reposts enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

-- No policies here by design. See supabase/migrations/.
