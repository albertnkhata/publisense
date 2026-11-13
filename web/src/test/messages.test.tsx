import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { DM_MAX, dmErrorMessage, type Conversation, type DmMessage } from '../api/messages';
import { ConversationPage, MessagesPage, NewConversationPage, NoConversationPage } from '../pages/MessagesPage';
import { resetDmLiveForTests } from '../api/messageHooks';
import { ComposerProvider } from '../shell/composer';
import { TabBar } from '../shell/TabBar';
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
  subscribeToDmMessages: vi.fn(),
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
      <Route path="/messages" element={<MessagesPage />}>
        <Route index element={<NoConversationPage />} />
        <Route path="to/:handle" element={<NewConversationPage />} />
        <Route path=":id" element={<ConversationPage />} />
      </Route>
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
  resetDmLiveForTests();
  dm.subscribeToDmMessages.mockImplementation(() => () => {});
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

  it('is open to everyone signed in, not only staff (4c)', async () => {
    mod.fetchIsPlatformAdmin.mockResolvedValue(false);
    dm.fetchConversations.mockResolvedValue([conv()]);
    renderAt('/messages');
    expect(await screen.findByRole('list', { name: 'Inbox' })).toBeTruthy();
    expect(dm.fetchConversations).toHaveBeenCalled();
  });
});

describe('two-pane layout', () => {
  it('keeps the list beside the open conversation and marks the open one', async () => {
    dm.fetchConversations.mockResolvedValue([conv(), conv({ id: 'c3', other: STRANGER, unread: 0, last_body: 'Later' })]);
    dm.fetchMessages.mockResolvedValue([msg('m2', OTHER.id, 'See you there')]);
    renderAt('/messages/c1');
    const inbox = await screen.findByRole('list', { name: 'Inbox' });
    expect(within(inbox).getAllByRole('link')).toHaveLength(2);
    expect(within(inbox).getByRole('link', { current: 'page' }).getAttribute('href')).toBe('/messages/c1');
    expect(await screen.findByRole('region', { name: 'Conversation with @jmwamba' })).toBeTruthy();
  });

  it('shows Select a message with nothing open', async () => {
    dm.fetchConversations.mockResolvedValue([conv()]);
    renderAt('/messages');
    expect(await screen.findByText('Select a message')).toBeTruthy();
  });

  it('opens on Requests when the open conversation is a request', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ id: 'c2', other: STRANGER, state: 'request' })]);
    renderAt('/messages/c2');
    expect(await screen.findByRole('list', { name: 'Requests' })).toBeTruthy();
  });

  it('says so when a conversation is gone', async () => {
    dm.fetchConversations.mockResolvedValue([conv()]);
    renderAt('/messages/nope');
    expect(await screen.findByText('This conversation isn’t available')).toBeTruthy();
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

  it('shows a Muted pill in the thread header, unread count pill in inbox, and retries failed message loads', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ muted: true, unread: 0 }), conv({ id: 'c2', other: STRANGER, unread: 3 })]);
    dm.fetchMessages.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([msg('m1', OTHER.id, 'Back online')]);
    renderAt('/messages/c1');
    const inbox = await screen.findByRole('list', { name: 'Inbox' });
    expect(within(inbox).getByText('3 unread messages')).toBeTruthy();
    const thread = await screen.findByRole('region', { name: 'Conversation with @jmwamba' });
    expect(within(thread).getByText('Muted')).toBeTruthy();
    expect(await screen.findByText('We couldn’t load these messages')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back online')).toBeTruthy();
  });

  it('shows the DM_MAX counter near and over the limit and disables Send when over', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ unread: 0 })]);
    renderAt('/messages/c1');
    const box = await screen.findByRole('textbox', { name: 'Message' });
    const nearLimit = 'a'.repeat(DM_MAX - 150);
    fireEvent.change(box, { target: { value: nearLimit } });
    expect(screen.getByText(`${DM_MAX - 150} / ${DM_MAX}`)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(box, { target: { value: 'a'.repeat(DM_MAX + 5) } });
    expect(screen.getByText(`${DM_MAX + 5} / ${DM_MAX}`)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
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

describe('realtime', () => {
  it('opens one shared channel and refreshes the thread when a message lands', async () => {
    let onInsert: (row: { conversation_id: string }) => void = () => {};
    const stop = vi.fn();
    dm.subscribeToDmMessages.mockImplementation((_viewer: string, ins: typeof onInsert) => {
      onInsert = ins;
      return stop;
    });
    dm.fetchConversations.mockResolvedValue([conv()]);
    dm.fetchMessages.mockResolvedValue([msg('m1', OTHER.id, 'See you there')]);
    renderAt('/messages/c1');
    expect(await screen.findByText('See you there')).toBeTruthy();
    expect(dm.subscribeToDmMessages).toHaveBeenCalledTimes(1);
    expect(dm.subscribeToDmMessages).toHaveBeenCalledWith(TEST_VIEWER.id, expect.any(Function), expect.any(Function));

    dm.fetchMessages.mockResolvedValue([msg('m1', OTHER.id, 'See you there'), msg('m2', OTHER.id, 'Running late', 0)]);
    onInsert({ conversation_id: 'c1' });
    expect(await screen.findByText('Running late')).toBeTruthy();
  });

  it('subscribes for everyone signed in, not only staff (4c)', async () => {
    mod.fetchIsPlatformAdmin.mockResolvedValue(false);
    dm.fetchConversations.mockResolvedValue([conv()]);
    renderAt('/messages');
    await waitFor(() => expect(dm.subscribeToDmMessages).toHaveBeenCalled());
  });
});

describe('phone tab bar', () => {
  it('drops the floating Post button on Messages so it never covers Send', () => {
    const { unmount } = renderWith(<ComposerProvider><TabBar /></ComposerProvider>, { viewer: TEST_VIEWER });
    expect(screen.getByRole('button', { name: 'Post feedback' })).toBeTruthy();
    unmount();
    renderWith(<ComposerProvider><TabBar showPost={false} /></ComposerProvider>, { viewer: TEST_VIEWER });
    expect(screen.queryByRole('button', { name: 'Post feedback' })).toBeNull();
  });
});
