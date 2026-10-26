/**
 * Expired or already-used email links (#137).
 *
 * When a confirmation or reset link can't be used, Supabase redirects back with
 * the reason in the URL, e.g.
 *   /#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
 * (or in the query string for the PKCE flow). The app used to ignore it and show
 * the normal home feed, so people didn't know what had happened.
 *
 * This reads the reason once, before anything else can touch the URL, so the
 * shell can explain it and offer a new link. Dependency-free for testing.
 */
export interface AuthLinkError {
  code: string;
  description: string;
  /** The link expired or was already used (the common case): offer a new one. */
  expired: boolean;
}

const KEYS = ['error', 'error_code', 'error_description'] as const;

function params(raw: string): URLSearchParams {
  return new URLSearchParams(raw.replace(/^[#?]/, ''));
}

export function parseAuthLinkError(hash: string, search: string): AuthLinkError | null {
  for (const p of [params(hash), params(search)]) {
    const error = p.get('error') ?? '';
    const code = p.get('error_code') ?? '';
    if (!error && !code) continue;
    const description = (p.get('error_description') ?? '').replace(/\+/g, ' ');
    const expired = code === 'otp_expired' || /expired|invalid|already/i.test(description) || error === 'access_denied';
    return { code: code || error, description, expired };
  }
  return null;
}

/** The URL without the error params (anything else in the hash or query is kept). */
export function withoutAuthLinkError(href: string): string {
  const u = new URL(href);
  const h = params(u.hash);
  const q = u.searchParams;
  for (const k of KEYS) {
    h.delete(k);
    q.delete(k);
  }
  // Supabase adds an empty `sb` marker alongside; drop it once nothing else is left.
  if ([...h.keys()].every((k) => k === 'sb')) h.delete('sb');
  u.hash = h.toString();
  return u.toString().replace(/#$/, '');
}

/** Captured when the module loads, i.e. at app start, before the auth client exists. */
export const initialAuthLinkError: AuthLinkError | null =
  typeof window === 'undefined' ? null : parseAuthLinkError(window.location.hash, window.location.search);
