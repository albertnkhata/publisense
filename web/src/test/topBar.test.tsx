import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
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

describe('TopBar', () => {
  it('shows brand, SearchWell, Post feedback and Sign in when signed out, and prompts sign-in for Post feedback', async () => {
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
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Sign in to post feedback/)).toBeTruthy();
  });

  it('shows Messages, Notifications, UserMenu and c shortcut when signed in', async () => {
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
    expect(await screen.findByRole('dialog', { name: 'Post feedback' })).toBeTruthy();
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
});
