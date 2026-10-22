import { describe, expect, it, vi } from 'vitest';
import {
  createRecoverySignal,
  isRecoveryRedirect,
  shouldCloseAuthModalOnAuthEvent,
  shouldDetectSessionInUrl,
} from './recoverySignal';

/**
 * These tests exist because of a production defect (issue #61): an emailed
 * reset link signed the user in and never offered a new password. Two earlier
 * fixes read the URL and were inert, because supabase consumes and clears the
 * redirect fragment before React can look at it.
 *
 * The rules protected here: the recovery fact is recorded the instant it is
 * observable, it is delivered to whoever asks (on mount or later), and it can
 * be retired so the prompt does not reappear forever.
 */

describe('recovery signal', () => {
  it('is clear until something marks it', () => {
    const signal = createRecoverySignal();
    expect(signal.peek()).toBe(false);
  });

  it('stays marked until cleared, so a late reader still sees it', () => {
    const signal = createRecoverySignal();
    signal.mark();
    expect(signal.peek()).toBe(true);
    expect(signal.peek()).toBe(true);
  });

  it('notifies a listener each time it is marked', () => {
    const signal = createRecoverySignal();
    const listener = vi.fn();
    signal.subscribe(listener);
    signal.mark();
    signal.clear();
    signal.mark();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const signal = createRecoverySignal();
    const listener = vi.fn();
    const unsubscribe = signal.subscribe(listener);
    unsubscribe();
    signal.mark();
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps notifying the other listeners when one throws', () => {
    const signal = createRecoverySignal();
    const survivor = vi.fn();
    signal.subscribe(() => {
      throw new Error('listener blew up');
    });
    signal.subscribe(survivor);
    expect(() => signal.mark()).not.toThrow();
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it('clears once the step has been handled', () => {
    const signal = createRecoverySignal();
    signal.mark();
    signal.clear();
    expect(signal.peek()).toBe(false);
  });

  it('does not confuse two independent signals', () => {
    const first = createRecoverySignal();
    const second = createRecoverySignal();
    first.mark();
    expect(first.peek()).toBe(true);
    expect(second.peek()).toBe(false);
  });
});

describe('isRecoveryRedirect', () => {
  it('recognises the fragment supabase actually mails', () => {
    expect(
      isRecoveryRedirect({
        access_token: 'jwt',
        refresh_token: 'rt',
        token_type: 'bearer',
        expires_in: '3600',
        type: 'recovery',
      })
    ).toBe(true);
  });

  it('recognises a token_hash recovery link', () => {
    expect(isRecoveryRedirect({ token_hash: 'abc', type: 'recovery' })).toBe(true);
  });

  it('recognises a PKCE recovery callback', () => {
    expect(isRecoveryRedirect({ code: 'xyz', type: 'recovery' })).toBe(true);
  });

  it('ignores a non-recovery redirect that carries a session', () => {
    expect(isRecoveryRedirect({ access_token: 'jwt', type: 'magiclink' })).toBe(false);
  });

  it('ignores a bare type=recovery with no credential', () => {
    expect(isRecoveryRedirect({ type: 'recovery' })).toBe(false);
  });

  it('ignores an ordinary visit', () => {
    expect(isRecoveryRedirect({})).toBe(false);
  });
});

describe('shouldDetectSessionInUrl', () => {
  /**
   * The hook replaces supabase's own predicate, so any drift here silently
   * changes which URLs the client consumes. These are the cases auth-js
   * (`_isImplicitGrantCallback`) treats as a callback.
   */
  it('accepts the callback shapes supabase accepts', () => {
    expect(shouldDetectSessionInUrl({ access_token: 'jwt' })).toBe(true);
  });

  it('still consumes a redirect that carries an error', () => {
    expect(shouldDetectSessionInUrl({ error: 'access_denied' })).toBe(true);
    expect(shouldDetectSessionInUrl({ error_description: 'nope' })).toBe(true);
    expect(shouldDetectSessionInUrl({ error_code: 'otp_expired' })).toBe(true);
  });

  it('leaves an ordinary visit alone', () => {
    expect(shouldDetectSessionInUrl({})).toBe(false);
    expect(shouldDetectSessionInUrl({ type: 'recovery' })).toBe(false);
  });
});

describe('shouldCloseAuthModalOnAuthEvent', () => {
  /**
   * The modal is the reset flow's only surface. Closing it at the wrong moment
   * is how this bug survived three fixes, so both orderings are pinned here.
   */
  it('never closes while a recovery step is pending, whatever the event', () => {
    expect(shouldCloseAuthModalOnAuthEvent('PASSWORD_RECOVERY', true)).toBe(false);
    expect(shouldCloseAuthModalOnAuthEvent('INITIAL_SESSION', true)).toBe(false);
    expect(shouldCloseAuthModalOnAuthEvent('SIGNED_IN', true)).toBe(false);
    expect(shouldCloseAuthModalOnAuthEvent('TOKEN_REFRESHED', true)).toBe(false);
  });

  it('keeps it open for the password actually being set', () => {
    expect(shouldCloseAuthModalOnAuthEvent('USER_UPDATED', false)).toBe(false);
  });

  it('keeps it open for the recovery event itself, pending or not', () => {
    expect(shouldCloseAuthModalOnAuthEvent('PASSWORD_RECOVERY', false)).toBe(false);
  });

  it('still closes on an ordinary sign-in so the feed is usable', () => {
    expect(shouldCloseAuthModalOnAuthEvent('SIGNED_IN', false)).toBe(true);
    expect(shouldCloseAuthModalOnAuthEvent('INITIAL_SESSION', false)).toBe(true);
  });
});
