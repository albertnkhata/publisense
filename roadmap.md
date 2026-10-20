# Publisense — Roadmap

> **Status note.** This roadmap was **reconstructed on 2026-10-19** from verifiable
> repository evidence: git commit subjects, routed paths, `StoreContext` capability
> surface, the applied Supabase schema, and open GitHub issues. It is **not** the
> original document — that one existed only inside a Gemini session and was never
> written to disk. Anything below that cannot be traced to code, schema, or an
> issue is marked *(inferred)*. Treat phase names and shipped items as fact;
> treat sequencing and intent as best-effort reconstruction.
>
> Verify or replace this once the original is recovered.

---

## Where the product stands

**Architecture:** React 19 + Vite 6 + Tailwind 4, Supabase (Postgres + Auth) backend.
Firebase/Firestore was **removed entirely** in `7e0b0b0` — no Firestore rules,
no client config, no `firebase.ts`. Supabase is the canonical backend.

**Database:** project `wyjfgrgxmhumyzwcrywj`, org *Publisense*, region `eu-central-2`.
9 tables, seeded with 48 rows (7 orgs / 13 products / 7 profiles / 8 posts /
9 comments / 4 votes).

**Build:** `tsc --noEmit` 0 errors; `vite build` clean at 603 kB (171 kB gzip),
down from 1.13 MB on the Firebase version.

---

## Phase 0 — Foundation ✅ shipped

Commit `7e0b0b0` — *port high-craft open index UI, full-width signal cards, and live Supabase schema*

- Full-width signal card layout
- Open index (public read model — anyone can browse without an account)
- Supabase schema authored and applied to `publisense`
- Seed dataset for a browsable prototype
- Firebase removal

---

## Phase 1 — Open index loop ✅ shipped

Commit `8e14f54` — *add real Supabase auth and Phase 1 open index loop*

**Auth surface** (all in `StoreContext`):
- password sign-in / sign-up
- magic link
- OAuth — GitHub and Google
- profile sync on first sign-in (`syncSupabaseUserToProfile`)

**Open index mechanics:**
- inline indexing (compose without leaving the feed — `InlineComposer`)
- workaround voting (comments carry `kind: 'workaround'`)
- duplicate detection
- live 7-day velocity score driving a trending-products ranking (`HomePage`)

---

## Phase 2 — Identity & persistence ✅ shipped

Commit `4d3acda` — *complete Phase 2*

- Signal permalinks — `/post/:id` → `PostDetailPage`
- Contributor portfolios — `/u/:handle` → `ProfilePage`
- In-app notifications drawer (`AppShell`), with `markNotificationRead` /
  `markAllNotificationsRead`

---

## Phase 3 — Maintainer tools ✅ shipped

Commit `9a28a30` — *complete Phase 3 (domain-verified board claiming, inline maintainer triage on SignalCard, and Shipped rollup changelog)*

- **Board claiming** — `claimProductBoard(productId, {workEmail, roleTitle, verificationMethod})`. Two verification paths: `email_domain` (must match the product's org domain) and `dns_txt`.
- **Inline maintainer triage** — on `SignalCard`, gated by `canManageProduct`. Status selection plus an official note, saved in place without leaving the feed.
- **Shipped rollup changelog** — a `shipped` tab on the feed listing resolved signals, plus per-product counts ("Community requests resolved & shipped by …").

---

## Phase 3b — Wire the orphaned pages *(inferred — not shipped)*

Verified after `9a28a30`: `App.tsx` still routes only `/`, `/p/:slug`, `/post/:id`, `/u/:handle`.

Four page components exist in `src/pages/` and are **imported by nothing**:

| Component | Status | Notes |
|---|---|---|
| `ExplorePage.tsx` | built, **orphaned** | no route, no importer |
| `OrgPage.tsx` | built, **orphaned** | no route, no importer |
| `ProductPage.tsx` | built, **orphaned** | `/p/:slug` renders `HomePage`, not this |
| `SettingsPage.tsx` | built, **orphaned** | `updateCurrentProfile` exists, no UI route |

Closing this is the cheapest meaningful gain: the code exists, only routing is missing.

---

## Phase 4 — Security & correctness 🔴 blocking any deploy

**This is the gate before the app can face the public.** See [`MVP.md`](./MVP.md)
for the shipping criteria this feeds into.

- **RLS lockdown** — issue #11. The database currently has **17 policies, all
  permissive (`using true`), zero auth-scoped**. Anyone holding the public anon
  key can `SELECT`/`INSERT`/`UPDATE`/`DELETE` every table. Confirmed temporary by
  product owner; not acceptable for production.
- **`profiles` write exposure** — worst case of the above. `email`, `role`, and
  `managed_org_id` are client-writable, so any visitor can self-promote to `admin`
  or change another user's email.
- **`notifications` is openly readable** — exposes every user's notification set.
- **No `handle_new_user` trigger** — `posts.author_id`, `comments.author_id`,
  `post_votes.user_id`, `follows.follower_id`, and both `notifications` FKs all
  reference `profiles(id)`, but nothing creates a profile row on signup. A new
  user's first write fails on foreign key. Signup is broken end-to-end until this
  is added.
- **No tests** — zero test files in the repo.

---

## Phase 5 — Deploy 🔴 not started

- No deploy target for the V2 build. The only live artifact is the **old
  Firebase/Firestore build** at https://publisense-app.web.app (release
  `1792065235443000`, deployed 2026-10-15). It serves the pre-Supabase
  architecture and cannot receive V2 updates without deliberate action.
- Decide: redeploy V2 to Firebase Hosting (reuses the URL), or stand up a
  Supabase-appropriate host (Vercel/Netlify) and retire the Firebase project.
- Production env vars: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  belong client-side. `service_role` and the DB password must stay server-only.

---

## Phase 6 — Hardening *(inferred)*

- **Bundle size** — issue #9. 603 kB single chunk, over Vite's 500 kB warning.
  Route-level code splitting would cut first paint materially now that pages are
  cleanly separated.
- **Documentation** — the repo contains **no markdown at all**. No README, no
  docs. This is why the original roadmap was lost.
- **Error/empty states** — not yet reviewed.

---

## Known unknowns

Items that may have been in the original roadmap but leave no trace in the repo:

- Moderation & abuse handling for a public write surface
- Email deliverability for magic links (SMTP not configured)
- Analytics / measurement
- Rate limiting on posts, comments, votes
- Image/media upload for `posts.media_urls`

---

## Open issues

- **#9** — bundle size / code splitting
- **#11** — restrict world-writable RLS policies before deploy *(blocks deploy)*
