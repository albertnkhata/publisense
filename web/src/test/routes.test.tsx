import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../App';
import { Providers } from '../Providers';
import { shellLayoutFor } from '../shell/layout';

// FOUNDATION §9, with sample params. Each must render a page heading, not NotFound.
const CASES: Array<[string, string]> = [
  ['/', 'Home'],
  ['/explore', 'Explore'],
  ['/search?q=dark%20mode', 'Search'],
  ['/b/supabase', 'Loading board'], // board and hub pages fetch first (no Supabase here)
  ['/b/supabase?tab=roadmap', 'Loading board'],
  ['/b/supabase/manage', 'Loading board'], // Manage loads its board first
  ['/h/acme', 'Loading hub'],
  ['/h/acme/manage', 'Loading hub'],
  ['/post/123', 'Post not found'], // not a post id: answered without a request
  ['/u/alex', '@alex'],
  ['/notifications', 'Notifications'],
  ['/settings', 'Settings'],
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms of Service'],
  ['/auth/reset', 'Set a new password'],
  ['/unsubscribe?token=abc', 'Unsubscribe'],
  // Admin screens are for platform admins only; signed out they ask you to sign in.
  ['/admin', 'Sign in'],
  ['/admin/reports', 'Sign in'],
  ['/admin/disputes', 'Sign in'],
  ['/admin/team', 'Sign in'],
  ['/admin/products', 'Sign in'],
  ['/admin/companies', 'Sign in'],
];

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
}

describe('routes', () => {
  it.each(CASES)('%s renders its page', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(heading);
  });

  it('unknown paths render NotFound inside the shell', () => {
    renderAt('/nope/really');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found');
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
  });

  // The right rail (search, boards card, claim line) is opt-out per route via `handle`
  // (shell/layout.ts). Browsing pages keep it; task pages drop it, wide or narrow.
  const paths = CASES.map(([p]) => p);
  const WIDE = [...paths.filter((p) => p.startsWith('/admin')), '/b/supabase/manage', '/h/acme/manage'];
  const NARROW = ['/notifications', '/settings', '/auth/reset', '/unsubscribe?token=abc'];
  const SITE = ['/privacy', '/terms'];
  const RAIL = ['/', '/explore', '/search?q=dark%20mode', '/b/supabase', '/b/supabase?tab=roadmap', '/h/acme', '/post/123', '/u/alex', '/no/such/page'];

  it('every route case is classified', () => {
    expect([...WIDE, ...NARROW, ...SITE, ...RAIL.filter((p) => p !== '/no/such/page')].sort()).toEqual([...paths].sort());
  });

  function expectNoRail() {
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    const header = screen.getAllByRole('banner')[0]!;
    expect(header.className.split(/\s+/)).toContain('flex');
    expect(header.className).not.toContain('max-lg:flex');
    expect(screen.getAllByRole('button', { name: /search/i }).length).toBeGreaterThan(0);
  }

  it.each(WIDE)('%s has no right rail, a wide column and a top bar with search at every width', (path) => {
    renderAt(path);
    expectNoRail();
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-wide');
    expect(main.className).not.toContain('max-w-content');
  });

  it.each(NARROW)('%s has no right rail, keeps the narrow reading column and a top bar with search', (path) => {
    renderAt(path);
    expectNoRail();
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-content');
    expect(main.className).not.toContain('max-w-wide');
  });

  // The legal pages are standalone website pages: a header with brand, Terms · Privacy and
  // Sign in, no nav rail, no tab bar, no right rail, the reading column and a © footer.
  it.each(SITE)('%s uses the website header instead of the app nav', (path) => {
    renderAt(path);
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Publisense home' }).getAttribute('href')).toBe('/');
    const legal = within(header).getByRole('navigation', { name: 'Legal links' });
    expect(within(legal).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(within(legal).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(within(legal).getByRole('link', { current: 'page' }).getAttribute('href')).toBe(path);
    expect(screen.getAllByRole('navigation', { name: 'Legal links' })).toHaveLength(1);
    expect(screen.getByText('© 2026 Publisense')).toBeTruthy();
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-content');
    expect(main.className).not.toContain('max-w-wide');
  });

  it.each(RAIL)('%s keeps the right rail', (path) => {
    renderAt(path);
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(document.getElementById('main')!.className).toContain('max-w-content');
    expect(screen.getAllByRole('banner')[0]!.className).toContain('max-lg:flex');
  });

  // Terms · Privacy live at the foot of the nav rail on desktop, on every page, once.
  it.each([...WIDE.slice(0, 1), ...NARROW, ...RAIL])('%s has Terms and Privacy in the nav rail, once', (path) => {
    renderAt(path);
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });
    const legal = within(nav).getByRole('navigation', { name: 'Legal links' });
    expect(within(legal).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(within(legal).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(within(nav).getByText('© 2026 Publisense')).toBeTruthy();
    expect(screen.getAllByRole('navigation', { name: 'Legal links' })).toHaveLength(1);
    const rail = screen.queryByRole('complementary', { name: 'Sidebar' });
    if (rail) expect(within(rail).queryByRole('link', { name: 'Terms' })).toBeNull();
  });
});

describe('shellLayoutFor', () => {
  it('defaults to the rail and lets the deepest route that says something win', () => {
    expect(shellLayoutFor([])).toEqual({ rail: true, width: 'narrow', chrome: 'app' });
    expect(shellLayoutFor([undefined, null, 'x', {}])).toEqual({ rail: true, width: 'narrow', chrome: 'app' });
    expect(shellLayoutFor([undefined, { rail: false }, undefined])).toEqual({ rail: false, width: 'wide', chrome: 'app' });
    expect(shellLayoutFor([{ rail: false }, { rail: true }])).toEqual({ rail: true, width: 'narrow', chrome: 'app' });
  });

  it('sizes the column without the rail: wide by default, narrow on request, ignored with the rail', () => {
    expect(shellLayoutFor([{ rail: false, width: 'narrow' }])).toEqual({ rail: false, width: 'narrow', chrome: 'app' });
    expect(shellLayoutFor([{ rail: false, width: 'wide' }])).toEqual({ rail: false, width: 'wide', chrome: 'app' });
    expect(shellLayoutFor([{ rail: false, width: 'narrow' }, { width: 'wide' }])).toEqual({ rail: false, width: 'wide', chrome: 'app' });
    expect(shellLayoutFor([{ rail: false }, { width: 'narrow' }])).toEqual({ rail: false, width: 'narrow', chrome: 'app' });
    expect(shellLayoutFor([{ rail: true, width: 'wide' }])).toEqual({ rail: true, width: 'narrow', chrome: 'app' });
    expect(shellLayoutFor([{ rail: false, width: 'huge' }])).toEqual({ rail: false, width: 'wide', chrome: 'app' });
  });

  it('site chrome always means no rail and the narrow column', () => {
    expect(shellLayoutFor([{ chrome: 'site' }])).toEqual({ rail: false, width: 'narrow', chrome: 'site' });
    expect(shellLayoutFor([{ chrome: 'site', rail: true, width: 'wide' }])).toEqual({ rail: false, width: 'narrow', chrome: 'site' });
    expect(shellLayoutFor([{ chrome: 'site' }, { chrome: 'app', rail: false }])).toEqual({ rail: false, width: 'wide', chrome: 'app' });
    expect(shellLayoutFor([{ chrome: 'web' }])).toEqual({ rail: true, width: 'narrow', chrome: 'app' });
  });
});
