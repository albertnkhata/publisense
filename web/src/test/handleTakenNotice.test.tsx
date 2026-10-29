import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { HandleTakenNotice } from '../shell/HandleTakenNotice';
import type { Viewer } from '../lib/viewer';
import { renderWith } from './renderApp';

const clearRequestedHandle = vi.hoisted(() => vi.fn());
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  clearRequestedHandle,
}));

const viewer = (handle: string, requestedHandle: string | null): Viewer => ({
  id: 'u1',
  name: 'Nia',
  handle,
  bio: '',
  email: 'nia@b.co',
  hasPassword: true,
  connected: [],
  requestedHandle,
});

beforeEach(() => clearRequestedHandle.mockReset());

describe('HandleTakenNotice', () => {
  it('says the handle was taken and offers to keep the new one', () => {
    renderWith(<HandleTakenNotice />, { viewer: viewer('nia2', 'nia') });
    expect(screen.getByRole('dialog', { name: '@nia was taken' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep @nia2' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRequestedHandle).toHaveBeenCalledTimes(1);
  });

  it('takes the user to Settings to change it', () => {
    const { router } = renderWith(<HandleTakenNotice />, { viewer: viewer('nia2', 'nia') });
    fireEvent.click(screen.getByRole('button', { name: 'Change handle' }));
    expect(router.state.location.pathname).toBe('/settings');
    expect(clearRequestedHandle).toHaveBeenCalledTimes(1);
  });

  it('stays quiet, and forgets the request, when the handle was granted', () => {
    renderWith(<HandleTakenNotice />, { viewer: viewer('nia', 'nia') });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRequestedHandle).toHaveBeenCalledTimes(1);
  });

  it('shows nothing for accounts that never asked for a handle', () => {
    renderWith(<HandleTakenNotice />, { viewer: viewer('nia', null) });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRequestedHandle).not.toHaveBeenCalled();
  });
});
