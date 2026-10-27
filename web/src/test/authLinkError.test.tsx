import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { parseAuthLinkError, withoutAuthLinkError } from '../api/authLinkError';
import { AuthLinkErrorWatcher } from '../shell/AuthLinkErrorWatcher';
import { renderWith } from './renderApp';

/* Expired or already-used email links (#137). */
const api = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), fetchAuthCapabilities: vi.fn() }));
vi.mock('../api/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/auth')>();
  return { ...real, requestPasswordReset: api.requestPasswordReset, useAuthCapabilities: () => api.fetchAuthCapabilities() };
});

const EXPIRED_HASH = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

describe('parseAuthLinkError', () => {
  it('reads Supabase’s expired-link redirect from the hash', () => {
    expect(parseAuthLinkError(EXPIRED_HASH, '')).toEqual({
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
      expired: true,
    });
  });

  it('reads it from the query string too (PKCE flow)', () => {
    expect(parseAuthLinkError('', '?error=access_denied&error_code=otp_expired')?.expired).toBe(true);
  });

  it('ignores ordinary URLs and session fragments', () => {
    expect(parseAuthLinkError('', '')).toBeNull();
    expect(parseAuthLinkError('#main', '?token=abc')).toBeNull();
    expect(parseAuthLinkError('#access_token=x&type=recovery', '')).toBeNull();
  });

  it('flags other errors as not expired', () => {
    expect(parseAuthLinkError('#error=server_error&error_description=Database+error', '')).toEqual({
      code: 'server_error',
      description: 'Database error',
      expired: false,
    });
  });
});

describe('withoutAuthLinkError', () => {
  it('strips the error params and the empty hash', () => {
    expect(withoutAuthLinkError(`https://publisense.app/${EXPIRED_HASH}`)).toBe('https://publisense.app/');
    expect(withoutAuthLinkError(`https://publisense.app/?error=access_denied&error_code=otp_expired&x=1#sb`)).toBe(
      'https://publisense.app/?x=1',
    );
  });

  it('keeps anything else in the URL', () => {
    expect(withoutAuthLinkError('https://publisense.app/explore?q=a#error=x&keep=1')).toBe('https://publisense.app/explore?q=a#keep=1');
  });
});

describe('AuthLinkErrorWatcher', () => {
  beforeEach(() => {
    api.requestPasswordReset.mockReset();
    api.fetchAuthCapabilities.mockReturnValue({ google: false, confirmEmail: true });
    window.history.replaceState(null, '', `/${EXPIRED_HASH}`);
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('explains an expired link, clears it from the address bar and sends a new one', async () => {
    api.requestPasswordReset.mockResolvedValue({ error: null });
    renderWith(<AuthLinkErrorWatcher initial={null} />);
    expect(await screen.findByRole('dialog', { name: 'That link has expired' })).toBeTruthy();
    expect(screen.getByText(/Email links work once and expire after an hour/)).toBeTruthy();
    expect(window.location.hash).toBe('');

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'ana@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith('ana@example.org'));
    expect(await screen.findByRole('dialog', { name: 'Check your email' })).toBeTruthy();
  });

  it('offers sign-in from the expired dialog', async () => {
    renderWith(<AuthLinkErrorWatcher initial={null} />);
    await screen.findByRole('dialog', { name: 'That link has expired' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('dialog', { name: 'Sign in to Publisense' })).toBeTruthy();
  });

  it('strips all three error params from the query string too, keeping anything else', async () => {
    window.history.replaceState(null, '', '/explore?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&cat=dev');
    renderWith(<AuthLinkErrorWatcher initial={null} />);
    expect(await screen.findByRole('dialog', { name: 'That link has expired' })).toBeTruthy();
    expect(window.location.pathname).toBe('/explore');
    expect(window.location.search).toBe('?cat=dev');
    expect(window.location.href).not.toMatch(/error/);
  });

  it('handles a link opened in a tab that already has the app (hash change, no reload)', async () => {
    window.history.replaceState(null, '', '/');
    renderWith(<AuthLinkErrorWatcher initial={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      window.history.replaceState(null, '', `/${EXPIRED_HASH}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('dialog', { name: 'That link has expired' })).toBeTruthy();
    expect(window.location.hash).toBe('');
  });

  it('on the reset page, only cleans the URL: the page explains the expired link itself', () => {
    window.history.replaceState(null, '', `/auth/reset${EXPIRED_HASH}`);
    renderWith(<AuthLinkErrorWatcher initial={null} />, { path: '/auth/reset' });
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/auth/reset');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does nothing on a normal visit', () => {
    window.history.replaceState(null, '', '/');
    renderWith(<AuthLinkErrorWatcher initial={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
