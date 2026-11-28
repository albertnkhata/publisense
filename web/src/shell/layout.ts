import { useMatches } from 'react-router';

/**
 * Per-route shell options, set on a route's `handle` in App.tsx and read by
 * AppShell. The deepest route that says something wins, key by key, so a
 * parent can opt a whole branch out (as /admin does) and a child can opt back in.
 *
 * - `rail: false` drops the right rail (boards cards, claim line).
 * - `width` sizes the content column when the right rail is off:
 *   - `'wide'` (the default without a rail) widens it to `max-w-wide`
 *     (1088px), for directory views (Home, Categories) and workspaces (/admin, Manage).
 *   - `'narrow'` keeps the reading column (`max-w-content`, 728px), centred
 *     for forms, lists and long text (Settings, Notifications, the legal pages).
 *   With the right rail on, the column is always `max-w-content` (728px); `width` is ignored.
 * - `topBar` is kept for route handle compatibility (`topBar: false` when a route
 *   opts out, though the unified shell keeps the global TopBar across app routes).
 * - `fill: true` makes the page exactly one screen tall (no page scroll) and the
 *   full width beside the nav rail, edge to edge (no column cap, no gutters): the
 *   page lays out its own scrolling panes, and anything at its foot stays at the
 *   foot of the screen. For Messages, whose composer sits at the bottom always.
 * - `chrome` picks the frame around the page:
 *   - `'app'` (the default): full-width TopBar above the left NavRail, content
 *     column (plus RightRail when `rail: true`, or LandingFooter when `!rail && !fill`),
 *     and TabBar at sm. Signed-out `/` renders `LandingPage` inside the `EXPLORE_PAGE` shell.
 *   - `'site'`: a plain website header (brand, About · Terms · Privacy, Sign in or
 *     back to Publisense) and no nav rail or tab bar, for standalone pages
 *     people land on from a link (about and legal pages). Implies no right
 *     rail and the narrow reading column.
 */
export type ShellWidth = 'narrow' | 'wide';
export type ShellChrome = 'app' | 'site';

export interface ShellHandle {
  rail?: boolean;
  width?: ShellWidth;
  chrome?: ShellChrome;
  topBar?: boolean;
  fill?: boolean;
}

export interface ShellLayout {
  rail: boolean;
  /** The content column: `narrow` is max-w-content, `wide` is max-w-wide. Always `narrow` with the rail. */
  width: ShellWidth;
  chrome: ShellChrome;
  topBar: boolean;
  /** One screen tall, no page scroll: the page scrolls its own panes. */
  fill: boolean;
}

/** No right rail, wide column: directory and management screens. */
export const NO_RAIL_WIDE = { rail: false, width: 'wide' } as const satisfies ShellHandle;
/** Board/hub management workspace: no right rail, wide column. */
export const MANAGE_PAGE = { rail: false, width: 'wide' } as const satisfies ShellHandle;
/** /admin workspace: no right rail, wide column. */
export const STAFF_PAGE = { rail: false, width: 'wide', topBar: false } as const satisfies ShellHandle;
/** Signed-in /, /categories and /c/:category: wide directory without the right rail. */
export const EXPLORE_PAGE = { rail: false, width: 'wide' } as const satisfies ShellHandle;
/** No right rail, reading-width column: forms, lists and long text. */
export const NO_RAIL_NARROW = { rail: false, width: 'narrow' } as const satisfies ShellHandle;
/** Website header instead of the app's nav rail, reading-width column: the legal pages. */
export const SITE_PAGE = { chrome: 'site', rail: false, width: 'narrow' } as const satisfies ShellHandle;

/** Messages workspace: one screen tall, wide, no right rail. */
export const MESSAGES_PAGE = { rail: false, width: 'wide', topBar: false, fill: true } as const satisfies ShellHandle;

export function shellLayoutFor(handles: unknown[]): ShellLayout {
  let rail = true;
  let width: ShellWidth | undefined;
  let chrome: ShellChrome = 'app';
  let topBar = true;
  let fill = false;
  for (const h of handles) {
    if (!h || typeof h !== 'object') continue;
    const s = h as ShellHandle;
    if (typeof s.rail === 'boolean') rail = s.rail;
    if (s.width === 'narrow' || s.width === 'wide') width = s.width;
    if (s.chrome === 'app' || s.chrome === 'site') chrome = s.chrome;
    if (typeof s.topBar === 'boolean') topBar = s.topBar;
    if (typeof s.fill === 'boolean') fill = s.fill;
  }
  if (chrome === 'site') return { rail: false, width: 'narrow', chrome, topBar, fill: false };
  if (rail) return { rail, width: 'narrow', chrome, topBar, fill: false };
  return { rail, width: width ?? 'wide', chrome, topBar, fill };
}

export function useShellLayout(): ShellLayout {
  return shellLayoutFor(useMatches().map((m) => m.handle));
}
