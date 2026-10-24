# Publisense v2: cutover runbook (step 9)

> **Status:** applied, 2026-10-24. v2 serves `publisense.app`, the v1 tables are dropped and the v1
> code is removed. What was actually done, with times, is in [section 0](#0-outcome-2026-10-24); the
> rest of this document is the plan as written before cutover, kept as the record. Step 9 in
> [`BUILD.md`](./BUILD.md) is ticked.

Contents: [0 Outcome](#0-outcome-2026-10-24) · [1 What was checked](#1-what-was-checked-2026-10-24) · [2 What v1 holds](#2-what-v1-holds-and-what-happens-to-it) ·
[3 Decisions before cutover](#3-decisions-the-owner-makes-before-c1) · [4 Steps](#4-the-cutover-in-order) ·
[5 Rollback](#5-rollback) · [6 Tools](#6-tools-in-scriptscutover)

---

## 0. Outcome (2026-10-24)

Times are CAT (UTC+02:00).

| Step | What was done |
|---|---|
| C3 · Domain switch | About **15:07**: `publisense.app` and `www.publisense.app` moved from the v1 Vercel project `publisense` to **`publisense-v2`** (builds from `web/`, Root Directory `web`, Vite). `v2.publisense.app` stays on `publisense-v2` |
| C4 · Drop v1 | About **15:22**: `supabase/migrations/0023_drop_v1.sql` applied to production. v1 tables, view, functions and the v1 signup trigger are gone; `email_log` and `email_delivery` kept as planned |
| Migration history | Recorded in `supabase_migrations.schema_migrations` for **0004–0023** (they had been applied by hand) |
| Decision 4 · `ci_probe` | **Left in production** (not dropped) |
| Decision 5 · v1 Vercel project | Being disconnected from Git separately, so its builds do not fail on `main` now that v1 code is gone |
| C5 · Remove v1 code | PR `v2/remove-v1`: root `src/`, the root Vite/TS/Vitest/package files, root `index.html`/`public/`/`vercel.json`/`.env.example`, `landing-mockup.html`, `scripts/smoke-live.mjs` and the v1 CI job removed. `supabase/schema.sql` and every migration kept (CI rebuilds from them; 0023 removes v1 at the end). `MVP.md` and `roadmap.md` moved to `docs/archive/`. The last commit with v1 code is `279a1da` |
| Decision 6 · layout | v2 **stays in `web/`**; no Vercel change |
| C6 · Close step 9 | Step 9 ticked in `BUILD.md`; `STATUS.md` regenerated |

Not recorded here: which backup directory C1 produced, and the owner's choice on decision 1
(D-011 stays open in `docs/deferred.md` until it is made) and on the optional redirect clean-up
(decision 3). Rollback after C4 is R2 (`v1_restore.sql` from the C1 backup).

---

## 1. What was checked (2026-10-24)

All of it read-only. SQL went through the Management API with `read_only: true`, which runs as
`supabase_read_only_user` inside a read-only transaction (a `create table` is refused there).

| Check | Result |
|---|---|
| Backup | Logical backup of `public`, `ci_probe`, `storage.buckets/objects`, `auth.users/identities/mfa_factors`: restored into local Postgres 17.11; 49/49 table row counts, row-content hashes of all 45 public/ci_probe/storage tables, and the md5 of every function, policy, trigger, constraint, index, column, view and table/column/function grant match production |
| Supabase's own backups | `GET /database/backups`: `backups: []`, PITR off. **Our logical backup is the only one** |
| `pg_dump` against production | Not possible without the DB password (the pooler config shows `[YOUR-PASSWORD]`), and resetting it is out of scope. The backup's custom-format `.dump` is taken from the verified local restore instead |
| v2 SPA routes (`/`, `/explore`, `/search?q=figma`, `/b/figma`, `/b/cursor`, `/h/figma`, `/u/:handle`, `/settings`, `/auth/reset`, `/unsubscribe`, `/privacy`, `/terms`, `/admin/reports`, `/admin/disputes`, `/admin/team`, `/notifications`) | 200 and the SPA shell on `v2.publisense.app` |
| v2 bundle | Contains step 8 (`admin/team`, `unmerge_post`, `release_scope`), points at `wyjfgrgxmhumyzwcrywj`, no `service_role` |
| v1 | `publisense.app` 200 (v1 bundle); `www.publisense.app` 308 → apex |
| Anon through PostgREST | Reads 14 boards, 1 hub, posts (0 rows); `platform_admin`, `email_token`, `verified_domain`, `membership`, `notification`, `report` refused (401); insert into `post`/`board` and update of `board` refused (401) |
| `delete-account` Edge Function | 401 without auth and with only the publishable key |
| Browser (Playwright, desktop 1440×900 and iPhone 13) | Home, Explore, Figma and Cursor boards, Figma hub, search: right `h1`, 0 console errors, no write request attempted. The board and hub pages show two cancelled `HEAD` count requests (`ERR_ABORTED`, cancelled by the page, not by the test); the counts still render |
| RLS | On for every public table; no world-open write policy |
| v2 objects | All 61 functions declared in 0016–0022 exist; 2 platform admins; 14 boards (3 in the Figma hub, 0 claimed); the 3 auth users all have a v2 `profile` |
| v1 dependencies | No FK between v1 and v2 tables in either direction. Only v1 objects depend on v1 tables, **except `email_log`** (below) |

**Finding that shapes 0023:** `email_log` was created for v1 (0015), but v2's `v2_send_code`
(0021) writes every domain-code email attempt to it. It is shared infrastructure now, so 0023
keeps it (and the `email_delivery` view over it), swaps its admin policy from v1's `is_admin()`
to `is_platform_admin()`, and narrows its grants (anon had every privilege, held back only by RLS).

## 2. What v1 holds and what happens to it

Production row counts on 2026-10-24. Everything is in the backup and in `v1_restore.sql`.

| v1 table | Rows | Who made them | Fate at C4 |
|---|---|---|---|
| `posts` | 8 | all 8 by fixture personas (`usr-*`) — D-011 | dropped, kept in backup |
| `comments` | 9 | all fixture | dropped, kept in backup |
| `post_votes` | 4 | all fixture | dropped |
| `post_reposts` | 1 | one owner account | dropped |
| `follows` | 5 | all fixture (`usr-albert`) | dropped |
| `profiles` | 10 | 7 fixture personas (`@publisense.invalid`) + 3 owner accounts | dropped; the 3 owners already have v2 `profile` rows |
| `products` | 13 | seed | dropped; v2 has its own 14 `board` rows. v1-only products: perplexity, framer, obsidian, spotify. v2-only boards: github-copilot, windsurf, vercel, figjam, figma-slides |
| `organizations` | 7 | seed | dropped; v2 has the Figma `hub` |
| `notifications`, `comment_votes`, `claim_decisions` | 0 | — | dropped |
| `email_log` | 0 | v1 + v2 | **kept** (see above) |
| views `public_profiles` / `email_delivery` | — | — | dropped / **kept** |
| 11 v1 functions, trigger `on_auth_user_created` on `auth.users` | — | — | dropped; only `v2_on_auth_user_created` stays |

**Nothing is migrated into v2 by default.** Every v1 post, comment and vote is fixture content
(D-011). Moving it would make it look more real, not less: a v2 post with no author must carry
a `source_url` to a public source (FOUNDATION section 6), and these have none. So v2 opens with
0 posts unless the owner decides otherwise (decision 1).

The `ci_probe` schema (10 tables, a copy of v1 from CI probing; 7 rows) is neither v1 product data
nor v2. 0023 leaves it alone (decision 4).

## 3. Decisions the owner makes before C1

1. **D-011, content at launch.** v2 has 0 posts. Options: (a) launch empty, which is the honest
   default and resolves D-011's exposure; (b) seed real posts with `author_id = null` and a
   `source_url` to the public issue/thread they came from, before announcing; (c) migrate the
   v1 fixture posts (not recommended: no sources, invented personas). D-011 then gets status
   *resolved* (a/b) or stays open (c).
2. **When to drop v1 (C4).** Recommended: after a soak of at least 24–48 h on v2 with no rollback.
   Until C4, rollback is a domain swap; after it, it is a restore.
3. **Old auth redirect entries.** Site URL stays `https://publisense.app` (no change needed:
   v2 sends `redirectTo` from `window.location.origin`, and `publisense.app/**` is already
   allowed). Optional clean-up after C6: drop the v1-only `https://publisense.vercel.app/**`
   and `http://localhost:5173/**` from the redirect allow list.
4. **`ci_probe` schema.** Drop it (`drop schema ci_probe cascade;`, in the backup) or keep it.
5. **The v1 Vercel project `publisense`.** Keep it without domains as the rollback target
   until C4 + a few days, then disconnect Git (or delete it). Its `ignoreCommand` builds on
   every non-doc change to `main`, so once v1 code is removed (C5) its builds fail: disconnect
   or pause it before C5 merges.
6. **Repo layout after v1 code goes (C5).** Keep v2 in `web/` (no Vercel change) or move it to
   the root (then `publisense-v2`'s Root Directory changes too).

## 4. The cutover, in order

Times are the owner's call; nothing is scheduled. "Owner" means it needs the Vercel or Supabase
dashboard; "Hark" means it can run from the shell.

### C0 · Freeze (owner)
No deploys to either Vercel project and no migrations from here to C3 verified.

### C1 · Fresh backup, verified (Hark)
```bash
python3 scripts/cutover/dump.py backups/publisense-$(date -u +%Y%m%dT%H%M%SZ)
scripts/cutover/restore.sh <that dir>              # local PG17: row counts must match
python3 scripts/cutover/verify.py restore_test     # every check: diffs=0
scripts/cutover/make_v1_restore.sh restore_test <that dir>/v1_restore.sql
```
Stop if any count or check differs. Keep the directory somewhere outside the sandbox too.

### C2 · Pre-switch smoke (Hark)
```bash
scripts/cutover/smoke.sh https://v2.publisense.app https://publisense.app   # 31 checks
node scripts/cutover/smoke-browser.mjs desktop && node scripts/cutover/smoke-browser.mjs mobile
```

### C3 · Domain switch (owner, Vercel dashboard)
1. Project **publisense** → Settings → Domains: remove `www.publisense.app`, then `publisense.app`.
2. Project **publisense-v2** → Settings → Domains: add `publisense.app` (Production) and
   `www.publisense.app` set to *Redirect to publisense.app (308)*, as today. Keep
   `v2.publisense.app`. If both projects are in the same Vercel team (they appear to be: the
   auth allow list names `pilgrim360s-projects`; not checked in the dashboard), DNS does not change
   and Vercel moves the certificate itself. If they are not, Vercel shows the DNS record to add.
3. Supabase: **no change.** Site URL is already `https://publisense.app`; the redirect allow list
   already has `publisense.app/**`, `www.publisense.app/**` and `v2.publisense.app/**`.
   Google OAuth's callback is Supabase's (`*.supabase.co/auth/v1/callback`), so it is unaffected.
4. Verify (Hark): `scripts/cutover/smoke.sh https://publisense.app` and the browser smoke with
   `BASE=https://publisense.app`; the served bundle equals `v2.publisense.app`'s.
5. Verify (owner, real account): Google sign-in returns to `publisense.app`; *Forgot password*
   mail links to `https://publisense.app/auth/reset`; a new email signup gets a v2 profile.

Undo: R1.

### C4 · Drop v1 (Hark or owner, after the soak; decision 2)
1. Repeat C1 (fresh, verified backup and `v1_restore.sql`).
2. Apply `supabase/migrations/0023_drop_v1.sql` as `postgres` (SQL editor, or psql). It runs in
   one transaction, uses no `CASCADE`, and ends by asserting that no v1 relation or trigger is
   left, that `v2_on_auth_user_created` exists and that `email_log` survived; any failure rolls
   it all back. Tested: CI chain (`schema.sql` + 0004…0023, RLS gates, `v2_rls_test.sql`, dev seed
   twice) all pass; on a restored copy of production it leaves exactly the 24 v2 relations and 61
   functions, and a test signup still gets a v2 profile.
3. Verify: `smoke.sh https://publisense.app`; the step-2 integrity queries (RLS everywhere,
   61 v2 functions, 2 admins, 14 boards).
4. Optional: record 0016–0023 in `supabase_migrations.schema_migrations` (they were applied by hand).

Undo: R2.

### C5 · Remove v1 code (Hark, one PR, CI green)
Delete root `src/`, the root Vite/TS/package files the v1 app uses, the v1 `build` job in
`ci.yml` and `scripts/smoke-live.mjs` (it exercises v1 tables). Keep `supabase/schema.sql` and
every migration: CI rebuilds the database from them, and 0023 removes v1 at the end. Update
`STATUS.md`/`status.mjs` if they read v1 files, give `docs/deferred.md` entries their v2
status (FOUNDATION section 12), and do decision 6. Do decision 5 first.

### C6 · Close step 9 (Hark)
Tick step 9 in `BUILD.md`, link this runbook's outcome, regenerate `STATUS.md`.

## 5. Rollback

| When | How | What is lost |
|---|---|---|
| **R1**: after C3, before C4 | Swap the domains back (C3 in reverse). Nothing in the database changes | Nothing. Anything written through v2 meanwhile stays in v2 tables (v1 does not show it). Both signup triggers are still live, so a user who signed up meanwhile has a v1 and a v2 profile |
| **R2**: after C4 | `psql -1 -f <backup>/v1_restore.sql` as `postgres`, then R1. It recreates the 11 v1 tables with their rows, the view, the 11 functions, the v1 signup trigger and the v1 `email_log` policy/grants. Tested locally: 0023 then `v1_restore.sql` returns a production copy to a state identical to production on every check in `verify.py` | v1 rows written after the backup (none, v1 is off the domain from C3). Users who signed up after C4 have no v1 profile; the script lists them with a notice |
| **R3**: anything worse | Restore `schema.sql` + `data.sql` from the backup into an empty `public` (or a new project), then re-enter the `resend_api_key` Vault secret | Everything after the backup |

## 6. Tools in `scripts/cutover/`

| File | What it does | Writes to production? |
|---|---|---|
| `sbq.py` | SQL through the Management API with `read_only: true` | No (read-only transaction) |
| `dump.py <dir>` | Logical backup: DDL, rows as JSON and as a portable `data.sql`, exact counts, metadata (Vault secret names, never values) | No |
| `restore.sh <dir> [db]` | Loads a backup into a scratch local Postgres 17 (with `restore_harness.sql` stubs for auth, storage, pg_net, vault) and compares row counts | No (local only) |
| `verify.py [db]` | md5 comparison of every object, grant and table's rows: local restore vs production | No |
| `make_v1_restore.sh <db> <out>` | Builds the R2 rollback script from a local restore | No (local only) |
| `smoke.sh [v2] [v1]` | 31 HTTP/API checks; the only writes it tries are anon writes the API refuses | No |
| `smoke-browser.mjs` | Playwright desktop + mobile load, screenshots, console errors; aborts any non-GET to Supabase | No |

## 7. Since cutover

The counts above are as verified on cutover day. Migration 0025 (2026-10-24) later renamed the Windsurf board to Devin Desktop (windsurf.com now redirects to devin.ai/desktop) and removed the Arc board (Arc retired, no posts or follows), so production seeds 13 boards.
