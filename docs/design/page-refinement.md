# Site Page Classification & UI/UX Refinement Plan

> **Status:** Complete (Phases 1–4 shipped)  
> **Target:** Front-end screens in [`web/src/pages/`](../../web/src/pages/) and shell layouts in [`web/src/shell/layout.ts`](../../web/src/shell/layout.ts).  
> **Design Token Contract:** [`docs/foundation.md`](../foundation.md) §3 and [`web/src/styles/theme.css`](../../web/src/styles/theme.css).

---

## 1. Why Classify First?

Rather than tweaking individual pages in isolation—which causes visual drift, redundant components, and fragmented responsive behavior—pages across Publisense are grouped by **shared functional archetypes**.

Pages in the same archetype share:
1. **Shell Chrome & Layout Dimensions:** Identical column max-widths (`max-w-content` vs. `max-w-wide`), rail visibility, and navigation density.
2. **User Mindset & Intent:** Fast public scanning vs. focused reading vs. dense administrative triage.
3. **Typography & Component Rhythm:** Common card styles, header structures, action buttons, and empty states.

---

## 2. Page Archetypes & Taxonomy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Publisense Page Taxonomy                        │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ Group             │ Shell / Layout    │ Primary Purpose & Mindset      │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ 1. Public & Info  │ Minimal SiteHeader│ Long-form reading, trust, SEO  │
│ 2. Core Discovery │ Nav + Feed + Rail │ Fast scanning, voting, search  │
│ 3. User Workspace │ Distraction-free  │ Personal utility, messaging    │
│ 4. Maker Ops      │ Wide workbench    │ Domain proof, team management  │
│ 5. Staff Admin    │ High-density table│ Moderation triage & audit logs │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

### Group 1: Public Marketing, Informational & Legal (The "Site" Archetype)
* **Routes:** [`/terms`](../../web/src/pages/LegalPages.tsx), [`/privacy`](../../web/src/pages/LegalPages.tsx), [`/auth/reset`](../../web/src/pages/AuthResetPage.tsx), [`/unsubscribe`](../../web/src/pages/UnsubscribePage.tsx).
* **Missing Gap Identified:** `/about` (or "How Publisense Works" / Company Manifesto). Currently visitors only learn about the product through terms or empty states.
* **Layout Handle:** `SITE_PAGE` (`chrome: 'site'`, `rail: false`, `width: 'narrow'`, centered 680px column). Uses [`SiteHeader`](../../web/src/shell/SiteHeader.tsx) and [`SiteFooter`](../../web/src/shell/SiteHeader.tsx).
* **UX/UI Refinement Goals:**
  - Establish a clean, readable typographic rhythm (line height, heading hierarchy, subheadings).
  - Add an **About / How it Works** page explaining public feedback boards and domain-verified creator claiming.
  - Consistent breadcrumbs and anchor navigation for long legal text.
  - Frictionless mobile reading experience.

### Group 2: Core Product & Community Discovery (The "Browsing" Archetype)
* **Routes:**
  - Home feed: [`/`](../../web/src/pages/HomePage.tsx)
  - Discovery: [`/explore`](../../web/src/pages/ExplorePage.tsx)
  - Search: [`/search?q=`](../../web/src/pages/SearchPage.tsx)
  - Board & Tabs: [`/b/:board`](../../web/src/pages/BoardPage.tsx) (Feedback, Roadmap, Changelog)
  - Company Hub: [`/h/:hub`](../../web/src/pages/HubPage.tsx) (aggregates product boards)
  - Thread permalink: [`/post/:id`](../../web/src/pages/PostPage.tsx)
* **Layout Handle:** Default AppShell (3-column layout: left `NavRail`, central feed `max-w-content`, and contextual `RightRail` with search well, board list, and claim CTA).
* **UX/UI Refinement Goals:**
  - Visual hierarchy of cards ([`PostCard`](../../web/src/posts/PostCard.tsx), vote buttons, status pills, author bylines).
  - Clean transitions between board views (Feedback vs. Roadmap vs. Changelog).
  - Engaging, actionable zero-state cards (e.g. "Nobody has posted about this yet — Be the first").
  - Fast search filtering and keyboard shortcuts.

### Group 3: Personal User Workspace (The "Account & Communications" Archetype)
* **Routes:**
  - Public Profile: [`/u/:handle`](../../web/src/pages/UserPage.tsx)
  - Notifications: [`/notifications`](../../web/src/pages/NotificationsPage.tsx)
  - Direct Messages: [`/messages`](../../web/src/pages/MessagesPage.tsx) (`/messages/to/:handle`, `/messages/:id`)
  - Settings: [`/settings`](../../web/src/pages/SettingsPage.tsx) (profile, email, notifications, export/delete)
* **Layout Handle:**
  - `NO_RAIL_NARROW` (`rail: false`, `width: 'narrow'`) for Settings and Notifications.
  - `MESSAGES_PAGE` (`rail: false`, `width: 'wide'`, `topBar: false`, `fill: true`) for DMs (full-height split pane with sticky composer).
* **UX/UI Refinement Goals:**
  - Clear distinction between viewing one's own profile vs. another user's profile.
  - Grouped setting sections with clear save indicators and destructive action confirmations.
  - Fast triage in Notifications (read/unread indicators, direct action links).
  - Ergonomic message threading and mobile slide-over views.

### Group 4: Maker Operations & Board Ownership (The "Team Workbench" Archetype)
* **Routes:**
  - Board Manage: [`/b/:board/manage`](../../web/src/manage/ManagePage.tsx)
  - Hub Manage: [`/h/:hub/manage`](../../web/src/manage/ManagePage.tsx)
  - Overlays: Claim Dialog (DNS TXT / work email verification), Add Product Dialog.
* **Layout Handle:** `NO_RAIL_WIDE` (`rail: false`, `width: 'wide'`).
* **UX/UI Refinement Goals:**
  - Stepper clarity for DNS and domain verification (copy button, polling feedback, troubleshooting hints).
  - Team member table ergonomics (roles, invite inputs, ownership transfer safety).
  - Board branding settings (custom colors, logo preview, official link).

### Group 5: Platform Governance (The "Staff Admin" Archetype)
* **Routes:** [`/admin`](../../web/src/pages/AdminPages.tsx) (overview, products queue, companies queue, reports queue, disputes queue, staff team).
* **Layout Handle:** `STAFF_PAGE` (`rail: false`, `width: 'wide'`, `topBar: false`).
* **UX/UI Refinement Goals:**
  - Rapid triage: high information density, clear queue counters, instant review actions.
  - Mandatory reasoning prompts on rejections and report dismissals.
  - Audit trail visibility.

---

## 3. Shared Evaluation Criteria per Page

When refining any page, we evaluate against 5 standardized criteria:

1. **Hierarchy & Scannability:** Does the eye naturally move from primary header to main content to action items? Are secondary actions visually muted?
2. **State Completeness:** Are all 4 essential states accounted for?
   - Loading (skeletons with matching geometry)
   - Empty (helpful prompt with primary CTA)
   - Error (actionable recovery message, not raw codes)
   - Populated (clean spacing and alignment)
3. **Token Discipline:** Are styles strictly using tokens defined in `theme.css`? No arbitrary pixel values or raw hex colors.
4. **Responsive Integrity:** How does the page collapse from 3-column desktop (`lg:`) to single-column mobile (`sm:`)? Are touch targets at least 44px?
5. **Accessibility & Keyboard Flow:** Can every action be completed via keyboard? Are ARIA roles and labels semantically correct?

---

## 4. Execution Order

- [x] **Phase 1: Public & Informational (Group 1)**
  - Added [`/about`](../../web/src/pages/AboutPage.tsx) (`SITE_PAGE`) explaining public feedback, domain-verified claiming, and platform principles, wired into [`SiteHeader`](../../web/src/shell/SiteHeader.tsx), [`SiteFooter`](../../web/src/shell/SiteHeader.tsx), [`LegalLinks`](../../web/src/shell/LegalLinks.tsx), [`UserMenu`](../../web/src/shell/UserMenu.tsx), and [`sitemap.ts`](../../web/api/_lib/sitemap.ts).
  - Refined [`LegalPages.tsx`](../../web/src/pages/LegalPages.tsx) (`/terms`, `/privacy`) with breadcrumbs and `"On this page"` sticky-header-safe section anchors, and aligned breadcrumbs and recovery actions on [`AuthResetPage`](../../web/src/pages/AuthResetPage.tsx) and [`UnsubscribePage`](../../web/src/pages/UnsubscribePage.tsx).
- [x] **Phase 2: Core Discovery & Boards (Group 2)**
  - Refine `ScopeHeader` mobile wrapping, `BoardPage`/`HubPage` header action consistency, `PostCard` hover scannability, signed-out `HomePage` toolbar, and `PostPage` product context (`D-016`).
  - Fix `SearchPage` tab preservation on query edits, unify empty/zero-result states (`EmptyState` cards), and add `All products` sorting and structured loading skeleton in `ExplorePage`.
- [x] **Phase 3: User Workspace & Messages (Group 3)**
  - Framed [`UserPage`](../../web/src/pages/UserPage.tsx) (`/u/:handle`) profile header in a `Card` with `"Your profile"` self-distinction, `Account settings` menu shortcut, responsive `FollowPersonButton` mobile layout, structured header/post skeletons, and unified `Card` + `EmptyState` tab zero-states with `"Explore boards"` self-CTA.
  - Added `"Settings sections"` quick-jump anchors, `scroll-mt-10` sticky-header offset, profile dirty/saved state indicator, `40px` checkbox tap targets, row hover states, and inline `Try again` error recovery for preferences and blocked lists on [`SettingsPage`](../../web/src/pages/SettingsPage.tsx).
  - Enlarged [`NavRail`](../../web/src/shell/NavRail.tsx) unread pills, added [`NotificationsPage`](../../web/src/pages/NotificationsPage.tsx) loading skeletons, tab-specific empty states, contrasted `Mark all as read` prominence, and larger gear tap target; added `LoadError` retry recovery, `Muted` header badge, visible unread count pill, semantic `<time>` stamps, and `DM_MAX` counter + keyboard hint on [`MessagesPage`](../../web/src/pages/MessagesPage.tsx).
- [x] **Phase 4: Maker Operations & Admin (Groups 4 & 5)**
  - Streamlined [`ClaimDialog`](../../web/src/claim/ClaimDialog.tsx) with a 3-step `Product · Verify · Team` progress indicator (`aria-current="step"`), bounded product picker with `EmptyState` zero-search card and alert retry banner, DNS TXT record card header and actionable error troubleshooting guidance, and `"Open dashboard"` shortcut on completion; added live preview `<Spinner />` states in [`AddProductDialog`](../../web/src/products/AddProductDialog.tsx).
  - Polished [`ManagePage`](../../web/src/manage/ManagePage.tsx) and [`manage/parts.tsx`](../../web/src/manage/parts.tsx) with `LoadError` recovery for scope/role/blocked queries, structured inbox & team skeletons, `EmptyState`-framed inbox zero-states, `'Unsaved changes' | 'Saved' | 'Up to date'` and webhook status indicators, semantic `<time>` tags, and mobile wrapping.
  - Polished [`AdminPages`](../../web/src/pages/AdminPages.tsx) and [`AdminOverview`](../../web/src/pages/AdminOverview.tsx) with structured queue & command-centre skeletons, `EmptyState`-framed queues (`EmptyQueue`), bordered status/category pills, separated card action footers, semantic `<time>` stamps + relative `"Updated"` indicator, and mobile wrapping across admin rows.
