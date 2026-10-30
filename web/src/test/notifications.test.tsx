import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { AppNotification } from '../api/notifications';
import { describeNotification, NotificationsPage } from '../pages/NotificationsPage';
import { ComposerProvider } from '../shell/composer';
import { NavRail } from '../shell/NavRail';
import { TopBar } from '../shell/TopBar';
import { BOARD, iso, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const api = vi.hoisted(() => ({ fetchNotifications: vi.fn(), fetchUnreadCount: vi.fn(), markNotificationsRead: vi.fn() }));
const people = vi.hoisted(() => ({ fetchFollowedUsers: vi.fn(), setUserFollow: vi.fn() }));
vi.mock('../api/notifications', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/notifications')>()), ...api }));
vi.mock('../api/people', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/people')>()), ...people }));

let n = 0;
function note(over: Partial<AppNotification>): AppNotification {
  n += 1;
  return {
    id: `n${n}`,
    kind: 'reply',
    target_type: 'reply',
    target_id: `r${n}`,
    post_id: 'p1',
    data: {},
    read_at: null,
    created_at: iso(1),
    actor: OTHER,
    post: { id: 'p1', title: 'Composer drops edits on rebase', author_id: ME.id, board: { ...BOARD } },
    quote: null,
    scope: null,
    ...over,
  };
}

const REPLY = note({ quote: 'Same here on a monorepo.' });
const FOLLOW = note({ kind: 'follow', target_type: 'user', target_id: ME.id, post_id: null, post: null });
const SHIPPED = note({ kind: 'status_change', target_type: 'post', data: { to: 'shipped' }, actor: null, read_at: iso(1), created_at: iso(24 * 9) });

function renderPage(list: AppNotification[], signedIn = true) {
  api.fetchNotifications.mockResolvedValue(list);
  api.fetchUnreadCount.mockResolvedValue(list.filter((x) => !x.read_at).length);
  return renderWith(
    <Routes>
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/post/:id" element={<h1>Post page</h1>} />
    </Routes>,
    { viewer: signedIn ? TEST_VIEWER : null, path: '/notifications' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.markNotificationsRead.mockResolvedValue(undefined);
  people.fetchFollowedUsers.mockResolvedValue(new Set());
  people.setUserFollow.mockResolvedValue(undefined);
});

describe('notification copy', () => {
  it('words each kind the way the mockup does', () => {
    const cases: Array<[AppNotification, string, string?]> = [
      [REPLY, '@jmwamba replied to your post Composer drops edits on rebase'],
      [note({ post: { id: 'p1', title: 'X post', author_id: OTHER.id, board: null } }), '@jmwamba replied to you on X post'],
      [note({ target_id: 'r77', post: { id: 'p1', title: 'X post', author_id: OTHER.id, board: null } }), '@jmwamba replied to you on X post', '/post/p1#reply-r77'],
      [note({ data: { team: true }, post: { id: 'p1', title: 'X post', author_id: OTHER.id, board: null } }), '@jmwamba replied to your team on X post'],
      [note({ kind: 'mention', target_id: 'r78', data: { team: true } }), '@jmwamba mentioned your team in a reply on Composer drops edits on rebase', '/post/p1#reply-r78'],
      [note({ kind: 'upvote_milestone', data: { votes: 100 } }), 'Your post Composer drops edits on rebase reached 100 upvotes'],
      [note({ kind: 'status_change', data: { to: 'planned' } }), 'Cursor Team marked Composer drops edits on rebase as Planned'],
      [SHIPPED, 'Cursor Team marked Composer drops edits on rebase as Shipped'],
      [note({ kind: 'status_change', data: { to: 'merged', into: 'p9', into_title: 'Caret lost' } }), 'Composer drops edits on rebase, a post you follow, was merged into Caret lost', '/post/p9'],
      [note({ kind: 'claim', target_type: 'board', data: { scope: 'board', slug: 'cursor', name: 'Cursor' } }), 'You’re now managing Cursor’s board. Your replies show as verified.', '/b/cursor'],
      [note({ kind: 'claim', target_type: 'board', data: { scope: 'board', slug: 'linear', name: 'Linear', dispute: 'approved' } }), 'We upheld your report about Linear. You now manage it.'],
      [
        note({ kind: 'join', target_type: 'board', data: { status: 'pending' }, scope: { name: 'Cursor', slug: 'cursor', color: null } }),
        '@jmwamba asked to join the Cursor team',
        '/b/cursor/manage?tab=team',
      ],
    ];
    const described = cases.map(([x]) => describeNotification(x, ME.id));
    renderWith(
      <>
        {described.map((d, i) => (
          <p key={i} data-testid={`t${i}`}>
            {d.text}
          </p>
        ))}
      </>,
    );
    cases.forEach(([, text, href], i) => {
      expect(screen.getByTestId(`t${i}`).textContent).toBe(text);
      if (href) expect(described[i]?.href).toBe(href);
    });
  });
});

describe('join request messages (#189)', () => {
  it('quotes the requester’s message on the pending notification, and nothing when there is none', () => {
    const scope = { name: 'Cursor', slug: 'cursor', color: null };
    const withMsg = describeNotification(note({ kind: 'join', target_type: 'board', data: { status: 'pending', message: 'I run support here.' }, scope }), ME.id);
    const without = describeNotification(note({ kind: 'join', target_type: 'board', data: { status: 'pending' }, scope }), ME.id);
    expect(withMsg.quote).toBe('I run support here.');
    expect(without.quote ?? null).toBeNull();
  });
});

describe('official replies speak as the board (#160 follow-up)', () => {
  const OFFICIAL = note({ official: true, quote: 'Fixed in 2.4.' });

  it('names the board and its Team badge, never the teammate', () => {
    const cases: Array<[AppNotification, string]> = [
      [OFFICIAL, 'Cursor Team replied to your post Composer drops edits on rebase'],
      [note({ official: true, post: { id: 'p1', title: 'X post', author_id: OTHER.id, board: { ...BOARD } } }), 'Cursor Team replied to you on X post'],
      [note({ kind: 'mention', official: true }), 'Cursor Team mentioned you in a reply on Composer drops edits on rebase'],
    ];
    const described = cases.map(([x]) => describeNotification(x, ME.id));
    renderWith(
      <>
        {described.map((d, i) => (
          <p key={i} data-testid={`o${i}`}>
            {d.text}
          </p>
        ))}
      </>,
    );
    cases.forEach(([, text], i) => {
      expect(screen.getByTestId(`o${i}`).textContent).toBe(text);
      expect(screen.getByTestId(`o${i}`).textContent).not.toContain(OTHER.handle);
      expect(described[i]?.boardAvatar?.name).toBe(BOARD.name);
    });
  });

  it('a personal reply stays personal', () => {
    const d = describeNotification(note({ official: false }), ME.id);
    expect(d.boardAvatar).toBeUndefined();
  });

  it('shows the board logo, not the teammate’s avatar, in the list', async () => {
    const { container } = renderPage([OFFICIAL]);
    const link = await screen.findByRole('link', { name: /Cursor Team replied to your post/ });
    expect(link.textContent).not.toContain('@');
    expect(container.querySelector('.bg-board')).toBeTruthy();
  });
});

describe('status change with a note (0044)', () => {
  it('quotes the team’s timeline note in the one status notification', () => {
    const d = describeNotification(note({ kind: 'status_change', target_type: 'post', data: { to: 'shipped', note: 'Live in 2.4.' } }), ME.id);
    expect(d.quote).toBe('Live in 2.4.');
    expect(describeNotification(note({ kind: 'status_change', target_type: 'post', data: { to: 'planned', note: 'Next cycle.' } }), ME.id).quote).toBe('Next cycle.');
    expect(describeNotification(SHIPPED, ME.id).quote).toBeNull();
  });
});

describe('notifications page', () => {
  it('links the notification settings gear to /settings#notifications', () => {
    renderPage([]);
    const link = screen.getByRole('link', { name: 'Notification settings' });
    expect(link.getAttribute('href')).toBe('/settings#notifications');
  });

  it('groups by day, marks unread, and opening one marks it read', async () => {
    renderPage([REPLY, FOLLOW, SHIPPED]);
    expect(await screen.findByRole('list', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Earlier' })).toBeTruthy();
    expect(screen.getByText('Same here on a monorepo.')).toBeTruthy();
    expect(screen.getAllByText('Unread:').length).toBe(2);
    fireEvent.click(screen.getByRole('link', { name: /replied to your post/ }));
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalledWith([REPLY.id], TEST_VIEWER.id));
    expect(await screen.findByRole('heading', { name: 'Post page' })).toBeTruthy();
  });

  it('Mark all as read clears every unread one', async () => {
    renderPage([REPLY, FOLLOW, SHIPPED]);
    await screen.findByRole('list', { name: 'Today' });
    const all = screen.getByRole('button', { name: 'Mark all as read' });
    fireEvent.click(all);
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalledWith('all', TEST_VIEWER.id));
    expect(await screen.findByText('All caught up')).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('Unread:').length).toBe(0));
  });

  it('tabs split replies from activity; Follow back follows', async () => {
    renderPage([REPLY, FOLLOW, SHIPPED]);
    const tabs = await screen.findByRole('tablist', { name: 'Notifications' });
    fireEvent.click(within(tabs).getByRole('tab', { name: /Activity/ }));
    expect(screen.queryByText('Same here on a monorepo.')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Follow back' }));
    await waitFor(() => expect(people.setUserFollow).toHaveBeenCalledWith(OTHER.id, TEST_VIEWER.id, true));
  });

  it('nothing yet', async () => {
    renderPage([]);
    expect(await screen.findByText('You’re all caught up')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')).toBe(true);
  });

  it('signed out asks you to sign in', async () => {
    renderPage([], false);
    expect(await screen.findByText('Sign in to see notifications')).toBeTruthy();
    expect(api.fetchNotifications).not.toHaveBeenCalled();
  });
});

describe('unread badge', () => {
  it('the nav rail and the top-bar bell show the unread count', async () => {
    api.fetchUnreadCount.mockResolvedValue(3);
    renderWith(
      <ComposerProvider>
        <NavRail />
        <TopBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    const links = await screen.findAllByRole('link', { name: 'Notifications, 3 new' });
    expect(links.length).toBe(2);
  });
});
