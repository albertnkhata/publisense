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
const people = vi.hoisted(() => ({ fetchProfileByHandle: vi.fn(), searchPeople: vi.fn() }));
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

  it('shows Start a conversation with nothing open, debounces people search, and lets you start a New chat', async () => {
    dm.fetchConversations.mockResolvedValue([conv()]);
    people.searchPeople.mockResolvedValue([ME, STRANGER]);
    people.fetchProfileByHandle.mockResolvedValue({ ...STRANGER, bio: '', created_at: iso(100), follower_count: 0 });
    const { router } = renderAt('/messages');
    expect(await screen.findByText('Start a conversation')).toBeTruthy();
    expect(await screen.findByText('Choose from your existing conversations, or start a new one.')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'New chat' })[1]!);
    const dialog = await screen.findByRole('dialog', { name: 'New chat' });
    const input = within(dialog).getByLabelText('Search people');

    // Below 2 chars does not hit the API, and rapid typing debounces to one call
    fireEvent.change(input, { target: { value: 's' } });
    fireEvent.change(input, { target: { value: 'sa' } });
    fireEvent.change(input, { target: { value: 'sam' } });
    expect(people.searchPeople).not.toHaveBeenCalled();

    const list = await within(dialog).findByRole('list', { name: 'People' });
    expect(people.searchPeople).toHaveBeenCalledTimes(1);
    expect(people.searchPeople).toHaveBeenCalledWith('sam');
    expect(within(list).queryByText(/@alice/)).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: /Sam Stranger/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/to/stranger'));
  });

  it('uses empty-inbox copy on Start a conversation when there are no conversations yet', async () => {
    dm.fetchConversations.mockResolvedValue([]);
    renderAt('/messages');
    expect(await screen.findByText('Send a direct message to anyone on Publisense.')).toBeTruthy();
    expect(screen.queryByText(/existing conversations/)).toBeNull();
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
    // Failed optimistic bubble is rolled back and the draft is restored so the user doesn't lose what they typed.
    const list = await screen.findByRole('list', { name: 'Messages' });
    await waitFor(() => expect(within(list).queryByText('hello?')).toBeNull());
    expect((box as HTMLTextAreaElement).value).toBe('hello?');
  });

  it('appends the message immediately on Send without waiting for the RPC or refetching the thread', async () => {
    let resolveSend!: (v: { id: string; created_at: string }) => void;
    dm.sendMessage.mockReturnValue(new Promise((r) => (resolveSend = r)));
    dm.fetchConversations.mockResolvedValue([conv({ unread: 0 })]);
    dm.fetchMessages.mockResolvedValue([msg('m1', OTHER.id, 'First thread message')]);
    renderAt('/messages/c1');
    expect(await screen.findByText('First thread message')).toBeTruthy();
    expect(dm.fetchMessages).toHaveBeenCalledTimes(1);

    const box = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Instant reply' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    // Cleared and rendered in the thread immediately while the RPC is still in flight.
    expect(box.value).toBe('');
    const thread = screen.getByRole('list', { name: 'Messages' });
    expect(await within(thread).findByText('Instant reply')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-busy')).toBeNull();

    resolveSend({ id: 'm99', created_at: iso(0) });
    await waitFor(() => expect(within(thread).getByText('Instant reply').className).not.toContain('opacity-70'));
    // Reconciled in-place from RPC response: no extra fetchMessages round-trip.
    expect(dm.fetchMessages).toHaveBeenCalledTimes(1);
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
  it('opens the existing conversation immediately by handle without waiting for fetchProfileByHandle', async () => {
    dm.fetchConversations.mockResolvedValue([conv({ unread: 0 })]);
    const { router } = renderAt('/messages/to/jmwamba');
    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/c1'));
    expect(people.fetchProfileByHandle).not.toHaveBeenCalled();
  });

  it('fetches messages in parallel with conversations on cold load of /messages/:id', async () => {
    let resolveList!: (v: Conversation[]) => void;
    dm.fetchConversations.mockReturnValue(new Promise((r) => (resolveList = r)));
    dm.fetchMessages.mockResolvedValue([msg('m1', OTHER.id, 'Already loaded')]);
    renderAt('/messages/c1');

    // fetchMessages starts immediately while dm_conversations is still pending.
    await waitFor(() => expect(dm.fetchMessages).toHaveBeenCalledWith('c1'));
    resolveList([conv({ unread: 0 })]);
    expect(await screen.findByText('Already loaded')).toBeTruthy();
    expect(dm.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it('prefetches conversation threads on hover/focus in the list', async () => {
    dm.fetchConversations.mockResolvedValue([
      conv({ id: 'c1', unread: 0 }),
      conv({ id: 'c2', other: STRANGER, unread: 0 }),
      conv({ id: 'c3', other: { ...OTHER, id: 'x3', handle: 'zed', name: 'Zed' }, unread: 0 }),
      conv({ id: 'c4', other: { ...OTHER, id: 'x4', handle: 'kai', name: 'Kai' }, unread: 0 }),
    ]);
    renderAt('/messages');
    const inbox = await screen.findByRole('list', { name: 'Inbox' });
    // Top 3 conversations warm automatically on list load; 4th warms on pointer enter.
    await waitFor(() => expect(dm.fetchMessages).toHaveBeenCalledWith('c1'));
    expect(dm.fetchMessages).not.toHaveBeenCalledWith('c4');
    fireEvent.pointerEnter(within(inbox).getByRole('link', { name: /Kai/ }));
    await waitFor(() => expect(dm.fetchMessages).toHaveBeenCalledWith('c4'));
  });

  it('starts a new one with an immediate optimistic bubble and seeds the thread on navigation', async () => {
    let resolveStart!: (v: { conversation: string; id: string; created_at: string }) => void;
    people.fetchProfileByHandle.mockResolvedValue({ ...STRANGER, bio: '', created_at: iso(100), follower_count: 0 });
    dm.fetchConversations.mockResolvedValue([]);
    dm.startConversation.mockReturnValue(new Promise((r) => (resolveStart = r)));
    const { router } = renderAt('/messages/to/stranger');
    expect(await screen.findByText(/arrives as a request/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Hello Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Hello Sam')).toBeTruthy();
    await waitFor(() => expect(dm.startConversation).toHaveBeenCalledWith(STRANGER.id, 'Hello Sam'));
    resolveStart({ conversation: 'c9', id: 'm1', created_at: iso(0) });
    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/c9'));
    // Seeded conversation and message render immediately without waiting for fetchMessages.
    expect(await screen.findByRole('region', { name: 'Conversation with @stranger' })).toBeTruthy();
    expect(screen.getByText('Hello Sam')).toBeTruthy();
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
  it('opens one shared channel and merges incoming rows directly without refetching the thread', async () => {
    let onInsert: (row: { conversation_id: string; id?: string; sender?: string | null; body?: string; created_at?: string }) => void = () => {};
    const stop = vi.fn();
    dm.subscribeToDmMessages.mockImplementation((_viewer: string, ins: typeof onInsert) => {
      onInsert = ins;
      return stop;
    });
    dm.fetchConversations.mockResolvedValue([conv()]);
    dm.fetchMessages.mockResolvedValue([msg('m1', OTHER.id, 'See you there')]);
    renderAt('/messages/c1');
    const thread = await screen.findByRole('list', { name: 'Messages' });
    expect(await within(thread).findByText('See you there')).toBeTruthy();
    expect(dm.subscribeToDmMessages).toHaveBeenCalledTimes(1);
    expect(dm.subscribeToDmMessages).toHaveBeenCalledWith(TEST_VIEWER.id, expect.any(Function), expect.any(Function));
    expect(dm.fetchMessages).toHaveBeenCalledTimes(1);

    // Full Realtime row appends straight into the cached thread with zero extra fetchMessages calls.
    onInsert({ conversation_id: 'c1', id: 'm2', sender: OTHER.id, body: 'Running late', created_at: iso(0) });
    expect(await screen.findByText('Running late')).toBeTruthy();
    expect(dm.fetchMessages).toHaveBeenCalledTimes(1);

    // Re-delivering the same id is a no-op (no duplicate bubble).
    onInsert({ conversation_id: 'c1', id: 'm2', sender: OTHER.id, body: 'Running late', created_at: iso(0) });
    expect(screen.getAllByText('Running late')).toHaveLength(1);
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

  it('hides the fixed bar while a text input has focus and restores it on blur', () => {
    renderWith(
      <ComposerProvider>
        <input aria-label="Reply" />
        <TabBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const input = screen.getByLabelText('Reply');
    expect(nav.className).toContain('max-sm:grid');

    fireEvent.focusIn(input);
    expect(nav.className).not.toContain('max-sm:grid');

    fireEvent.focusOut(input, { relatedTarget: null });
    expect(nav.className).toContain('max-sm:grid');
  });
});
