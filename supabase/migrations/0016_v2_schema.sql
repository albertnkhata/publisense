-- Publisense v2, step 3 of docs/v2/BUILD.md: the domain model (FOUNDATION section 6).
--
-- ADDITIVE ONLY. v1 keeps running on its plural tables (profiles, posts, products,
-- comments, ...) until cutover. Every v2 table is singular, so no name collides, and
-- nothing here reads, alters or drops a v1 object. Enum types carry a v2_ prefix for
-- the same reason. Cutover (step 9) drops v1; until then both models live side by side.
--
-- Shape of the model:
--   board   = a product, the public face.            hub = a public group of boards.
--   membership(scope, scope_id, role) is the only source of team power; a hub
--   membership covers every board in the hub. platform_admin is Hark-side staff.
--   profile has no role column on purpose.
--
-- Counters (vote_count, reply_count, follower_count, post_count) are kept by triggers
-- in 0017 and are never client-writable, so the feed can sort without aggregating.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type public.v2_scope            as enum ('board', 'hub');
create type public.v2_role             as enum ('owner', 'admin', 'member');
create type public.v2_post_type        as enum ('bug', 'feature');
create type public.v2_post_status      as enum ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed', 'merged');
create type public.v2_request_status   as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type public.v2_domain_method    as enum ('email', 'dns');
create type public.v2_follow_target    as enum ('board', 'hub', 'post', 'user');
create type public.v2_notification_kind as enum ('reply', 'mention', 'upvote_milestone', 'status_change', 'followed_post', 'follow', 'claim', 'join');
create type public.v2_channel          as enum ('in_app', 'email');
create type public.v2_report_target    as enum ('post', 'reply', 'user');
create type public.v2_report_status    as enum ('open', 'actioned', 'dismissed');

-- ---------------------------------------------------------------- people

create table public.profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  handle      text not null unique
              check (handle ~ '^[a-z0-9_]{3,30}$'),
  name        text not null default '' check (char_length(name) <= 60),
  avatar_path text check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  bio         text not null default '' check (char_length(bio) <= 280),
  created_at  timestamptz not null default now(),
  follower_count integer not null default 0
);

create table public.platform_admin (
  user_id    uuid primary key references public.profile (id) on delete cascade,
  granted_by uuid references public.profile (id) on delete set null,
  granted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- boards and hubs

create table public.hub (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name           text not null check (char_length(name) between 1 and 60),
  description    text not null default '' check (char_length(description) <= 280),
  primary_domain text check (primary_domain is null or primary_domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  claimed_at     timestamptz,
  created_at     timestamptz not null default now(),
  follower_count integer not null default 0
);

create table public.board (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name           text not null check (char_length(name) between 1 and 60),
  tagline        text not null default '' check (char_length(tagline) <= 120),
  site           text check (site is null or site ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+(/[^\s]*)?$'),
  color          text not null default '#3F3F46' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path      text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  category       text check (category in ('ai', 'code', 'dev', 'design', 'prod', 'browser')),
  hub_id         uuid references public.hub (id) on delete set null,
  claimed_at     timestamptz,
  created_at     timestamptz not null default now(),
  follower_count integer not null default 0,
  post_count     integer not null default 0
);
create index board_hub_idx on public.board (hub_id);

-- Shared hosts nobody can prove a company by (gmail.com, vercel.app, ...). A trigger
-- in 0017 refuses them in verified_domain; the list is seeded in 0019.
create table public.shared_domain (
  domain text primary key
);

create table public.verified_domain (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  verified_by uuid not null references public.profile (id) on delete cascade,
  method      public.v2_domain_method not null,
  verified_at timestamptz not null default now(),
  unique (domain, verified_by)
);

-- Pending proofs (an emailed code, a DNS TXT token). Server-only: RLS on, no policy.
-- The code is stored hashed; the RPCs that issue and check it arrive in step 7.
create table public.domain_challenge (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profile (id) on delete cascade,
  domain     text not null,
  method     public.v2_domain_method not null,
  work_email text,
  code_hash  text,
  dns_token  text,
  attempts   smallint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.membership (
  user_id    uuid not null references public.profile (id) on delete cascade,
  scope      public.v2_scope not null,
  scope_id   uuid not null,
  role       public.v2_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, scope, scope_id)
);
create index membership_scope_idx on public.membership (scope, scope_id);

create table public.join_request (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profile (id) on delete cascade,
  scope      public.v2_scope not null,
  scope_id   uuid not null,
  work_email text not null check (work_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status     public.v2_request_status not null default 'pending',
  decided_by uuid references public.profile (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index join_request_one_pending on public.join_request (user_id, scope, scope_id) where status = 'pending';

create table public.ownership_dispute (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profile (id) on delete cascade,
  scope      public.v2_scope not null,
  scope_id   uuid not null,
  reason     text not null check (char_length(reason) between 10 and 2000),
  work_email text not null check (work_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status     public.v2_request_status not null default 'pending',
  decided_by uuid references public.profile (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- posts

create table public.post (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.board (id) on delete cascade,
  -- null author + source_url = seeded from a public source (GitHub, Reddit, X)
  author_id   uuid references public.profile (id) on delete set null,
  source_url  text check (source_url is null or source_url ~ '^https://'),
  type        public.v2_post_type not null,
  status      public.v2_post_status not null default 'open',
  title       text not null check (char_length(title) between 3 and 140),
  body        text not null default '' check (char_length(body) <= 10000),
  merged_into uuid references public.post (id) on delete set null,
  hidden_at   timestamptz,
  edited_at   timestamptz,
  created_at  timestamptz not null default now(),
  vote_count  integer not null default 0,
  reply_count integer not null default 0,
  search      tsvector generated always as (
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(body, '')), 'B')
              ) stored,
  check (merged_into is null or merged_into <> id),
  check ((status = 'merged') = (merged_into is not null))
);
create index post_board_idx   on public.post (board_id, created_at desc);
create index post_author_idx  on public.post (author_id);
create index post_top_idx     on public.post (vote_count desc, created_at desc);
create index post_search_idx  on public.post using gin (search);

create table public.vote (
  post_id    uuid not null references public.post (id) on delete cascade,
  user_id    uuid not null references public.profile (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index vote_user_idx on public.vote (user_id);

create table public.reply (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.post (id) on delete cascade,
  parent_id   uuid references public.reply (id) on delete cascade,
  author_id   uuid references public.profile (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 5000),
  is_official boolean not null default false,
  hidden_at   timestamptz,
  edited_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index reply_post_idx on public.reply (post_id, created_at);

create table public.status_event (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.post (id) on delete cascade,
  "from"     public.v2_post_status,
  "to"       public.v2_post_status not null,
  note       text check (note is null or char_length(note) <= 1000),
  actor_id   uuid references public.profile (id) on delete set null,
  at         timestamptz not null default now()
);
create index status_event_post_idx on public.status_event (post_id, at);

-- What a merge moved, so unmerge (step 8, within 10 minutes) can put it back exactly.
-- Server-only: RLS on, no policy.
create table public.merge_record (
  id             uuid primary key default gen_random_uuid(),
  source_post_id uuid not null references public.post (id) on delete cascade,
  target_post_id uuid not null references public.post (id) on delete cascade,
  prev_status    public.v2_post_status not null,
  moved_voters   uuid[] not null default '{}',
  merged_by      uuid references public.profile (id) on delete set null,
  merged_at      timestamptz not null default now(),
  undone_at      timestamptz
);

-- ---------------------------------------------------------------- following and notifications

create table public.follow (
  user_id    uuid not null references public.profile (id) on delete cascade,
  target     public.v2_follow_target not null,
  target_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target, target_id)
);
create index follow_target_idx on public.follow (target, target_id);

create table public.notification (
  id          uuid primary key default gen_random_uuid(),
  recipient   uuid not null references public.profile (id) on delete cascade,
  kind        public.v2_notification_kind not null,
  actor       uuid references public.profile (id) on delete set null,
  target_type text not null check (target_type in ('post', 'reply', 'board', 'hub', 'user')),
  target_id   uuid not null,
  post_id     uuid references public.post (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notification_recipient_idx on public.notification (recipient, created_at desc);

-- Absent row = enabled. Every email carries a one-click unsubscribe (email_token).
create table public.notification_pref (
  user_id uuid not null references public.profile (id) on delete cascade,
  kind    public.v2_notification_kind not null,
  channel public.v2_channel not null,
  enabled boolean not null,
  primary key (user_id, kind, channel)
);

-- Opaque per-user token behind /unsubscribe?token=. Server-only: RLS on, no policy.
create table public.email_token (
  user_id uuid primary key references public.profile (id) on delete cascade,
  token   uuid not null unique default gen_random_uuid()
);

-- ---------------------------------------------------------------- moderation

create table public.report (
  id         uuid primary key default gen_random_uuid(),
  target     public.v2_report_target not null,
  target_id  uuid not null,
  reason     text not null check (char_length(reason) between 3 and 1000),
  reporter   uuid not null references public.profile (id) on delete cascade,
  status     public.v2_report_status not null default 'open',
  decided_by uuid references public.profile (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter, target, target_id)
);
create index report_open_idx on public.report (status, created_at);

create table public.block (
  scope      public.v2_scope not null,
  scope_id   uuid not null,
  user_id    uuid not null references public.profile (id) on delete cascade,
  blocked_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (scope, scope_id, user_id)
);
