import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { UnsubscribePage } from '../pages/UnsubscribePage';
import { renderWith } from './renderApp';

// Stub the client: the page and unsubscribe helpers run for real on top of it.
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../api/supabase', () => ({
  hasSupabaseConfig: true,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  getSupabase: () => ({ rpc }),
  publicStorageUrl: () => null,
}));

const TOKEN = '6f1c2a5e-0d3b-4c7a-9e21-3b5f8d9a0c11';

beforeEach(() => rpc.mockReset());

describe('/unsubscribe', () => {
  it('turns off only the requested email category when ?kind= is given, and offers an optional Unsubscribe from all action (Check 7.3)', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    renderWith(<UnsubscribePage />, { path: `/unsubscribe?token=${TOKEN}&kind=reply` });
    expect(await screen.findByText('You’re unsubscribed')).toBeTruthy();
    expect(screen.getByText(/We won’t send you reply emails anymore/)).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('unsubscribe', { p_token: TOKEN, p_kind: 'reply' });

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe from all emails' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('unsubscribe', { p_token: TOKEN }));
    expect(await screen.findByText(/We won’t send you any more emails/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unsubscribe from all emails' })).toBeNull();
  });

  it('rejects an unknown ?kind= without turning off all emails', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    renderWith(<UnsubscribePage />, { path: `/unsubscribe?token=${TOKEN}&kind=not_a_kind` });
    expect(await screen.findByText('This link didn’t work')).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('turns every email off in one go when no kind is specified, with no sign-in', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    renderWith(<UnsubscribePage />, { path: `/unsubscribe?token=${TOKEN}` });
    expect(await screen.findByText('You’re unsubscribed')).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('unsubscribe', { p_token: TOKEN });
    expect(screen.getByRole('link', { name: 'Email settings' }).getAttribute('href')).toBe('/settings');
    expect(screen.queryByRole('button', { name: 'Unsubscribe from all emails' })).toBeNull();
  });

  it('answers an unknown token with the same neutral message as a malformed one', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    renderWith(<UnsubscribePage />, { path: `/unsubscribe?token=${TOKEN}` });
    const unknown = (await screen.findByText('This link didn’t work')).parentElement?.textContent;
    expect(unknown).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
    cleanup();

    rpc.mockClear();
    renderWith(<UnsubscribePage />, { path: '/unsubscribe?token=not-a-token' });
    const malformed = (await screen.findByText('This link didn’t work')).parentElement?.textContent;
    expect(malformed).toBe(unknown);
    expect(rpc).not.toHaveBeenCalled(); // malformed: no round trip
  });

  it('treats a missing token as an invalid link', async () => {
    renderWith(<UnsubscribePage />, { path: '/unsubscribe' });
    expect(await screen.findByText('This link didn’t work')).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a database error is not a confirmation either', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid input syntax for type uuid' } });
    renderWith(<UnsubscribePage />, { path: `/unsubscribe?token=${TOKEN}` });
    expect(await screen.findByText('This link didn’t work')).toBeTruthy();
  });

  it('offers a retry when the network is down', async () => {
    // postgrest-js reports a failed fetch as an error object, not a throw.
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    renderWith(<UnsubscribePage />, { path: `/unsubscribe?token=${TOKEN}` });
    expect(await screen.findByText('We couldn’t reach Publisense')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
