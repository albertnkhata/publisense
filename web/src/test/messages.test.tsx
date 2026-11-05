import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { dmErrorMessage, type Conversation, type DmMessage } from '../api/messages';
import { ConversationPage, MessagesPage, NewConversationPage } from '../pages/MessagesPage';
import { iso, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const dm = vi.hoisted(() => ({
  fetchConversations: vi.fn(),
  fetchMessages: vi.fn(),
  startConversation: vi.fn(),
  sendMessage: vi.fn(),
  acceptRequest: vi.fn(),
  deleteConversation: vi.fn(),
  markConversationRead: vi.fn(),
  setPersonBlocked: vi.fn(),
}));
const mod = vi.hoisted(() => ({ fetchIsPlatformAdmin: vi.fn() }));
const people = vi.hoisted(() => ({ fetchProfileByHandle: vi.fn() }));
vi.mock('../api/messages', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/messages')>()), ...dm }));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...mod }));
vi.mock('../api/people', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/people')>()), ...people }));

const STRANGER = { id: '00000000-0000-4000-8000-0000000000cc', handle: 'stranger', name: 'Sam Stranger', avatar_path: null };

function conv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    state: 'inbox',
    muted: false,
    other: OTHER,
    last_body: 'See you there',
    last_sender: OTHER.id,
    last_at: iso(1),
    unread: 1,
    blocked: false,
    ...over,
  };
}
const msg = (id: string, sender: string, body: string, hoursAgo = 1): DmMessage => ({ id, conversation_id: 'c1', sender, body, created_at: iso(hoursAgo) });

function renderAt(path: string) {
  return renderWith(
    <Routes>
      <Route path="/messages" element={<MessagesPage />} />
      <Route path="/messages/to/:handle" element={<NewConversationPage />} />
      <Route path="/messages/:id" element={<ConversationPage />} />
    </Routes>,
    { viewer: TEST_VIEWER, path },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mod.fetchIsPlatformAdmin.mockResolvedValue(true);
  dm.fetchMessages.mockResolvedValue([]);
  dm.markConversationRead.mockResolvedValue(undefined);
  dm.sendMessage.mockResolvedValue(undefined);
  dm.acceptRequest.mockResolvedValue(undefined);
  dm.deleteConversation.mockResolvedValue(undefined);
  dm.setPersonBlocked.mockResolvedValue(undefined);
});

describe('messages list', () => {
  it('splits Inbox and Requests, and shows who sent the last line', async () => {
    dm.fetchConversations.mockResolvedValue([
      conv(),
      conv({ id: 'c2', other: STRANGER, state: 'request', last_body: 'Hi, quick question', last_sender: STRANGER.id }),
      conv({ id: 'c3', other: { ...OTHER, id: 'x3', handle: 'zed', name: 'Zed' }, unread: 0, last_sender: ME.id, last_body: 'Thanks!' }),
    ]);
    renderAt('/messages');
    const inbox = await screen.findByRole('list', { name: 'Inbox' });
    expect(within(inbox).getAllByRole('link')).toHaveLength(2);
    expect(within(inbox).getByText(/You: Thanks!/)).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Inbox/ }).textContent).toContain('1');
    fireEvent.click(screen.getByRole('tab', { name: /Requests/ }));
    const reqs = await screen.findByRole('list', { name: 'Requests' });
    expect(within(reqs).getByText('Hi, quick question')).toBeTruthy();
    expect(screen.getByText(/won’t know you’ve seen their message/)).toBeTruthy();
  });

  it('is hidden from people outside the rollout', async () => {
    mod.fetchIsPlatformAdmin.mockResolvedValue(false);
    dm.fetchConversations.mockResolvedValue([conv()]);
    renderAt('/messages');
    expect(await screen.findByText(/Page not found|isn’t here|not found/i)).toBeTruthy();
    expect(dm.fetchConversations).not.toHaveBeenCalled();
  });
});

describe('a conversation', () => {
  it('shows the thread, marks it read and sends with Enter', async () => {
    dm.fetchConversations.mockResolvedValue([conv()]);
    dm.fetchMessages.mockResolvedValue([msg('m1', ME.id, 'Coming tonight?', 2), msg('m2', OTHER.id, 'See you there')]);
    renderAt('/messages/c1');
    expect(await screen.findByText('Coming tonight?')).toBeTruthy();
    await waitFor(() => expect(dm.markConversationRead).toHaveBeenCalledWith('c1', expect.anything()));
    const box = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(box, { target: { value: '  On my way  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(dm.sendMessage).toHaveBeenCalledWith('c1', 'On my way'));
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
  });

  it('a request offers Accept, Delete and Block, and is not marked read', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ id: 'c2', other: STRANGER, state: 'request' })]);
    dm.fetchMessages.mockResolvedValue([msg('m1', STRANGER.id, 'Hi, quick question')]);
    renderAt('/messages/c2');
    expect(await screen.findByText('Hi, quick question')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(dm.markConversationRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(dm.acceptRequest).toHaveBeenCalledWith('c2', expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(dm.setPersonBlocked).toHaveBeenCalledWith(STRANGER.id, true));
  });

  it('a blocked person gets no composer', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ blocked: true, unread: 0 })]);
    renderAt('/messages/c1');
    expect(await screen.findByText(/You blocked @jmwamba/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });

  it('shows the refusal from the server in words', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ unread: 0 })]);
    const { ApiError } = await import('../api/posts');
    dm.sendMessage.mockRejectedValue(new ApiError(dmErrorMessage({ error: 'awaiting_accept' })));
    renderAt('/messages/c1');
    const box = await screen.findByRole('textbox', { name: 'Message' });
    fireEvent.change(box, { target: { value: 'hello?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('You can send more once they accept your request.')).toBeTruthy();
  });
});

describe('starting a conversation', () => {
  it('opens the existing conversation with that person', async () => {
    people.fetchProfileByHandle.mockResolvedValue({ ...OTHER, bio: '', created_at: iso(100), follower_count: 0 });
    dm.fetchConversations.mockResolvedValue([conv({ unread: 0 })]);
    const { router } = renderAt('/messages/to/jmwamba');
    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/c1'));
  });

  it('starts a new one with the first message', async () => {
    people.fetchProfileByHandle.mockResolvedValue({ ...STRANGER, bio: '', created_at: iso(100), follower_count: 0 });
    dm.fetchConversations.mockResolvedValue([]);
    dm.startConversation.mockResolvedValue('c9');
    const { router } = renderAt('/messages/to/stranger');
    expect(await screen.findByText(/arrives as a request/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Hello Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(dm.startConversation).toHaveBeenCalledWith(STRANGER.id, 'Hello Sam'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/c9'));
  });
});

describe('dm error copy', () => {
  it('words each refusal', () => {
    expect(dmErrorMessage({ error: 'not_allowed' })).toBe('You can’t message this person.');
    expect(dmErrorMessage({ error: 'rate_limited', hint: 'conversations' })).toMatch(/started a lot of conversations/);
    expect(dmErrorMessage({ error: 'rate_limited', hint: 'short' })).toMatch(/quickly/);
    expect(dmErrorMessage({ error: 'confirm_email' })).toMatch(/Confirm your email/);
    expect(dmErrorMessage({ error: 'weird' })).toBe('Something went wrong. Try again.');
  });
});
