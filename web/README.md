# Publisense v2 (`web/`)

The v2 rebuild. Contract: [`docs/v2/FOUNDATION.md`](../docs/v2/FOUNDATION.md); look and behaviour:
[`docs/v2/reference-mockup.html`](../docs/v2/reference-mockup.html); progress: [`docs/v2/BUILD.md`](../docs/v2/BUILD.md).

v1 (repo root `src/`) keeps serving publisense.app until cutover (step 9). Nothing here touches it.

```bash
cd web
npm ci
npm run dev            # http://localhost:3001, kit at /dev/kit
npm run typecheck
npm test
npm run check-style    # arbitrary values, raw hex, inline styles
npm run build
npm run check-classes  # after build: every utility class produces CSS
```

## Layout

| Path | What |
|---|---|
| `src/styles/theme.css` | The locked theme: `@theme { --*: initial; … }` plus light/dark colour variables. The only file allowed raw colours. |
| `src/ui/` | Primitives (FOUNDATION §4). Each owns its keyboard and ARIA behaviour. |
| `src/shell/` | AppShell: NavRail, TopBar, RightRail, TabBar, avatar menu, AuthDialog (`useAuthDialog`, `useRequireAuth`). |
| `src/pages/` | Route screens. Settings, `/auth/reset`, `/unsubscribe`, `/privacy` and `/terms` are real (step 4); the rest are placeholders until their step. `/dev/kit` shows every primitive in both themes. |
| `src/api/` | The only code that talks to Supabase (anon key only): auth, session, profile and avatar, notification preferences, unsubscribe, export, delete-account. |
| `src/lib/` | Theme, the viewer (Supabase session + `profile` row), hooks. |
| `scripts/` | `check-style.mjs` and `check-classes.mjs`, run in CI. |

## Token naming

Utilities exist only for theme tokens. Spacing utilities use the FOUNDATION `--s-N` scale, so
`p-4` is 16px but `h-8` is 40px and `size-10` is 64px (not `N × 4`). Layout sizes have names:
`w-nav`, `w-nav-collapsed`, `w-gutter`, `h-row`, `max-w-content`, `w-rail`.
Colours: `bg-page|card|subtle|elevated`, `border-line|line-strong`, `text-ink|ink-secondary|ink-muted`,
`bg-brand|brand-hover|brand-soft`, `text-success|warning|danger`. Board colour comes from data:
`style={{ '--board-color': board.color }}` with `bg-board`.

Breakpoints are max-width variants: `max-sm:` (<520), `max-md:` (<720), `max-lg:` (<1060).

## Auth in development

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set (see `.env.example`), the app uses the
real session. Without them, a dev build lets `/dev/kit` flip a local signed-in preview; production
builds never include that toggle. Tests render either state with `<ViewerProvider initial={…}>` or
`StaticViewerProvider` and mock the api layer.

Password-reset links ask to land on `/auth/reset`. That URL (and each preview origin you test from)
must be in the Supabase project's redirect allow-list, or Supabase falls back to the Site URL; the
app still recognises the recovery there and routes to `/auth/reset`.

Delete account calls the `delete-account` Edge Function (`supabase/functions/delete-account/`),
deployed separately with `supabase functions deploy delete-account --project-ref <ref>`.
