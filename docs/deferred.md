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

**Status:** 🔴 blocks deploy · **Deferred:** 2026-10-20 · **Issue:** #11

The database has **17 policies, all permissive (`using true`), zero auth-scoped**.
Anyone with the public anon key can `SELECT`/`INSERT`/`UPDATE`/`DELETE` every
table. `profiles` is the worst case: `email`, `role`, and `managed_org_id` are
client-writable, so any visitor can self-promote to `admin`.

**Deliberate because:** mid-rewrite, and open policies make local iteration
frictionless. Confirmed temporary with product owner.

**Revisit when:** before any public URL exists. This is MVP critical path item 2.

**The cost:** MVP definition-of-done check 7 ("cannot change own role to admin")
**currently fails**. While that is true, we do not ship.

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
