# Publisense

A community feedback board: product makers claim their board, users post signals and upvote
what matters. React 19 + Vite + Tailwind 4 on the front end, Supabase (Postgres + RLS + GoTrue)
behind it, deployed to Vercel.

Live at **https://publisense.app**.

## Start here

| File | What it answers | Maintained by |
| :-- | :-- | :-- |
| [`STATUS.md`](./STATUS.md) | What is true *right now* — open decisions, phases, gates, production probe, data counts | **generated** by `scripts/status.mjs` |
| [`roadmap.md`](./roadmap.md) | What we intend to build, phase by phase | hand-written |
| [`docs/deferred.md`](./docs/deferred.md) | Every decision we made to *not* do something, with the reason and the revisit trigger (`D-xxx`) | hand-written, entries never deleted |
| [`MVP.md`](./MVP.md) | The line that had to be crossed to call it shippable | hand-written, historical |

`STATUS.md` is derived from the other three plus the live project, so it cannot drift the way
prose does. Do not hand-edit it — CI fails if the committed copy disagrees with its sources.
Issues and PRs stay in GitHub; `STATUS.md` indexes them rather than restating them.

## Running it

```bash
npm ci
npm run dev          # http://localhost:3000
npm test             # vitest
npm run typecheck
npm run build

npm run status           # regenerate the repo-derived ledger
npm run status -- --live # + production probes (needs network; optional creds unlock more)
npm run smoke:live       # 14 RLS/auth checks against production, throwaway user, self-cleaning
```

`smoke:live` needs the service role and is therefore **not** in CI — it is a deliberate
pre-ship step, flagged as such in `STATUS.md`.

## A note on what the numbers mean

The catalogue in production is currently seeded demo content, not members. `STATUS.md` prints the
seeded-versus-real split every time it refreshes, because the difference between "8 posts" and
"8 posts from nobody" is the whole story (see `D-011`).
