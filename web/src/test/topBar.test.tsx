import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { TopBar } from '../shell/TopBar';
import { ComposerProvider } from '../shell/composer';
import { renderWith, TEST_VIEWER } from './renderApp';

vi.mock('../api/notificationHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/notificationHooks')>();
  return { ...real, useUnreadCount: () => ({ data: 4 }) };
});

vi.mock('../api/messageHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/messageHooks')>();
  return { ...real, useMessagesEnabled: () => true, useDmUnread: () => 2 };
});

describe('TopBar (nav="top")', () => {
  it('shows Explore and Categories when signed out and prompts sign-in for Post feedback', async () => {
    renderWith(
      <ComposerProvider>
        <TopBar nav="top" />
      </ComposerProvider>,
      { viewer: null, path: '/b/cursor' },
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Explore' }).getAttribute('href')).toBe('/explore');
    expect(within(nav).getByRole('link', { name: 'Categories' }).getAttribute('href')).toBe('/categories');
    expect(within(nav).queryByRole('link', { name: 'Following' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Search products, posts, hubs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Post feedback' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Sign in to post feedback/)).toBeTruthy();
  });

  it('shows Home, Explore, Following, Messages, Notifications, UserMenu and c shortcut when signed in', async () => {
    renderWith(
      <ComposerProvider>
        <TopBar nav="top" />
      </ComposerProvider>,
      { viewer: TEST_VIEWER, path: '/b/cursor' },
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(within(nav).getByRole('link', { name: 'Explore' }).getAttribute('href')).toBe('/explore');
    expect(within(nav).getByRole('link', { name: 'Following' }).getAttribute('href')).toBe('/?scope=following');
    expect(screen.getByRole('link', { name: 'Messages, 2 unread' }).getAttribute('href')).toBe('/messages');
    expect(screen.getByRole('link', { name: 'Notifications, 4 new' }).getAttribute('href')).toBe('/notifications');
    expect(screen.getByRole('button', { name: `Account menu for ${TEST_VIEWER.name}` })).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'c' });
    expect(await screen.findByRole('dialog', { name: 'Post feedback' })).toBeTruthy();
  });

  it('omits duplicate SearchWell on /explore and /search', () => {
    const { unmount } = renderWith(
      <ComposerProvider>
        <TopBar nav="top" />
      </ComposerProvider>,
      { viewer: TEST_VIEWER, path: '/explore' },
    );
    expect(screen.queryByRole('button', { name: 'Search products, posts, hubs' })).toBeNull();
    unmount();

    renderWith(
      <ComposerProvider>
        <TopBar nav="top" />
      </ComposerProvider>,
      { viewer: TEST_VIEWER, path: '/search' },
    );
    expect(screen.queryByRole('button', { name: 'Search products, posts, hubs' })).toBeNull();
  });
});
