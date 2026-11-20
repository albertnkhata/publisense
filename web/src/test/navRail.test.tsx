import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { followKey } from '../api';
import { NavRail } from '../shell/NavRail';
import { TopBar } from '../shell/TopBar';
import { ComposerProvider } from '../shell/composer';
import { CURSOR, FIGMA_HUB } from './boardFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const staff = vi.hoisted(() => ({ value: false }));
vi.mock('../api/moderationHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/moderationHooks')>();
  return { ...real, useIsPlatformAdmin: () => ({ data: staff.value }) };
});

const boardsState = vi.hoisted(() => ({
  followed: new Set<string>() as Set<string> | undefined,
  followedPending: false,
}));
vi.mock('../api/boardHooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/boardHooks')>();
  return {
    ...real,
    useBoards: () => ({ data: [CURSOR] }),
    useHubs: () => ({ data: [FIGMA_HUB] }),
    useFollowedScopes: () => ({ data: boardsState.followed, isPending: boardsState.followedPending, isError: false }),
  };
});

/** Focusable controls in DOM (= Tab) order. */
function tabOrder(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    .filter((el) => el.tabIndex >= 0)
    .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '');
}

describe('NavRail keyboard order and TopBar toggle (#141)', () => {
  it('orders Home, Feed and Categories in NavRail and toggles collapse from TopBar', () => {
    renderWith(
      <ComposerProvider>
        <TopBar />
        <NavRail />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    const rail = screen.getByRole('complementary', { name: 'Main navigation' });
    const order = tabOrder(rail);
    expect(order.slice(0, 3)).toEqual(['Home', 'Feed', 'Categories']);
    const btn = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('[');
    expect(btn.className).toContain('focus-visible:opacity-100');
    fireEvent.click(btn);
    expect(rail.getAttribute('data-collapsed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(rail.getAttribute('data-collapsed')).toBeNull();
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

describe('NavRail links and layout', () => {
  it('shows primary links both signed in and signed out', () => {
    const { unmount } = renderWith(
      <ComposerProvider>
        <NavRail />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Feed' }).getAttribute('href')).toBe('/feed');
    expect(screen.getByRole('link', { name: 'Categories' }).getAttribute('href')).toBe('/categories');
    unmount();

    renderWith(
      <ComposerProvider>
        <NavRail />
      </ComposerProvider>,
      { viewer: null },
    );
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Feed' }).className).toContain('text-ink-secondary');
    expect(screen.getByRole('link', { name: 'Categories' }).getAttribute('href')).toBe('/categories');
    expect(screen.queryByRole('navigation', { name: 'Legal links' })).toBeNull();
  });

  it('shows populated Topics only when expanded, and hides them when collapsed', () => {
    boardsState.followed = new Set();
    renderWith(
      <ComposerProvider>
        <TopBar />
        <NavRail />
      </ComposerProvider>,
      { viewer: null },
    );
    const topicsNav = screen.getByRole('navigation', { name: 'Topics' });
    expect(within(topicsNav).getByRole('link', { name: 'Code editors' }).getAttribute('href')).toBe('/c/code');
    expect(screen.queryByRole('navigation', { name: 'Your products' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Popular products' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByRole('navigation', { name: 'Topics' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Topics' })).toBeTruthy();
  });

  it('shows Your products alongside Topics when signed in and following, and hides both when collapsed', () => {
    boardsState.followed = new Set([followKey('board', CURSOR.id), followKey('hub', FIGMA_HUB.id)]);
    renderWith(
      <ComposerProvider>
        <TopBar />
        <NavRail />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    const nav = screen.getByRole('navigation', { name: 'Your products' });
    expect(within(nav).getByRole('link', { name: 'Cursor' }).getAttribute('href')).toBe('/b/cursor');
    expect(within(nav).getByRole('link', { name: 'Figma hub' }).getAttribute('href')).toBe('/h/figma');
    expect(screen.getByRole('navigation', { name: 'Topics' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByRole('navigation', { name: 'Your products' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Topics' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Your products' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Topics' })).toBeTruthy();
    boardsState.followed = new Set();
  });

  it('keeps the sidebar toggle visible below xl and expands NavRail as an overlay drawer', () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('1279.98'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    try {
      renderWith(
        <ComposerProvider>
          <TopBar />
          <NavRail />
        </ComposerProvider>,
        { viewer: null },
      );
      const rail = screen.getByRole('complementary', { name: 'Main navigation' });
      expect(rail.getAttribute('data-collapsed')).toBe('true');
      expect(rail.getAttribute('data-overlay')).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Topics' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
      expect(rail.getAttribute('data-collapsed')).toBeNull();
      expect(rail.getAttribute('data-overlay')).toBe('true');
      expect(screen.getByRole('navigation', { name: 'Topics' })).toBeTruthy();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(rail.getAttribute('data-collapsed')).toBe('true');
      expect(rail.getAttribute('data-overlay')).toBeNull();
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });
});
