# Publisense — MVP Definition

> **Purpose.** This document exists to stop the project getting bogged down. It
> defines the smallest version that can ship to real users and serve a real
> purpose, and it explicitly lists what is **out of scope**. If work is not on
> the "must" list, it waits.
>
> Agreed 2026-10-20. Revisit only by deliberate decision, not by drift.

---

## The MVP in one sentence

> **A public, browsable index of product feedback where anyone can read and
> anyone signed in can post a signal, comment, and upvote — and maintainers can
> triage and mark things shipped.**

That is it. Everything else is post-MVP.

---

## The one question that decides scope

For any proposed feature, ask:

> **"Can a stranger find a product, post a real piece of feedback, and see a
> maintainer respond — without any of the missing pieces?"**

If yes with the current build, the feature is **not MVP**.

---

## Must ship (the gate)

These are non-negotiable. Without any one of them, the MVP does not ship.

### 1. Security — RLS locked down
Issue #11. Currently **17 policies, all permissive (`using true`), zero
auth-scoped**. Must become auth-aware before any public URL exists.

Minimum acceptable:
- `posts`, `comments`, `post_votes`, `post_reposts`, `follows` — writes require
  `auth.uid()`; reads stay public
- `profiles` — **self-write only**; `email`, `role`, `managed_org_id` not
  client-writable
- `notifications` — readable only by recipient
- `organizations`, `products` — reads public; writes restricted to admins

### 2. Signup actually works
No `handle_new_user` trigger exists. `posts.author_id`, `comments.author_id`,
`post_votes.user_id`, `follows.follower_id`, and both `notifications` FKs
reference `profiles(id)`, but nothing creates that row on signup. **A new user's
first write fails on foreign key.** This is currently broken end-to-end and must
be fixed with a trigger on `auth.users`.

### 3. Auth email deliverability
Magic links and email confirmation require working SMTP. If signup depends on a
confirmation email that never arrives, nobody onboards. Either configure Supabase
SMTP, or ship password + OAuth only and **disable** magic-link/confirmation
paths so they aren't offered-but-broken.

### 4. A deploy target
V2 has never been deployed. The only live site is the old Firebase build at
`publisense-app.web.app`, which cannot receive V2 updates. Pick one host and ship
it. Vercel or Netlify is likely cleanest given Supabase is the backend.

### 5. Production env hygiene
Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` client-side.
`service_role` and the DB password must never enter the bundle. Verified today:
0 occurrences of `service_role` in the build.

---

## Should ship (high value, cheap)

Do these if they're quick. Don't let them block.

- **Wire the orphaned pages** — `ExplorePage`, `OrgPage`, `ProductPage`,
  `SettingsPage` are fully built and imported by nothing. Four routes. Cheapest
  win available.
- **Empty/error states** — a public index with no data must not look broken.
- **Bundle splitting** — 603 kB single chunk (issue #9). Route-level lazy imports;
  pages are already cleanly separated.

---

## Explicitly out of scope for MVP

Named so nobody relitigates them mid-build:

- **Moderation & abuse tooling** — no reporting, no auto-hiding, no rate limiting
  beyond Supabase defaults. Accepted risk for a first release.
- **Media/image upload** — `posts.media_urls` stays empty. Text first.
- **Notifications delivery by email** — in-app drawer only.
- **Dedicated `OrgPage` polish** — org layer exists in schema; a beautiful org
  page is post-MVP.
- **DNS TXT board verification** — the `email_domain` path is enough. `dns_txt`
  can ship unusable.
- **Search / filtering beyond what exists** — current feed filters suffice.
- **Analytics, dashboards, leaderboards.**
- **Mobile app / PWA.**
- **Theming, animation, visual polish passes.**
- **Tests beyond a smoke check** — no suite required to ship, though auth +
  post creation should be manually verified end-to-end.
- **Migrating the old Firebase data** — prototype seed only; nothing to migrate.

---

## Definition of done

The MVP ships when, on a public URL, a stranger can:

1. Open the site and browse products and signals **without an account**
2. Sign up, and **immediately** post a signal (proves the profile trigger works)
3. Comment on someone else's signal
4. Upvote and see the count change
5. See a maintainer's triage status and official note on a signal
6. Be unable to delete or edit anyone else's content
7. Be unable to change their own `role` to `admin`

Point 7 is the security test. If it fails, we do not ship.

---

## Sequencing

1. **Fix signup** (trigger) — nothing works without it
2. **Lock RLS** — cannot face public before this
3. **Decide auth email** — configure SMTP or disable those paths
4. **Deploy** — get V2 on a real URL
5. **Wire orphaned pages** — if time allows before announce
6. **Smoke test the 7 points above**
7. **Announce**

Steps 1–4 are the critical path. 5 is optional-but-cheap. 6 is non-negotiable.

---

## What "bogged down" looks like — early warnings

Watch for these. Each is a signal to cut scope, not push the date:

- spending more than a day on visual polish before deploy
- adding a feature because it's "almost free"
- building moderation before there is anything to moderate
- refactoring `StoreContext` for elegance
- discussing the roadmap instead of executing the critical path
