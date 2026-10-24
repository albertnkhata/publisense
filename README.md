# Publisense

A community feedback board: people post signals about the products they use and vote on what
matters; product makers claim their board (or a hub of boards) to answer, triage and ship.
React 19 + Vite + Tailwind 4 (locked theme) on the front end, Supabase (Postgres + RLS + Auth +
Storage + one Edge Function) behind it, deployed to Vercel.

Live at **https://publisense.app** (v2, since the cutover on 2026-10-24).

## Layout

| Path | What |
| :-- | :-- |
| [`web/`](./web) | **The app (v2).** Vite SPA with its own `package.json`. See [`web/README.md`](./web/README.md) for its layout and token naming |
| [`supabase/`](./supabase) | `schema.sql` plus every migration in `migrations/` (the applied history, in order), the `delete-account` Edge Function in `functions/`, and the SQL tests and local stubs in `tests/` |
| [`docs/v2/`](./docs/v2) | The v2 contract ([`FOUNDATION.md`](./docs/v2/FOUNDATION.md)), reference mockup, build checklist ([`BUILD.md`](./docs/v2/BUILD.md)) and cutover record ([`CUTOVER.md`](./docs/v2/CUTOVER.md)) |
| [`docs/deferred.md`](./docs/deferred.md) | Every decision to *not* do something, with the reason and the revisit trigger (`D-xxx`); entries are never deleted |
| [`docs/archive/`](./docs/archive) | v1 history: the frozen roadmap and MVP definition |
| [`scripts/status.mjs`](./scripts/status.mjs) | Generates [`STATUS.md`](./STATUS.md) and `status.json` |
| [`scripts/cutover/`](./scripts/cutover) | Backup, restore, verify and smoke tools used for the cutover (CUTOVER.md section 6) |
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | CI: v2 web gates, status ledger check, migrations and RLS gates |

v1 (the app that used to live at the repo root) is retired: its tables were dropped by
`0023_drop_v1.sql` and its code removed. The last commit with v1 code is `279a1da`.

## Running it

```bash
cd web
cp .env.example .env     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (anon key only, never service_role)
npm ci
npm run dev              # http://localhost:3001, primitives kit at /dev/kit
npm run typecheck
npm test
npm run check-style      # no arbitrary values, raw hex or inline styles
npm run build
npm run check-classes    # after build: every utility class produces CSS
```

From the repo root (plain `node`, no dependencies, no root `package.json`):

```bash
node scripts/status.mjs          # regenerate the repo-derived block of STATUS.md
node scripts/status.mjs --live   # + production probes (network; optional creds unlock more)
node scripts/status.mjs --check  # what CI runs: fails if STATUS.md is stale
```

`STATUS.md` is generated. Do not hand-edit it: CI fails if the committed copy disagrees with
its sources (`docs/v2/BUILD.md`, `docs/deferred.md`, `docs/archive/roadmap.md`, `ci.yml`).

## Deploy

Vercel project **`publisense-v2`** builds from `web/` (Root Directory `web`, framework Vite,
config in [`web/vercel.json`](./web/vercel.json)) and serves `publisense.app`,
`www.publisense.app` (308 to the apex) and `v2.publisense.app`. A merge to `main` deploys.

## Database

Supabase project `wyjfgrgxmhumyzwcrywj`. Schema changes are numbered SQL files in
`supabase/migrations/`; never edit one that has been applied, add the next number instead.
0004–0023 are recorded in `supabase_migrations.schema_migrations`.

CI rebuilds a database from scratch on every PR: a stub of Supabase's `auth` schema and API
roles plus [`supabase/tests/supabase_stub.sql`](./supabase/tests/supabase_stub.sql), then
`schema.sql` and every migration in order, then asserts RLS is on for every public table and no
write policy is world-open, runs [`v2_rls_test.sql`](./supabase/tests/v2_rls_test.sql) as the real
API roles, and applies the dev seed twice. The client bundle is also grepped for `service_role`.

## License

**Proprietary. Source available for viewing only.** See [`LICENSE`](./LICENSE).

This repository is public so its history, tests and design can be read. That is not a
grant of rights: no permission is given to run it, host it, reuse it in another project,
redistribute it, or train a model on it. Any other use needs written permission from the
copyright holder. It is deliberately **not** an OSI-approved open source license, so
GitHub will not show a license badge — that is the intended state, not a missing file.
