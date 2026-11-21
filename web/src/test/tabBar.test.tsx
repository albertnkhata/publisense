import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { TabBar } from '../shell/TabBar';
import { ComposerProvider } from '../shell/composer';
import { renderWith, TEST_VIEWER } from './renderApp';

function navItems(nav: HTMLElement): string[] {
  return Array.from(nav.querySelectorAll<HTMLElement>('a[href], button')).map(
    (el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
  );
}

describe('TabBar 5-item mobile nav', () => {
  it('renders 5 balanced items when signed out and opens the More sheet with Sign in, Categories, Appearance, and legal links', async () => {
    renderWith(
      <ComposerProvider>
        <TabBar />
      </ComposerProvider>,
      { viewer: null },
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(navItems(nav)).toEqual(['Home', 'Feed', 'Post feedback', 'Search', 'More']);
    expect(within(nav).getByRole('link', { name: 'Search' }).getAttribute('href')).toBe('/search');

    fireEvent.click(within(nav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(sheet).getByRole('link', { name: 'Categories' }).getAttribute('href')).toBe('/categories');
    expect(within(sheet).getByRole('button', { name: /Appearance/ })).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about');
    expect(within(sheet).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(within(sheet).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('dialog', { name: 'Sign in to Publisense' })).toBeTruthy();
  });

  it('switches theme from the signed-out More sheet', () => {
    renderWith(
      <ComposerProvider>
        <TabBar />
      </ComposerProvider>,
      { viewer: null },
    );

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('renders the same 5 slots when signed in (with You sheet) and delegates Messages/Notifications to TopBar', () => {
    renderWith(
      <ComposerProvider>
        <TabBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(navItems(nav)).toEqual(['Home', 'Feed', 'Post feedback', 'Search', 'You']);

    fireEvent.click(within(nav).getByRole('button', { name: 'You' }));
    const sheet = screen.getByRole('dialog', { name: TEST_VIEWER.name });
    expect(within(sheet).getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe(`/u/${TEST_VIEWER.handle}`);
    expect(within(sheet).getByRole('link', { name: 'Categories' }).getAttribute('href')).toBe('/categories');
    expect(within(sheet).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings');
    expect(within(sheet).getByRole('button', { name: /Appearance/ })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});
