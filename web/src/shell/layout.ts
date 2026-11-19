import { useMatches } from 'react-router';

/**
 * Per-route shell options, set on a route's `handle` in App.tsx and read by
 * AppShell. The deepest route that says something wins, key by key, so a
 * parent can opt a whole branch out (as /admin does) and a child can opt back in.
 *
 * - `rail: false` drops the right rail (search, boards card, claim line). The
 *   top bar, which carries search below lg, then stays on at every width so
 *   search is still one click away.
 * - `width` sizes the content column when the rail is off:
 *   - `'wide'` (the default without a rail) widens it to `max-w-wide`
 *     (1024px), for dense NavRail workspaces like /admin and Manage.
 *   - `'landing'` widens it to `max-w-landing` (1200px outer, 1136px inner),
 *     aligning top-bar directory views (Explore, Categories) with TopBar and
 *     LandingPage.
 *   - `'narrow'` keeps the reading column (`max-w-content`, 680px), centred
 *     for forms, lists and long text (Settings, Notifications, the legal pages).
 *   With the rail on, the column is `max-w-feed` (752px) under `nav: 'top'`
 *   (so 752 + 64 + 320 fills the 1136px `max-w-landing` frame) or `max-w-content`
 *   under `nav: 'rail'`; `width` is ignored.
 * - `topBar: false` drops the top bar from lg up, where the nav rail is
 *   already there, for staff screens (/admin) where search and the bell add
 *   nothing. Below lg it stays: it carries the brand, search and the bell there.
 * - `fill: true` makes the page exactly one screen tall (no page scroll) and the
 *   full width beside the nav rail, edge to edge (no column cap, no gutters): the
 *   page lays out its own scrolling panes, and anything at its foot stays at the
 *   foot of the screen. For Messages, whose composer sits at the bottom always.
 * - `chrome` picks the frame around the page:
 *   - `'app'` (the default): nav rail, top bar, tab bar at sm. (When `/` is
 *     visited signed-out without `?scope=following`, `AppShell` switches at
 *     runtime to the `isLanding` shell: `LandingHeader`, `LandingFooter`,
 *     and `max-w-landing` 1200px, without nav rail or right rail.)
 *   - `'site'`: a plain website header (brand, About · Terms · Privacy, Sign in or
 *     back to Publisense) and no nav rail or tab bar, for standalone pages
 *     people land on from a link (about and legal pages). Implies no right
 *     rail and the narrow reading column.
 */
export type ShellWidth = 'narrow' | 'wide' | 'landing';
export type ShellChrome = 'app' | 'site';
export type ShellNav = 'top' | 'rail';

export interface ShellHandle {
  nav?: ShellNav;
  rail?: boolean;
  width?: ShellWidth;
  chrome?: ShellChrome;
  topBar?: boolean;
  fill?: boolean;
}

export interface ShellLayout {
  /** 'top' renders the horizontal TopBar everywhere; 'rail' renders the workspace left NavRail. */
  nav: ShellNav;
  rail: boolean;
  /** The content column width preset (`narrow` when `rail` is on). */
  width: ShellWidth;
  chrome: ShellChrome;
  /** False: no top bar from lg up (it stays below lg). */
  topBar: boolean;
  /** One screen tall, no page scroll: the page scrolls its own panes. */
  fill: boolean;
}

/** No rail, wide column: wide browsing/directory views on top-bar navigation. */
export const NO_RAIL_WIDE = { rail: false, width: 'wide' } as const satisfies ShellHandle;
/** Board/hub management workspace: left NavRail, wide column, no desktop top bar. */
export const MANAGE_PAGE = { nav: 'rail', rail: false, width: 'wide', topBar: false } as const satisfies ShellHandle;
/** /admin workspace: left NavRail with admin sections, wide column, no desktop top bar. */
export const STAFF_PAGE = { nav: 'rail', rail: false, width: 'wide', topBar: false } as const satisfies ShellHandle;
/** /explore, /categories and /c/:category: landing-width directory without the right rail. */
export const EXPLORE_PAGE = { rail: false, width: 'landing' } as const satisfies ShellHandle;
/** No rail, reading-width column: forms, lists and long text. */
export const NO_RAIL_NARROW = { rail: false, width: 'narrow' } as const satisfies ShellHandle;
/** Website header instead of the app's nav rail, reading-width column: the legal pages. */
export const SITE_PAGE = { chrome: 'site', rail: false, width: 'narrow' } as const satisfies ShellHandle;

/** Messages workspace: left NavRail, one screen tall, wide, no desktop top bar. */
export const MESSAGES_PAGE = { nav: 'rail', rail: false, width: 'wide', topBar: false, fill: true } as const satisfies ShellHandle;

export function shellLayoutFor(handles: unknown[]): ShellLayout {
  let nav: ShellNav = 'top';
  let rail = true;
  let width: ShellWidth | undefined;
  let chrome: ShellChrome = 'app';
  let topBar = true;
  let fill = false;
  for (const h of handles) {
    if (!h || typeof h !== 'object') continue;
    const s = h as ShellHandle;
    if (s.nav === 'top' || s.nav === 'rail') nav = s.nav;
    if (typeof s.rail === 'boolean') rail = s.rail;
    if (s.width === 'narrow' || s.width === 'wide' || s.width === 'landing') width = s.width;
    if (s.chrome === 'app' || s.chrome === 'site') chrome = s.chrome;
    if (typeof s.topBar === 'boolean') topBar = s.topBar;
    if (typeof s.fill === 'boolean') fill = s.fill;
  }
  if (chrome === 'site') return { nav: 'top', rail: false, width: 'narrow', chrome, topBar, fill: false };
  if (rail) return { nav, rail, width: 'narrow', chrome, topBar, fill: false };
  return { nav, rail, width: width ?? 'wide', chrome, topBar, fill };
}

export function useShellLayout(): ShellLayout {
  return shellLayoutFor(useMatches().map((m) => m.handle));
}
