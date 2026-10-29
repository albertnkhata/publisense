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
 *     (content + gap + rail), for dense screens like /admin and Manage.
 *   - `'narrow'` keeps the reading column (`max-w-content`, 680px), centred
 *     in the space the rail used to share, for forms, lists and long text
 *     (Settings, Notifications, the legal pages).
 *   With the rail on the column is always `max-w-content`; `width` is ignored.
 * - `topBar: false` drops the top bar from lg up, where the nav rail is
 *   already there, for staff screens (/admin) where search and the bell add
 *   nothing. Below lg it stays: it carries the brand, search and the bell there.
 * - `chrome` picks the frame around the page:
 *   - `'app'` (the default): nav rail, top bar, tab bar at sm.
 *   - `'site'`: a plain website header (brand, Terms · Privacy, Sign in or
 *     back to Publisense) and no nav rail or tab bar, for standalone pages
 *     people land on from a link (the legal pages). Implies no right rail
 *     and the narrow reading column.
 */
export type ShellWidth = 'narrow' | 'wide';
export type ShellChrome = 'app' | 'site';

export interface ShellHandle {
  rail?: boolean;
  width?: ShellWidth;
  chrome?: ShellChrome;
  topBar?: boolean;
}

export interface ShellLayout {
  rail: boolean;
  /** The content column: `narrow` is max-w-content, `wide` is max-w-wide. Always `narrow` with the rail. */
  width: ShellWidth;
  chrome: ShellChrome;
  /** False: no top bar from lg up (it stays below lg). */
  topBar: boolean;
}

/** No rail, wide column: dense staff and owner screens (/admin, Manage). */
export const NO_RAIL_WIDE = { rail: false, width: 'wide' } as const satisfies ShellHandle;
/** /admin: like NO_RAIL_WIDE, and no top bar on desktop. */
export const STAFF_PAGE = { rail: false, width: 'wide', topBar: false } as const satisfies ShellHandle;
/** No rail, reading-width column: forms, lists and long text. */
export const NO_RAIL_NARROW = { rail: false, width: 'narrow' } as const satisfies ShellHandle;
/** Website header instead of the app's nav rail, reading-width column: the legal pages. */
export const SITE_PAGE = { chrome: 'site', rail: false, width: 'narrow' } as const satisfies ShellHandle;

export function shellLayoutFor(handles: unknown[]): ShellLayout {
  let rail = true;
  let width: ShellWidth | undefined;
  let chrome: ShellChrome = 'app';
  let topBar = true;
  for (const h of handles) {
    if (!h || typeof h !== 'object') continue;
    const s = h as ShellHandle;
    if (typeof s.rail === 'boolean') rail = s.rail;
    if (s.width === 'narrow' || s.width === 'wide') width = s.width;
    if (s.chrome === 'app' || s.chrome === 'site') chrome = s.chrome;
    if (typeof s.topBar === 'boolean') topBar = s.topBar;
  }
  if (chrome === 'site') return { rail: false, width: 'narrow', chrome, topBar };
  if (rail) return { rail, width: 'narrow', chrome, topBar };
  return { rail, width: width ?? 'wide', chrome, topBar };
}

export function useShellLayout(): ShellLayout {
  return shellLayoutFor(useMatches().map((m) => m.handle));
}
