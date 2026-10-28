import { useMatches } from 'react-router';

/**
 * Per-route shell options, set on a route's `handle` in App.tsx and read by
 * AppShell. The deepest route that says something wins, so a parent can opt a
 * whole branch out (as /admin does) and a child can opt back in.
 *
 * - `rail: false` drops the right rail (search, boards card, claim line, legal
 *   footer). The content column then widens to `max-w-wide` (content + gap +
 *   rail) and the top bar, which carries search below lg, stays on at every
 *   width so search is still one click away.
 */
export interface ShellHandle {
  rail?: boolean;
}

export interface ShellLayout {
  rail: boolean;
}

export function shellLayoutFor(handles: unknown[]): ShellLayout {
  let rail = true;
  for (const h of handles) {
    if (h && typeof h === 'object' && typeof (h as ShellHandle).rail === 'boolean') rail = (h as ShellHandle).rail as boolean;
  }
  return { rail };
}

export function useShellLayout(): ShellLayout {
  return shellLayoutFor(useMatches().map((m) => m.handle));
}
