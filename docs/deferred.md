# Deferred Decisions Register

> **Purpose.** A single place to record things we deliberately did **not** fix now.
> Each entry is a decision with a known cost and a condition that should trigger
> revisiting it. This exists so nothing gets quietly dropped and nobody has to
> reconstruct why a shortcut was taken.
>
> **How to use this file**
> - Before taking a shortcut, add an entry. If it isn't written down, it isn't deferred — it's forgotten.
> - Re-read before any public launch or deploy.
> - When fixed, **do not delete** the entry. Mark it `✅ RESOLVED`, add the date and the PR/commit, and leave it as a record.
> - Order: open items first, newest at the top of each section. Resolved items at the bottom.
>
> **Status key:** 🔴 blocks deploy · 🟡 ship-with-risk · 🟢 cosmetic/minor

---

## Open

### D-006 · Posts are not publicly gated — RLS still permissive

**Status:** ✅ **RESOLVED 2026-10-20** (PR #16) · **Issue:** #11

Replaced all 17 permissive policies with 32 scoped ones: public `SELECT` on
content, `auth.uid()`-gated writes, recipient-only notifications,
admin/maintainer gates via `SECURITY DEFINER` helpers.

Two bugs found during the work, both fixed in migration `0007`:
- **Infinite recursion (`42P17`)** — policies on `profiles` that selected from
  `profiles` re-entered their own policy; every authenticated profile read
  returned 500. Anonymous reads looked fine only because RLS short-circuits for
  `anon`. Fixed with `is_admin()` / `manages_product()` as `SECURITY DEFINER`.
- **RLS cannot compare OLD vs NEW** — `WITH CHECK (auth.uid()::text = id)` still
  allowed a user to `PATCH` their own `role` to `'admin'`. Added a `BEFORE UPDATE`
  trigger `guard_profile_privileges` blocking changes to `role`,
  `managed_org_id`, `email`, `id` for non-admins.

**Verified:** 11/11 tests against the live project with real GoTrue sessions.
`anon` cannot post (401); cannot post as another user (403); cannot self-promote
(400); can edit own bio (200); `anon` can still browse (200).

**MVP definition-of-done check 7 now passes.**

---

### D-007 · Background rows for other users have no email in the client

**Status:** 🟢 cosmetic/minor · **Deferred:** 2026-10-20 · **PR:** #16

`profiles` is no longer publicly readable, because `email` was world-readable.
The feed now reads the **`public_profiles`** view, which omits `email`. The client
was updated to match:

- loader switched to `public_profiles`
- three `p.email.toLowerCase()` lookups guarded against empty strings, which
  would otherwise throw on other users' entries

**What still works:** handles, names, avatars, bios, roles, locations all render.
**What is absent:** `UserProfile.email` is `''` for anyone but the signed-in user.

**Revisit when:** any feature needs another user's email — password reset flows,
admin console lists, or export. Those need a `service_role` path or an admin-only
view, not a loosening of `profiles` RLS.

**The cost:** client code cannot rely on `profile.email` being populated for
other users. Guarded at every current call site.

---

### D-005 · Email confirmation disabled

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20 · **PR:** #15

`mailer_autoconfirm: true` on `publisense`, so signup issues a session
immediately and no confirmation email is attempted.

**Deliberate because:** **every SMTP field was unset** (`smtp_host`, `smtp_port`,
`smtp_user`, `smtp_admin_email`, `smtp_sender_name` all `None`). With confirmation
required, signup returned `HTTP 200` but **no session**, and no email was ever
sent — there was no mailer. Every new user was stranded permanently unconfirmed.

**Revisit when:** MVP critical path item 3. Choose:
- **A** — configure SMTP (Resend is already used for Ridgewood lead alerts), re-enable confirmation
- **B** — ship without confirmation and **remove the magic-link option from `AuthModal`**

**The cost:**
- no email verification — anyone can claim an address they don't own
- **magic-link sign-in is silently broken** (`signInWithMagicLink` exists in `StoreContext` and will fail)
- **no password reset**
- **no account recovery** — a user who forgets their password is locked out permanently

**Reversal:** `PATCH /v1/projects/wyjfgrgxmhumyzwcrywj/config/auth` with
`{"mailer_autoconfirm": false}` — only once SMTP is configured and testable.

---

### D-004 · Four page components are orphaned

**Status:** 🟢 cosmetic/minor · **Deferred:** 2026-10-20

`ExplorePage`, `OrgPage`, `ProductPage`, `SettingsPage` are fully built in
`src/pages/` and **imported by nothing**. `App.tsx` routes only `/`, `/p/:slug`,
`/post/:id`, `/u/:handle`. `/p/:slug` renders `HomePage`, not `ProductPage`.

**Deliberate because:** not required for the MVP loop to work.

**Revisit when:** there is time before announce — it is the cheapest win available
(four route entries).

**The cost:** substantial built UI is unreachable; `updateCurrentProfile` has no UI.

---

### D-003 · No tests

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20

Zero test files in the repo. Auth and post-creation were verified manually against
the live project (see PR #14), not by an automated suite.

**Deliberate because:** no suite is required to ship an MVP, and the auth surface
is settling.

**Revisit when:** immediately after first deploy. The signup→post loop is the
thing most likely to regress silently.

**The cost:** regressions in auth or RLS surface only in production.

---

### D-002 · `service_role` key exists with no server-side consumer

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20

The `service_role` key is provisioned and stored in the Notion API Keys DB. It
**bypasses all RLS**. Nothing in the app currently needs it — there is no API
route or edge function.

**Deliberate because:** it may be needed for admin operations later.

**Revisit when:** RLS is locked down (D-006). At that point decide whether
`service_role` is needed at all, or whether anon + policies suffice.

**The cost:** a live all-powerful credential sitting unused. Verified it is
**not** in the client bundle (`grep -c service_role dist` → 0), but blast radius
if ever leaked is total.

---

### D-001 · Old Firebase build still live at publisense-app.web.app

**Status:** 🟢 cosmetic/minor · **Deferred:** 2026-10-20

Release `1792065235443000` (2026-10-15) serves the **pre-Supabase** architecture
from GCP project `publisense-app`. It cannot receive V2 updates. V2 has never
been deployed anywhere.

**Deliberate because:** no deploy target chosen yet for V2.

**Revisit when:** MVP critical path item 4 (deploy). Decide whether to redeploy
V2 to Firebase Hosting (reuses URL) or stand up Vercel/Netlify and retire the
Firebase project.

**The cost:** a public URL serving a stale architecture that talks to Firestore.

---

## Resolved

_(nothing yet)_

---

## Related

- [`MVP.md`](../MVP.md) — what must ship, and what is explicitly out of scope
- [`roadmap.md`](../roadmap.md) — phases and open issues
