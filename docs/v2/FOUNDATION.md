# Publisense v2: foundation

> **Status:** proposed, 2026-10-24. This is the contract for the v2 rebuild.
>
> **Precedence.** For how things look, what they say and how they behave, the reference mockup
> ([`reference-mockup.html`](./reference-mockup.html), v80) wins. For structure (tokens, primitives,
> data model, permissions), this document wins. The mockup was built by iteration, so its *code* is
> not a template: it is a picture of the product. The current `src/` is discounted. v2 replaces it,
> and nothing in it is a constraint unless this document keeps it on purpose.

---

## 1. What v2 keeps from the current repo

| Keep | Why |
|---|---|
| Vercel project, `publisense.app`, `vercel.json` SPA rewrites | Already live and verified |
| Supabase project `wyjfgrgxmhumyzwcrywj` with its auth config (Google client, Resend SMTP from `auth@publisense.app`, reset redirect) | Took real work to get right; it lives outside the code |
| CI gates: typecheck, tests, build, *no service_role in the bundle*, *RLS on every table*, *no world-open write policy* | Cheap insurance; they apply to v2 unchanged |
| SQL patterns: `handle_new_user` trigger, `guard_profile_privileges`, `security definer` RPCs that return `{ ok, error }` | Proven. They get rewritten against the v2 schema, not copied |
| `authCapabilities` idea: render only the sign-in methods the project actually has enabled | Avoids buttons that can only fail |

**Coexistence.** v1 keeps serving `publisense.app` from the same Supabase project until cutover. v2 tables are **additive** in `public`: nothing v1 reads is dropped or altered before step 9. v2 table names are singular (`post`, `reply`, `vote`, `board`…), so they never clash with v1's plural tables, so keep that convention. The v2 signup trigger is added only once v2 tables exist, and a v1 signup is re-tested afterwards, because both triggers fire on every signup. At cutover: `pg_dump` snapshot, then drop the v1 tables.

Everything else (the components, `StoreContext`, the CSS, seed data, the type and severity model, the old schema) is replaced.

## 2. Stack

- React 19 + TypeScript + Vite. The repo already uses them, and nothing in the mockup argues against them.
- **Styling:** Tailwind 4 with a **locked theme**. `src/styles/theme.css` opens its `@theme` block with `--*: initial`, which clears Tailwind's default palette, type scale, radii and spacing, then defines only the tokens in section 3. Utilities therefore exist only for our values (`bg-card`, `text-ink-muted`, `rounded-md`, `text-sm`). Light and dark switch by redefining the same CSS variables under `[data-theme=dark]`. Long class strings live inside primitives (section 4), so screens compose primitives rather than repeating utilities. The mockup's semantic CSS is translated, not copied.
- **Routing:** `react-router` with real paths (section 7). The mockup's `#hash` routes are a mockup shortcut.
- **Server state:** `@supabase/supabase-js` behind a thin `api/` layer, cached with TanStack Query. Components never call Supabase directly.
- **Client state:** React state, plus one small UI store (theme, open dialog, toasts). No global god-context.
- **Icons:** one `Icon` component over a single inline SVG set taken from the mockup (stroke 2, 24-unit grid). No icon library.
- **Tests:** Vitest for logic and RLS-adjacent helpers; Playwright smoke tests (sign in, post, vote, claim) added once the shell exists.

## 3. Design tokens (normalised)

The mockup drifted to 19 font sizes, 14 radii, about 100 raw hex values and 63 inline styles. v2 uses only these tokens. CI fails on arbitrary values (`text-[13px]`, `bg-[#…]`, `rounded-[7px]`), on raw hex colours outside `theme.css`, and on `style={{…}}`, except for data-driven values such as `--board-color`.

**Colour** (light / dark), from the mockup's variables:

| Token | Light | Dark |
|---|---|---|
| `--bg-page` | #FFFFFF | #141414 |
| `--bg-card` | #FFFFFF | #1B1B1C |
| `--bg-subtle` | #F5F5F6 | #212123 |
| `--bg-elevated` | #EFEFF1 | #262628 |
| `--border-subtle` | #ECECEE | rgba(255,255,255,.08) |
| `--border-strong` | #D9D9DE | rgba(255,255,255,.16) |
| `--ink-primary` | #16181D | #F2F2F3 |
| `--ink-secondary` | #4A4F59 | #A1A1A8 |
| `--ink-muted` | #71717A | #858A93 |
| `--brand` | #0047AB (cobalt) | #4D8DFF |
| `--brand-hover` | #003A8C | #7AAAFF |
| `--brand-soft` | rgba(0,71,171,.07) | rgba(77,141,255,.14) |
| `--success` | #047857 | #34D399 |
| `--warning` | #B45309 | #FBBF24 |
| `--danger` | #C2410C | #F87171 |

Rules: cobalt is the **only** action colour. Green appears only on *Shipped*. Board colours come from data (`board.color`), never from CSS. Cards get a border and no shadow; elevation (menus, dialogs) is the only place shadows appear.

**Type:** Plus Jakarta Sans for UI, JetBrains Mono for counts and code.
Scale: `--text-xs` 11 · `--text-sm` 12.5 · `--text-base` 14 · `--text-md` 15 · `--text-lg` 17 · `--text-xl` 20 · `--text-2xl` 24.
Weights: 400, 500, 600, 700 (the mockup's 650 becomes 600).

**Radius:** `--r-sm` 6 · `--r-md` 10 · `--r-lg` 14 · `--r-pill` 999.
**Space:** 4-px scale, `--s-1`…`--s-10` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
**Layout:** nav 248 (collapsed 64) · gutter (avatar column) 40 · row height 38 · content max 680 · rail 320.
**Breakpoints:** `sm` ≤ 520 (icon tab bar, sheets instead of dialogs) · `md` ≤ 720 · `lg` ≤ 1060 (no right rail, top search bar, nav collapses).
**Motion:** 120 ms for hover and press, 180 ms for overlays, ease-out; respect `prefers-reduced-motion`.

## 4. Primitives

Each primitive owns its keyboard and ARIA behaviour once, so screens never re-implement it.

| Primitive | Variants and notes |
|---|---|
| `Button` | primary · secondary · ghost · danger; sm · md; `loading`; icon-left |
| `IconButton` | requires `label` (aria) |
| `Field` | label, hint, inline error; wraps `Input`, `Textarea`, `Select`, `PasswordInput` (show/hide, strength meter) |
| `Menu` | the ⋯ menu and dropdowns; arrow keys, typeahead, Escape |
| `Tabs` | underline tabs (feed scope, board tabs, notification tabs) |
| `Dialog` | focus trap, Escape, restore focus, `aria-labelledby`; becomes a bottom `Sheet` at `sm` |
| `Toast` | one queue; **only** for confirming something that really happened, with optional Undo. Never for "coming later" |
| `Avatar` | user (default silhouette) · board (colour tile + initial or logo) · hub (stacked board tiles) |
| `Pill` | status (outlined, neutral; Shipped green) · type (quiet text) · verified · team badge |
| `Card` | bordered surface with optional gutter column |
| `EmptyState` | icon, one line, one action |
| `Skeleton` | for card, row and header |
| `Tooltip` | hover and focus, never the only label |

## 5. Composites

`AppShell` (NavRail, TopBar, RightRail, TabBar) · `PostCard` (community and seeded variants, footer with `VoteButton` and share) · `Composer` (dialog: board picker, product picker for hubs, type, title with similar-post suggestions, body) · `PostPage` (official response, `StatusTimeline`, replies one level deep, related) · `BoardHeader` / `HubHeader` (follow, post, Manage when permitted, hub chip) · `Roadmap` · `Changelog` · `ManageInbox` (triage rows, status change, merge) · `TeamPanel` · `ClaimFlow` (email code or DNS, then hub prompt) · `AuthDialog` (sign in, sign up, forgot, sent, reset) · `AccountDialog` (password, connected logins, notifications, export, delete) · `SearchPopover` · `NotificationList` · `ReportDialog`.

## 6. Domain model

| Entity | Key fields | Notes |
|---|---|---|
| `profile` | id, handle, name, avatar_path, bio | 1:1 with `auth.users`, created by trigger. No role column: power comes from memberships and `platform_admin` |
| `platform_admin` | user_id, granted_by, granted_at | Hark-side staff who handle the reports queue and ownership disputes. Seeded by migration, never client-writable; checked by an `is_platform_admin()` helper inside RLS |
| `board` | id, slug, name, tagline, site, color, logo_path, category, hub_id?, claimed_at | The product. Public face |
| `hub` | id, slug, name, description, primary_domain, claimed_at | Public group of boards. Needs no verification to exist |
| `verified_domain` | id, domain, verified_by, method (email \| dns), verified_at | A user proves control of a domain. Shared domains (gmail.com, vercel.app…) are refused |
| `membership` | user_id, scope (board \| hub), scope_id, role (owner \| admin \| member) | A hub membership covers every board in the hub |
| `join_request` | user_id, scope, work_email, status | "Work here?" |
| `ownership_dispute` | user_id, scope, reason, work_email, status | "Report wrong owner"; decided by a platform admin, never by the incumbent team |
| `post` | id, board_id, author_id?, source_url?, type (bug \| feature), status, title, body, merged_into?, hidden_at?, edited_at? | `author_id` null + `source_url` = seeded |
| `vote` | post_id, user_id | Voting auto-follows the post |
| `reply` | id, post_id, parent_id?, author_id, body, is_official | One level of nesting |
| `status_event` | post_id, from, to, note, actor_id, at | Drives the timeline and Shipped notifications |
| `follow` | user_id, target (board \| hub \| post \| user), target_id | |
| `notification` | recipient, kind, actor, target, read_at | Kinds: reply, mention, upvote_milestone, status_change, followed_post, follow, claim, join |
| `notification_pref` | user_id, kind, channel (in_app \| email), enabled | Every email has a one-click unsubscribe |
| `report` | target (post \| reply \| user), reason, reporter, status | Moderation queue |
| `block` | scope_id, user_id | A team blocks a user from posting on its boards |

### Storage

Supabase Storage, two public-read buckets:
- `avatars/{user_id}/{uuid}.{ext}`: only the owner writes under their own `user_id` prefix.
- `board-logos/{board_id}/{uuid}.{ext}`: only owners and admins of that board (or its hub) write.

Limits: images only (png, jpg, webp, svg sanitised), 1 MB, square crop done client-side. Rows store the path, not a URL. Old files are deleted on replace. Seeded posts' media stay external links.

## 7. State machines

- **Post status:** `open → under_review → planned → in_progress → shipped`, with `closed` reachable from any state, and `merged` (terminal: votes move to the target and the source is hidden). An `unmerge` RPC can reverse a merge within 10 minutes: it restores the status, returns the votes and unhides the source, and writes its own `status_event` so the timeline stays truthful. Only team members change status. Every change writes a `status_event`; *shipped* notifies everyone who voted or followed.
- **Claim:** unclaimed → verifying (email code or DNS TXT) → claimed. On success, if the board has a hub whose `primary_domain` the user verified, offer *Claim all of {hub}*. Claimed boards show Manage to members only.
- **Auth:** signed out → (sign in \| sign up \| forgot → sent → reset) → signed in. Sign-up shows *confirm your email* if confirmation is on. Messages never reveal whether an email exists.

## 8. Permissions

| Action | Anyone | Signed in | Author | Board/hub member | Admin/owner |
|---|---|---|---|---|---|
| Read public content | ✓ | ✓ | ✓ | ✓ | ✓ |
| Post, vote, reply, follow, report | | ✓ | ✓ | ✓ | ✓ |
| Edit or delete own post/reply | | | ✓ | | |
| Change status, official reply, merge, hide | | | | ✓ | ✓ |
| Block user, manage team, board settings | | | | | ✓ |
| Delete account | | self | | | (blocked while sole owner) |
| Decide reports and ownership disputes | | | | | platform admin only |

Enforced in RLS and `security definer` RPCs; the UI mirrors it but is never the guard.

## 9. Routes

`/` home · `/explore` · `/search?q=` · `/b/:board` (tabs `?tab=roadmap|changelog`) · `/b/:board/manage` · `/h/:hub` · `/h/:hub/manage` · `/post/:id` · `/u/:handle` · `/notifications` · `/settings` · `/privacy` · `/terms` · `/auth/reset` · `/unsubscribe?token=` (one click, no sign-in) · `/admin/reports` · `/admin/disputes` (platform admins only).

## 10. Mockup shortcuts that do not carry over

- Parallel data tables (`PRODUCTS`, `BOARD_META`, `BOARD_EXTRA`, `EX`, `HUBS`, `ORGS`) → one model, section 6.
- Posts as positional arrays and posts addressed by array index → typed records with ids.
- Global `document` click delegation on `data-*` attributes → component handlers.
- Toasts standing in for unbuilt features → either build it or hide the control.
- Merge without Undo → `unmerge` within 10 minutes (section 7).
- Keyword similarity → Postgres full-text search (`websearch_to_tsquery`) at first; semantic later.
- `@org` accounts, the org dashboard and `#org` routes → dropped (v76 decision).

## 11. Build order (one PR each, CI green before merge)

CI runs on GitHub Actions once the repo is public; until then the gates are run locally. The scaffold PR adds the three style gates from section 3 to `ci.yml`. Progress is tracked in [`BUILD.md`](./BUILD.md).

1. **Foundation**: this document plus the reference mockup *(this PR)*
2. **Scaffold**: fresh `src/`, tokens, primitives with a `/dev/kit` page, the arbitrary-value check in CI, AppShell with real routes, theme
3. **Schema v2**: additive migrations for section 6 (v1 untouched), RLS for section 8, Storage buckets and policies, platform admin seed, seed for the mockup's boards and hub, CI gates updated
4. **Auth + account**: AuthDialog, AccountDialog (password, notification preferences, export, delete via an Edge Function)
5. **Feed + post**: home feed, PostCard, PostPage, votes, replies, author edit/delete
6. **Boards + hubs**: board page with Roadmap and Changelog, hub page, Explore, search, composer with similar posts
7. **Claim + team**: claim flow, hub claim, Manage inbox, team, join and dispute
8. **Moderation**: merge with undo, reports queue, hide, block
9. **Cutover**: smoke tests, `pg_dump` snapshot, drop v1 tables and code, deploy

## 12. Registers

- `roadmap.md` is frozen as v1 history and points here; `STATUS.md` reads `BUILD.md` for v2 progress.
- `docs/deferred.md` entries get a status: *carried into v2*, *void at cutover* or *resolved*. Nothing is deleted. D-002 resolves in step 4, when the delete-account Edge Function becomes the first server-side user of `service_role`.
- D-012 (consent-screen logo) now means "design one distinctive mark, then resubmit", not "resubmit the speech bubble".
