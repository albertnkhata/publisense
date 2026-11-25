import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { TopBar } from '../shell/TopBar';
import { ComposerProvider, routeComposerScope } from '../shell/composer';
import { renderWith, TEST_VIEWER } from './renderApp';

vi.mock('../api/notificationHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/notificationHooks')>();
  return { ...real, useUnreadCount: () => ({ data: 4 }) };
});

vi.mock('../api/messageHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/messageHooks')>();
  return { ...real, useMessagesEnabled: () => true, useDmUnread: () => 2 };
});

vi.mock('../api/boardHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/boardHooks')>();
  return {
    ...real,
    useBoards: () => ({
      data: [
        {
          id: 'b-cursor',
          slug: 'cursor',
          name: 'Cursor',
          tagline: 'AI code editor',
          site: 'https://cursor.com',
          color: '#111111',
          logo_path: null,
          category: 'dev',
          hub_id: 'h-cursor',
          claimed_at: null,
          created_at: '2026-01-01T00:00:00Z',
          follower_count: 10,
          post_count: 5,
          status: 'live' as const,
          created_by: null,
        },
      ],
      isPending: false,
    }),
  };
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('TopBar', () => {
  it('shows brand, SearchWell, Post feedback and Sign in when signed out, and preserves /b/:slug composer intent across sign-in', async () => {
    renderWith(
      <ComposerProvider>
        <TopBar />
      </ComposerProvider>,
      { viewer: null, path: '/b/cursor' },
    );

    expect(screen.getByRole('link', { name: 'Publisense home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('button', { name: 'Search products, posts, hubs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Post feedback' }));
    const authDialog = await screen.findByRole('dialog');
    expect(screen.getByText(/Sign in to post feedback/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('publisense:pending-composer') ?? '{}')).toMatchObject({ board: 'cursor' });

    fireEvent.click(within(authDialog).getByRole('button', { name: 'Close' }));
    expect(window.localStorage.getItem('publisense:pending-composer')).toBeNull();
  });

  it('shows Messages, Notifications, UserMenu, c shortcut, and pre-fills the current /b/:slug board when signed in', async () => {
    renderWith(
      <ComposerProvider>
        <TopBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER, path: '/b/cursor' },
    );

    expect(screen.getByRole('link', { name: 'Publisense home' }).getAttribute('href')).toBe('/');
    const messagesLink = screen.getByRole('link', { name: 'Messages, 2 unread' });
    const notificationsLink = screen.getByRole('link', { name: 'Notifications, 4 new' });
    expect(messagesLink.getAttribute('href')).toBe('/messages');
    expect(notificationsLink.getAttribute('href')).toBe('/notifications');
    expect(messagesLink.className).not.toContain('max-sm:hidden');
    expect(notificationsLink.className).not.toContain('max-sm:hidden');
    expect(screen.getByRole('button', { name: `Account menu for ${TEST_VIEWER.name}` })).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'c' });
    const composer = await screen.findByRole('dialog', { name: 'Post feedback' });
    expect(await within(composer).findByText('Cursor')).toBeTruthy();
  });

  it('omits duplicate SearchWell on signed-in / and /search', () => {
    const { unmount } = renderWith(
      <ComposerProvider>
        <TopBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER, path: '/' },
    );
    expect(screen.queryByRole('button', { name: 'Search products, posts, hubs' })).toBeNull();
    unmount();

    renderWith(
      <ComposerProvider>
        <TopBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER, path: '/search' },
    );
    expect(screen.queryByRole('button', { name: 'Search products, posts, hubs' })).toBeNull();
  });

  it('extracts board or hub scope from the active route path', () => {
    expect(routeComposerScope('/b/cursor')).toEqual({ board: 'cursor' });
    expect(routeComposerScope('/b/cursor/manage')).toEqual({ board: 'cursor' });
    expect(routeComposerScope('/h/openai')).toEqual({ hub: 'openai' });
    expect(routeComposerScope('/')).toEqual({});
    expect(routeComposerScope('/feed')).toEqual({});
  });
});
