import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { ChooseHandleDialog } from '../shell/ChooseHandleDialog';
import { viewerFrom, type Viewer } from '../lib/viewer';
import { renderWith } from './renderApp';

const api = vi.hoisted(() => ({ isHandleTaken: vi.fn(), markHandleChosen: vi.fn(), updateHandle: vi.fn() }));
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  isHandleTaken: api.isHandleTaken,
  markHandleChosen: api.markHandleChosen,
}));
vi.mock('../api/profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/profile')>()),
  updateHandle: api.updateHandle,
}));

const viewer = (chooseHandle: boolean): Viewer => ({
  id: 'u1',
  name: 'Nia',
  handle: 'niaexample',
  bio: '',
  email: 'nia.example@gmail.com',
  hasPassword: false,
  connected: [{ provider: 'google', email: 'nia.example@gmail.com' }],
  chooseHandle,
});

const input = () => screen.getByRole('textbox', { name: 'Handle' }) as HTMLInputElement;

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.isHandleTaken.mockResolvedValue(false);
  api.updateHandle.mockResolvedValue({ error: null });
});

describe('ChooseHandleDialog', () => {
  it('offers the handle Google sign-up made, and keeping it asks nothing again', () => {
    renderWith(<ChooseHandleDialog />, { viewer: viewer(true) });
    expect(screen.getByRole('dialog', { name: 'Choose your handle' })).toBeTruthy();
    expect(input().value).toBe('niaexample');
    fireEvent.click(screen.getByRole('button', { name: 'Keep @niaexample' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.markHandleChosen).toHaveBeenCalledTimes(1);
    expect(api.updateHandle).not.toHaveBeenCalled();
  });

  it('checks a new handle live and saves it', async () => {
    renderWith(<ChooseHandleDialog />, { viewer: viewer(true) });
    fireEvent.change(input(), { target: { value: 'Nia_B' } });
    expect(await screen.findByText('@nia_b is available.', {}, { timeout: 2000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateHandle).toHaveBeenCalledWith('u1', 'nia_b'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.markHandleChosen).toHaveBeenCalledTimes(1);
  });

  it('will not save a taken handle', async () => {
    api.isHandleTaken.mockResolvedValue(true);
    renderWith(<ChooseHandleDialog />, { viewer: viewer(true) });
    fireEvent.change(input(), { target: { value: 'nia' } });
    expect(await screen.findByText('@nia is taken.', {}, { timeout: 2000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toBe('That handle is taken. Try another.');
    expect(api.updateHandle).not.toHaveBeenCalled();
  });

  it('shows nothing when the account is not asked', () => {
    renderWith(<ChooseHandleDialog />, { viewer: viewer(false) });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('viewerFrom: who is asked to choose a handle', () => {
  const user = (over: Partial<User>): User =>
    ({
      id: 'u1',
      email: 'nia@gmail.com',
      created_at: new Date().toISOString(),
      user_metadata: {},
      identities: [{ provider: 'google', identity_data: { email: 'nia@gmail.com' } }],
      ...over,
    }) as unknown as User;

  it('asks a new Google-only account', () => {
    expect(viewerFrom(user({}), null).chooseHandle).toBe(true);
  });
  it('does not ask once chosen, for password accounts, or for accounts over a day old', () => {
    expect(viewerFrom(user({ user_metadata: { handle_chosen: true } }), null).chooseHandle).toBe(false);
    expect(viewerFrom(user({ identities: [{ provider: 'email' }] as User['identities'] }), null).chooseHandle).toBe(false);
    expect(viewerFrom(user({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }), null).chooseHandle).toBe(false);
  });
});
