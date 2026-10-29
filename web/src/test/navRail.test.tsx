import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { NavRail } from '../shell/NavRail';
import { ComposerProvider } from '../shell/composer';
import { renderWith, TEST_VIEWER } from './renderApp';

vi.mock('../api/notificationHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/notificationHooks')>();
  return { ...real, useUnreadCount: () => ({ data: 0 }) };
});

const staff = vi.hoisted(() => ({ value: false }));
vi.mock('../api/moderationHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/moderationHooks')>();
  return { ...real, useIsPlatformAdmin: () => ({ data: staff.value }) };
});

/** Focusable controls in DOM (= Tab) order. */
function tabOrder(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    .filter((el) => el.tabIndex >= 0)
    .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '');
}

describe('NavRail keyboard order (#141)', () => {
  it('reaches Home and Explore before the hover-only Collapse sidebar button', () => {
    renderWith(
      <ComposerProvider>
        <NavRail />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    const rail = screen.getByRole('complementary', { name: 'Main navigation' });
    const order = tabOrder(rail);
    expect(order[0]).toBe('Publisense home');
    expect(order[1]).toBe('Home');
    const collapse = order.indexOf('Collapse sidebar');
    expect(collapse).toBeGreaterThan(order.indexOf('Explore'));
    expect(collapse).toBeGreaterThan(order.findIndex((l) => l.startsWith('Notifications')));
    // Still there, labelled, announced with its shortcut, and revealed on keyboard focus.
    const btn = within(rail).getByRole('button', { name: 'Collapse sidebar' });
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('[');
    expect(btn.className).toContain('focus-visible:opacity-100');
  });
});

describe('NavRail admin sections', () => {
  const render = () =>
    renderWith(
      <ComposerProvider>
        <NavRail />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );

  it('lists every /admin section for staff', () => {
    staff.value = true;
    render();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/admin',
      '/admin/products',
      '/admin/companies',
      '/admin/reports',
      '/admin/disputes',
      '/admin/team',
    ]);
    staff.value = false;
  });

  it('shows nothing admin to everyone else', () => {
    staff.value = false;
    render();
    expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull();
  });
});
