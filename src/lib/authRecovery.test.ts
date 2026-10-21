import { describe, expect, it } from 'vitest';
import {
  classifyAuthCallback,
  cooldownLabel,
  explainAuthError,
  explainSendFailure,
  RESEND_COOLDOWN_SECONDS,
} from './authRecovery';

const BASE = 'https://publisense.app';

describe('classifyAuthCallback', () => {
  it('finishes a confirmation link that still carries a token', () => {
    const result = classifyAuthCallback(
      `${BASE}/?token_hash=abc123&type=signup`
    );
    expect(result).toEqual({ kind: 'verify', tokenHash: 'abc123', type: 'signup' });
  });

  it('recognises a recovery token as recovery, not signup', () => {
    const result = classifyAuthCallback(`${BASE}/?token_hash=t0k&type=recovery`);
    expect(result).toEqual({ kind: 'verify', tokenHash: 't0k', type: 'recovery' });
  });

  it('defaults an unknown type to signup rather than guessing something else', () => {
    const result = classifyAuthCallback(`${BASE}/?token_hash=t0k&type=weird`);
    expect(result).toEqual({ kind: 'verify', tokenHash: 't0k', type: 'signup' });
  });

  it('reports a spent link as an error instead of silently doing nothing', () => {
    // This is the mail-scanner case: the token was already consumed.
    const result = classifyAuthCallback(
      `${BASE}/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('otp_expired');
    }
  });

  it('falls back to the error param when no error_code is present', () => {
    const result = classifyAuthCallback(`${BASE}/?error=access_denied`);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('access_denied');
  });

  it('ignores an ordinary page load', () => {
    expect(classifyAuthCallback(`${BASE}/explore`).kind).toBe('none');
    expect(classifyAuthCallback(`${BASE}/`).kind).toBe('none');
  });

  it('does not throw on a malformed url', () => {
    expect(classifyAuthCallback('not-a-url').kind).toBe('none');
  });

  it('does not treat a token_hash inside the fragment as verifiable', () => {
    // verifyOtp needs it as a query param; a fragment copy is not ours to use.
    const result = classifyAuthCallback(`${BASE}/#token_hash=abc&type=signup`);
    expect(result.kind).not.toBe('verify');
  });

  it('recognises the hash-fragment session Supabase actually redirects with', () => {
    // Observed live: /auth/v1/verify?token=…&type=recovery 303s to
    // https://publisense.app#access_token=…&type=recovery. supabase-js consumes
    // that itself, so it must NOT be pushed through verifyOtp.
    const result = classifyAuthCallback(
      `${BASE}/#access_token=eyJhbGciOi&expires_at=1792598609&refresh_token=qkyr&token_type=bearer&type=recovery`
    );
    expect(result).toEqual({ kind: 'session', type: 'recovery' });
  });

  it('carries the type through the session form so recovery is distinguishable', () => {
    const rec = classifyAuthCallback(`${BASE}/#access_token=a&refresh_token=b&type=recovery`);
    const sig = classifyAuthCallback(`${BASE}/#access_token=a&refresh_token=b&type=signup`);
    expect(rec).toEqual({ kind: 'session', type: 'recovery' });
    expect(sig).toEqual({ kind: 'session', type: 'signup' });
  });

  it('reports a fragment error as an error, since there is no session to use', () => {
    const result = classifyAuthCallback(
      `${BASE}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('otp_expired');
  });
});

describe('explainAuthError', () => {
  it('turns an expired link into an actionable sentence', () => {
    const msg = explainAuthError('otp_expired', 'Email link is invalid or has expired');
    expect(msg).toMatch(/expired or was already used/i);
    expect(msg).toMatch(/send a fresh one/i);
  });

  it('only claims "expired" when the provider said expired', () => {
    // access_denied alone is not proof of expiry - do not invent that reason.
    const msg = explainAuthError('access_denied', '');
    expect(msg).not.toMatch(/expired/i);
    expect(msg).toMatch(/fresh one/i);
  });

  it('honours an expiry description even without an expiry code', () => {
    expect(explainAuthError('access_denied', 'Email link has expired')).toMatch(/expired/i);
  });

  it('handles denial without claiming the account is gone', () => {
    const msg = explainAuthError('access_denied', '');
    expect(msg).not.toMatch(/account (removed|deleted)/i);
    expect(msg).toMatch(/fresh one/i);
  });

  it('always returns something usable for an unknown code', () => {
    expect(explainAuthError('mystery', '')).toMatch(/fresh one/i);
  });
});

describe('explainSendFailure', () => {
  it('names throttling as throttling, not a broken send', () => {
    const msg = explainSendFailure('For security purposes, you can only request this after 57 seconds.');
    expect(msg).toContain(String(RESEND_COOLDOWN_SECONDS));
    expect(msg).toMatch(/wait/i);
  });

  it('treats a rate-limit message as a throttle too', () => {
    expect(explainSendFailure('email rate limit exceeded')).toMatch(/wait/i);
  });

  it('reports a bad address as a bad address', () => {
    expect(explainSendFailure('Unable to validate email address: invalid format')).toMatch(
      /valid email/i
    );
  });

  it('passes an unrecognised message through unchanged', () => {
    expect(explainSendFailure('SMTP down')).toBe('SMTP down');
  });
});

describe('cooldownLabel', () => {
  it('invites a resend only once the wait is over', () => {
    expect(cooldownLabel(0)).toBe('Resend link');
    expect(cooldownLabel(-3)).toBe('Resend link');
  });

  it('counts down while waiting', () => {
    expect(cooldownLabel(42)).toBe('Resend in 42s');
  });
});
