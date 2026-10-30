import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { SettingsPage } from '../pages/SettingsPage';
import { toPrefMap } from '../api/notifications';
import { validateProfile } from '../api/profile';
import { renderWith, TEST_VIEWER } from './renderApp';

/*
 * A small in-memory stand-in for the Supabase query builder: records filters,
 * resolves rows per table. Enough for the settings screens' reads and writes.
 */
const db = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  upserts: [] as Array<Record<string, unknown>>,
  failUpsert: false,
}));

vi.mock('../api/supabase', () => {
  function builder(table: string) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const b = {
      select: () => b,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
      upsert: (row: Record<string, unknown>) => {
        db.upserts.push(row);
        if (db.failUpsert) return Promise.resolve({ error: { message: 'refused' } });
        const rest = (db.rows[table] ?? []).filter((r) => !(r.kind === row.kind && r.channel === row.channel));
        db.rows[table] = [...rest, row];
        return Promise.resolve({ error: null });
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: (db.rows[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(resolve),
    };
    return b;
  }
  return {
    hasSupabaseConfig: true,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    getSupabase: () => ({ from: builder }),
    publicStorageUrl: () => null,
  };
});

beforeEach(() => {
  db.rows = {};
  db.upserts = [];
  db.failUpsert = false;
});

describe('notification preferences', () => {
  it('reads an absent row as enabled', () => {
    const map = toPrefMap([{ kind: 'reply', channel: 'email', enabled: false }]);
    expect(map['reply:email']).toBe(false);
    expect(map['reply:in_app']).toBe(true);
    expect(map['join:email']).toBe(true);
    expect(Object.keys(map)).toHaveLength(18);
  });

  it('shows every kind × channel and saves a toggle as an upsert', async () => {
    db.rows.notification_pref = [{ kind: 'reply', channel: 'email', enabled: false }];
    renderWith(<SettingsPage />, { viewer: TEST_VIEWER, path: '/settings' });
    const replyEmail = (await screen.findByRole('checkbox', { name: 'Replies: Email' })) as HTMLInputElement;
    expect(screen.getAllByRole('checkbox')).toHaveLength(18);
    expect(replyEmail.checked).toBe(false);
    const mentionEmail = screen.getByRole('checkbox', { name: 'Mentions: Email' }) as HTMLInputElement;
    expect(mentionEmail.checked).toBe(true);

    fireEvent.click(mentionEmail);
    await waitFor(() => expect(db.upserts).toHaveLength(1));
    expect(db.upserts[0]).toEqual({ user_id: TEST_VIEWER.id, kind: 'mention', channel: 'email', enabled: false });
    expect(mentionEmail.checked).toBe(false);
  });

  it('puts a refused toggle back and says so', async () => {
    db.failUpsert = true;
    renderWith(<SettingsPage />, { viewer: TEST_VIEWER, path: '/settings' });
    const box = (await screen.findByRole('checkbox', { name: 'New followers: In app' })) as HTMLInputElement;
    fireEvent.click(box);
    expect(await screen.findByText('Couldn’t save that change. Try again.')).toBeTruthy();
    await waitFor(() => expect(box.checked).toBe(true));
  });
});

describe('settings', () => {
  it('renders sections with explicit anchor ids for deep linking', () => {
    renderWith(<SettingsPage />, { viewer: TEST_VIEWER, path: '/settings' });
    expect(document.getElementById('profile')).toBeTruthy();
    expect(document.getElementById('notifications')).toBeTruthy();
    expect(document.getElementById('account')).toBeTruthy();
  });

  it('asks a signed-out visitor to sign in', async () => {
    renderWith(<SettingsPage />, { path: '/settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('dialog', { name: 'Sign in to Publisense' })).toBeTruthy();
    expect(screen.getByText('Sign in to manage your settings. It takes a few seconds.')).toBeTruthy();
  });

  it('validates the profile like the table does', () => {
    expect(validateProfile({ name: 'A', handle: 'ok_handle', bio: '' })).toEqual({});
    expect(validateProfile({ name: ' ', handle: 'No Caps', bio: 'x'.repeat(281) })).toEqual({
      name: 'Add your name.',
      handle: '3 to 30 characters: lowercase letters, numbers and underscores.',
      bio: 'Keep it to 280 characters.',
    });
  });

  it('drops a handle error as soon as the handle is edited', async () => {
    renderWith(<SettingsPage />, { viewer: TEST_VIEWER, path: '/settings' });
    const handle = screen.getByRole('textbox', { name: 'Handle' });
    fireEvent.change(handle, { target: { value: 'qa-user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    const rule = '3 to 30 characters: lowercase letters, numbers and underscores.';
    expect(await screen.findByText(rule)).toBeTruthy();
    fireEvent.change(handle, { target: { value: 'qa_user' } });
    expect(screen.queryByText(rule)).toBeNull();
    expect((screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('only deletes after the handle is typed', async () => {
    renderWith(<SettingsPage />, { viewer: TEST_VIEWER, path: '/settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete account?' });
    const del = within(dialog).getByRole('button', { name: 'Delete account' }) as HTMLButtonElement;
    await waitFor(() => expect(within(dialog).queryByText(/Checking boards/)).toBeNull());
    expect(del.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'alice' } });
    expect(del.disabled).toBe(false);
  });

  it('refuses up front while the user is the only owner of a board', async () => {
    const board = 'b0000000-0000-4000-8000-000000000001';
    db.rows.membership = [{ user_id: TEST_VIEWER.id, scope: 'board', scope_id: board, role: 'owner' }];
    db.rows.board = [{ id: board, name: 'Cursor' }];
    renderWith(<SettingsPage />, { viewer: TEST_VIEWER, path: '/settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete account?' });
    expect(await within(dialog).findByText(/You’re the only owner of Cursor/)).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '@alice' } });
    expect((within(dialog).getByRole('button', { name: 'Delete account' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a co-owned board does not block deletion', async () => {
    const board = 'b0000000-0000-4000-8000-000000000001';
    db.rows.membership = [
      { user_id: TEST_VIEWER.id, scope: 'board', scope_id: board, role: 'owner' },
      { user_id: 'someone-else', scope: 'board', scope_id: board, role: 'owner' },
    ];
    renderWith(<SettingsPage />, { viewer: TEST_VIEWER, path: '/settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete account?' });
    await waitFor(() => expect(within(dialog).queryByText(/Checking boards/)).toBeNull());
    expect(within(dialog).queryByText(/only owner/)).toBeNull();
  });
});
