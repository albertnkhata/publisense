/**
 * Pure helpers for the two hard parts of the auth flow: recovering from a
 * confirmation link that is already dead, and telling a user why a signup or
 * sign-in failed in words they can act on.
 *
 * Kept pure (no supabase import) so the rules can be tested without a browser
 * or a live project.
 */

/** Supabase's own throttle default is 60s; we never promise faster than this. */
export const RESEND_COOLDOWN_SECONDS = 60;

export type OtpVerifyKind = 'signup' | 'recovery' | 'email_change' | 'magiclink';

/**
 * What to do with a URL that Supabase bounced a user back on.
 *
 * Supabase sends the email confirmation as a token_hash link that this app never
 * asked for, so by the time the browser loads the token may already have been
 * spent (mail scanners fetching links is the usual way). If the hash still
 * carries a token we can finish the job in-page; if it carries `error=…` the
 * link failed and the only honest next step is to offer a fresh one.
 */
export function classifyAuthCallback(
  url: string
):
  | { kind: 'verify'; tokenHash: string; type: OtpVerifyKind }
  | { kind: 'error'; code: string; description: string }
  | { kind: 'session'; type: OtpVerifyKind }
  | { kind: 'none' } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'none' };
  }
  const search = parsed.searchParams;
  const known: OtpVerifyKind[] = ['signup', 'recovery', 'email_change', 'magiclink'];
  const pick = (t: string | null): OtpVerifyKind =>
    known.includes((t || '') as OtpVerifyKind) ? (t as OtpVerifyKind) : 'signup';

  // Form 1: ?token_hash=… which we verify ourselves with verifyOtp.
  const tokenHash = search.get('token_hash');
  if (tokenHash) {
    return { kind: 'verify', tokenHash, type: pick(search.get('type')) };
  }

  // Form 2 - what Supabase ACTUALLY mails by default. The link is
  // /auth/v1/verify?token=…&type=… which 303-redirects here with the session in
  // the URL *fragment* (#access_token=…&type=recovery). supabase-js consumes
  // that itself, so there is nothing to verify - but a recovery session must be
  // recognised, or the reset flow ends by silently signing the user in with no
  // way to choose a new password.
  const frag = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  if (frag.get('access_token') || frag.get('refresh_token')) {
    return { kind: 'session', type: pick(frag.get('type')) };
  }
  if (frag.get('error') || frag.get('error_code')) {
    return {
      kind: 'error',
      code: frag.get('error_code') || frag.get('error') || '',
      description: frag.get('error_description') || '',
    };
  }

  const errorCode = search.get('error_code') || search.get('error');
  if (errorCode) {
    return {
      kind: 'error',
      code: errorCode,
      description: search.get('error_description') || '',
    };
  }

  return { kind: 'none' };
}

/**
 * A dead confirmation link is not a dead account. Explain it and point at the
 * next action rather than showing the raw provider string.
 */
export function explainAuthError(code: string, description: string): string {
  const c = code.toLowerCase();
  const d = description.toLowerCase();

  // "expired" is a specific, actionable claim: say it only when the provider
  // actually said it, or the code is the expiry code.
  if (c.includes('expired') || d.includes('expired')) {
    return 'That link has expired or was already used. Enter your email below and we will send a fresh one.';
  }
  if (c.includes('access_denied') || c.includes('invalid') || d.includes('invalid')) {
    return 'That link did not work. Enter your email below and we will send a fresh one.';
  }
  return 'We could not finish signing you in from that link. Enter your email below and we will send a fresh one.';
}

/**
 * Supabase throttles repeat sends per address (smtp_max_frequency). A 429 here
 * is the throttle, not a failure, and saying so prevents the user from sitting
 * there re-submitting.
 */
export function explainSendFailure(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('only request this after') || m.includes('too many')) {
    return `We just sent one. Please wait ${RESEND_COOLDOWN_SECONDS} seconds before asking for another.`;
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'That does not look like a valid email address.';
  }
  return message;
}

/** Countdown wording that never shows "0 seconds" as a live state. */
export function cooldownLabel(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return 'Resend link';
  return `Resend in ${secondsRemaining}s`;
}
