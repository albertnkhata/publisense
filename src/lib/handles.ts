import type { UserProfile } from '../types';

/**
 * A handle is only worth linking if a profile actually answers to it.
 *
 * The signal callout renders `officialUpdatedBy` / responder labels as links, and
 * that column is free text written by whoever posted the response: headers like
 * "@aman (Cursor Team)" are a display label, not a handle. Linking it produced
 * /u/aman (Cursor Team) — a link that looks authoritative, appears on the home
 * feed, and lands on "No contributor profile found".
 *
 * So resolve first, link second: if no profile claims the handle, render the text
 * without a link. A label that isn't a person is not a broken link, it's just text.
 */
export function resolveHandleSlug(raw: string | undefined, knownHandles: string[]): string | null {
  const trimmed = (raw || '').trim().replace(/^@+/, '').trim();
  if (!trimmed) return null;

  const wanted = trimmed.toLowerCase();
  const match = knownHandles.find((h) => (h || '').trim().toLowerCase() === wanted);
  return match ?? null;
}

/** Convenience wrapper for callers that hold full profiles rather than handles. */
export function resolveProfileHandle(
  raw: string | undefined,
  profiles: Pick<UserProfile, 'handle'>[]
): string | null {
  return resolveHandleSlug(
    raw,
    profiles.map((p) => p.handle)
  );
}

/** What to print next to the badge: the label as written, never invented. */
export function displayHandle(raw: string | undefined): string {
  return (raw || '').trim();
}
