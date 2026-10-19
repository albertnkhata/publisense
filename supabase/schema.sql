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
-- ROW LEVEL SECURITY (RLS) POLICIES (Open Index + Persona Switcher Support)
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

-- Drop old restrictive policies if re-running
drop policy if exists "Public read organizations" on public.organizations;
drop policy if exists "Public write organizations" on public.organizations;
drop policy if exists "Public read products" on public.products;
drop policy if exists "Public write products" on public.products;
drop policy if exists "Public read profiles" on public.profiles;
drop policy if exists "Users manage own profile" on public.profiles;
drop policy if exists "Public write profiles" on public.profiles;
drop policy if exists "Public read posts" on public.posts;
drop policy if exists "Authenticated users create posts" on public.posts;
drop policy if exists "Authors or maintainers update posts" on public.posts;
drop policy if exists "Authors or admins delete posts" on public.posts;
drop policy if exists "Public write posts" on public.posts;
drop policy if exists "Public read post_votes" on public.post_votes;
drop policy if exists "Users manage own votes" on public.post_votes;
drop policy if exists "Public write post_votes" on public.post_votes;
drop policy if exists "Public read post_reposts" on public.post_reposts;
drop policy if exists "Users manage own reposts" on public.post_reposts;
drop policy if exists "Public write post_reposts" on public.post_reposts;
drop policy if exists "Public read comments" on public.comments;
drop policy if exists "Authenticated users create comments" on public.comments;
drop policy if exists "Authors delete own comments" on public.comments;
drop policy if exists "Public write comments" on public.comments;
drop policy if exists "Public read follows" on public.follows;
drop policy if exists "Users manage own follows" on public.follows;
drop policy if exists "Public write follows" on public.follows;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
drop policy if exists "Public access notifications" on public.notifications;

-- Open-Index Read & Write Policies (Allows anon key + persona switcher to read/write)
create policy "Public read organizations" on public.organizations for select using (true);
create policy "Public write organizations" on public.organizations for all using (true) with check (true);

create policy "Public read products" on public.products for select using (true);
create policy "Public write products" on public.products for all using (true) with check (true);

create policy "Public read profiles" on public.profiles for select using (true);
create policy "Public write profiles" on public.profiles for all using (true) with check (true);

create policy "Public read posts" on public.posts for select using (true);
create policy "Public write posts" on public.posts for all using (true) with check (true);

create policy "Public read post_votes" on public.post_votes for select using (true);
create policy "Public write post_votes" on public.post_votes for all using (true) with check (true);

create policy "Public read post_reposts" on public.post_reposts for select using (true);
create policy "Public write post_reposts" on public.post_reposts for all using (true) with check (true);

create policy "Public read comments" on public.comments for select using (true);
create policy "Public write comments" on public.comments for all using (true) with check (true);

create policy "Public read follows" on public.follows for select using (true);
create policy "Public write follows" on public.follows for all using (true) with check (true);

create policy "Public access notifications" on public.notifications for all using (true) with check (true);
