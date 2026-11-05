import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { Conversation } from '../api/messages';
import { resetDmLiveForTests } from '../api/messageHooks';
import { ConversationPage, MessagesPage } from '../pages/MessagesPage';
import { MessagesSettings } from '../pages/SettingsPage';
import { iso, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const dm = vi.hoisted(() => ({
  fetchConversations: vi.fn(),
  fetchMessages: vi.fn(),
  markConversationRead: vi.fn(),
  muteConversation: vi.fn(),
  fetchDmPolicy: vi.fn(),
  setDmPolicy: vi.fn(),
  fetchBlockedPeople: vi.fn(),
  setPersonBlocked: vi.fn(),
  subscribeToDmMessages: vi.fn(),
}));
const mod = vi.hoisted(() => ({ fetchIsPlatformAdmin: vi.fn() }));
vi.mock('../api/messages', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/messages')>()), ...dm }));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...mod }));

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  state: 'inbox',
  muted: false,
  other: OTHER,
  last_body: 'See you there',
  last_sender: OTHER.id,
  last_at: iso(1),
  unread: 0,
  blocked: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetDmLiveForTests();
  mod.fetchIsPlatformAdmin.mockResolvedValue(true);
  dm.subscribeToDmMessages.mockImplementation(() => () => {});
  dm.fetchMessages.mockResolvedValue([]);
  dm.markConversationRead.mockResolvedValue(undefined);
  dm.muteConversation.mockResolvedValue(undefined);
  dm.fetchDmPolicy.mockResolvedValue('everyone');
  dm.setDmPolicy.mockResolvedValue(undefined);
  dm.fetchBlockedPeople.mockResolvedValue([]);
  dm.setPersonBlocked.mockResolvedValue(undefined);
});

function renderThread() {
  return renderWith(
    <Routes>
      <Route path="/messages" element={<MessagesPage />}>
        <Route path=":id" element={<ConversationPage />} />
      </Route>
    </Routes>,
    { viewer: TEST_VIEWER, path: '/messages/c1' },
  );
}

describe('mute', () => {
  it('mutes from the conversation menu', async () => {
    dm.fetchConversations.mockResolvedValue([conv()]);
    renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Conversation options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Mute conversation/ }));
    await waitFor(() => expect(dm.muteConversation).toHaveBeenCalledWith('c1', true));
  });

  it('marks a muted conversation in the list and offers Unmute', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ muted: true })]);
    renderThread();
    const inbox = await screen.findByRole('list', { name: 'Inbox' });
    expect(within(inbox).getByRole('img', { name: 'Muted' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Conversation options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Unmute conversation/ }));
    await waitFor(() => expect(dm.muteConversation).toHaveBeenCalledWith('c1', false));
  });
});

describe('message settings', () => {
  it('shows and saves who can message you', async () => {
    dm.fetchDmPolicy.mockResolvedValue('following');
    renderWith(<MessagesSettings viewer={TEST_VIEWER} />, { viewer: TEST_VIEWER });
    const following = await screen.findByRole('radio', { name: /People you follow/ });
    await waitFor(() => expect((following as HTMLInputElement).checked).toBe(true));
    fireEvent.click(screen.getByRole('radio', { name: /No one/ }));
    await waitFor(() => expect(dm.setDmPolicy).toHaveBeenCalledWith('nobody', expect.anything()));
  });

  it('shows the unread-message email setting', async () => {
    renderWith(<MessagesSettings viewer={TEST_VIEWER} />, { viewer: TEST_VIEWER });
    const box = await screen.findByRole('checkbox', { name: 'Email me about unread messages' });
    expect(box).toBeTruthy();
  });

  it('lists blocked people and unblocks', async () => {
    dm.fetchBlockedPeople.mockResolvedValue([{ ...OTHER, blocked_at: iso(2) }]);
    renderWith(<MessagesSettings viewer={TEST_VIEWER} />, { viewer: TEST_VIEWER });
    const list = await screen.findByRole('list', { name: 'Blocked people' });
    fireEvent.click(within(list).getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(dm.setPersonBlocked).toHaveBeenCalledWith(OTHER.id, false));
  });

  it('shows for everyone signed in, not only staff (4c)', async () => {
    mod.fetchIsPlatformAdmin.mockResolvedValue(false);
    renderWith(<MessagesSettings viewer={TEST_VIEWER} />, { viewer: TEST_VIEWER });
    expect(await screen.findByRole('checkbox', { name: 'Email me about unread messages' })).toBeTruthy();
  });
});
