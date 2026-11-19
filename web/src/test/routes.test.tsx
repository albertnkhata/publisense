import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../App';
import { Providers } from '../Providers';
import { ThemeProvider } from '../lib/ThemeProvider';
import { StaticViewerProvider, type Viewer } from '../lib/viewer';
import { shellLayoutFor } from '../shell/layout';
import { ToastProvider } from '../ui';
import { TEST_VIEWER } from './renderApp';

// FOUNDATION §9, with sample params. Each must render a page heading, not NotFound.
const CASES: Array<[string, string]> = [
  ['/', 'Find any product. Shape what ships next.'],
  ['/explore', 'Explore'],
  ['/categories', 'Categories'],
  ['/c/dev', 'Dev platforms'],
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
  ['/about', 'About Publisense'],
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

function renderAt(path: string, viewer?: Viewer | null) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  if (viewer !== undefined) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <StaticViewerProvider initial={viewer}>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </StaticViewerProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    return;
  }
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

  it('/ renders the Home feed inside the top-bar shell when signed in', () => {
    renderAt('/', TEST_VIEWER);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home');
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(document.getElementById('main')!.className).toContain('max-w-feed');
  });

  it('/?scope=following keeps the top-bar shell for the sign-in gate even when signed out', () => {
    renderAt('/?scope=following');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Following');
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
  });

  it('unknown paths render NotFound inside the top-bar shell', () => {
    renderAt('/nope/really');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found');
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  // Browsing & consumer pages use TopBar (`nav: 'top'`); workspaces (/admin,
  // /manage, /messages) use the left NavRail (`nav: 'rail'`, desktop-free TopBar).
  // Signed-out `/` uses LandingHeader/Footer; SITE_PAGE uses SiteHeader/Footer.
  const paths = CASES.map(([p]) => p);
  const WORKSPACE_WIDE = [...paths.filter((p) => p.startsWith('/admin')), '/b/supabase/manage', '/h/acme/manage'];
  const BROWSE_WIDE = ['/explore', '/categories', '/c/dev'];
  const WIDE = [...WORKSPACE_WIDE, ...BROWSE_WIDE];
  const NARROW = ['/notifications', '/settings'];
  const SITE = ['/about', '/privacy', '/terms', '/auth/reset', '/unsubscribe?token=abc'];
  const LANDING = ['/'];
  const RAIL = ['/search?q=dark%20mode', '/b/supabase', '/b/supabase?tab=roadmap', '/h/acme', '/post/123', '/u/alex', '/no/such/page'];

  it('every route case is classified', () => {
    expect([...WIDE, ...NARROW, ...SITE, ...LANDING, ...RAIL.filter((p) => p !== '/no/such/page')].sort()).toEqual([...paths].sort());
  });

  function expectNoRail(workspaceRail = false) {
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    const header = screen.getAllByRole('banner')[0]!;
    if (workspaceRail) {
      expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
      expect(header.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'max-lg:flex']));
    } else {
      expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
      expect(header.className.split(/\s+/)).toContain('flex');
      expect(header.className).not.toContain('max-lg:flex');
      expect(screen.getByRole('contentinfo', { name: 'Site footer' })).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: /search/i }).length).toBeGreaterThan(0);
  }

  it.each(WIDE)('%s has no right rail and uses landing (top-bar) or wide (workspace) column width', (path) => {
    const isWorkspace = WORKSPACE_WIDE.includes(path);
    renderAt(path);
    expectNoRail(isWorkspace);
    const main = document.getElementById('main')!;
    expect(main.className).toContain(isWorkspace ? 'max-w-wide' : 'max-w-landing');
    expect(main.className).not.toContain('max-w-content');
  });

  it('/messages uses the workspace left NavRail with fill layout and no desktop TopBar', () => {
    renderAt('/messages', TEST_VIEWER);
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    const header = screen.getAllByRole('banner')[0]!;
    expect(header.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'max-lg:flex']));
  });

  it.each(NARROW)('%s uses TopBar, has no right rail, and keeps the narrow reading column', (path) => {
    renderAt(path);
    expectNoRail(false);
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-content');
    expect(main.className).not.toContain('max-w-wide');
  });

  it.each(LANDING)('%s signed out uses the dedicated landing header and footer without nav rail or right rail', (path) => {
    renderAt(path);
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Publisense home' }).getAttribute('href')).toBe('/');
    expect(within(header).getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(within(header).queryByRole('button', { name: 'Join Publisense' })).toBeNull();
    expect(within(header).queryByRole('link', { name: 'Explore' })).toBeNull();
    const footer = screen.getByRole('contentinfo', { name: 'Site footer' });
    expect(within(footer).getByText('© 2026 Publisense')).toBeTruthy();
    expect(within(footer).queryByText('Publisense · Public feedback index')).toBeNull();
    expect(within(footer).queryByRole('button', { name: 'Claim a product' })).toBeNull();
    expect(within(footer).getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about');
  });

  // The site pages are standalone website pages: a header with brand, About · Terms · Privacy
  // and Sign in, no nav rail, no tab bar, no right rail, the reading column and a footer.
  it.each(SITE)('%s uses the website header instead of the app nav', (path) => {
    renderAt(path);
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Publisense home' }).getAttribute('href')).toBe('/');
    const legal = within(header).getByRole('navigation', { name: 'Legal links' });
    expect(within(legal).getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about');
    expect(within(legal).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(within(legal).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    if (path === '/about' || path === '/terms' || path === '/privacy') {
      expect(within(legal).getByRole('link', { current: 'page' }).getAttribute('href')).toBe(path);
    }
    expect(screen.getAllByRole('navigation', { name: 'Legal links' })).toHaveLength(1);
    expect(screen.getByText('© 2026 Publisense').className).toContain('text-center');
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-content');
    expect(main.className).not.toContain('max-w-wide');
  });

  it.each(RAIL)('%s uses TopBar and keeps the right rail without left NavRail', (path) => {
    renderAt(path);
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(document.getElementById('main')!.className).toContain('max-w-feed');
    const header = screen.getAllByRole('banner')[0]!;
    expect(header.className.split(/\s+/)).toContain('flex');
    expect(header.className).not.toContain('max-lg:flex');
  });

  // About · Terms · Privacy live at the foot of the right rail on desktop.
  it.each(RAIL)('%s has About, Terms and Privacy in the right rail', (path) => {
    renderAt(path);
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    const rail = screen.getByRole('complementary', { name: 'Sidebar' });
    const legal = within(rail).getByRole('navigation', { name: 'Legal links' });
    expect(within(legal).getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about');
    expect(within(legal).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(within(legal).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(within(rail).getByText('© 2026 Publisense')).toBeTruthy();
  });

  it('omits duplicate search triggers on /search, keeps Sign in in TopBar, and puts Post feedback inside TabBar', () => {
    renderAt('/search?q=dark%20mode');
    expect(screen.queryByRole('button', { name: 'Search products, posts, hubs' })).toBeNull();
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(within(header).queryByRole('button', { name: 'Join Publisense' })).toBeNull();
    const tabBar = screen.getAllByRole('navigation', { name: 'Primary' }).find((el) => el.className.includes('bottom-0'))!;
    expect(within(tabBar).getByRole('button', { name: 'Post feedback' })).toBeTruthy();
  });
});

describe('shellLayoutFor', () => {
  it('defaults to top nav with right rail and lets the deepest route that says something win', () => {
    expect(shellLayoutFor([])).toEqual({ nav: 'top', rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([undefined, null, 'x', {}])).toEqual({ nav: 'top', rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([undefined, { rail: false }, undefined])).toEqual({ nav: 'top', rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false }, { rail: true }])).toEqual({ nav: 'top', rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ nav: 'rail', rail: false, topBar: false }])).toEqual({ nav: 'rail', rail: false, width: 'wide', chrome: 'app', topBar: false, fill: false });
    expect(shellLayoutFor([{ nav: 'rail' }, { nav: 'top' }]).nav).toBe('top');
  });

  it('sizes the column without the rail: wide by default, narrow or landing on request, ignored with the rail', () => {
    expect(shellLayoutFor([{ rail: false, width: 'narrow' }])).toEqual({ nav: 'top', rail: false, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false, width: 'wide' }])).toEqual({ nav: 'top', rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false, width: 'landing' }])).toEqual({ nav: 'top', rail: false, width: 'landing', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false, width: 'narrow' }, { width: 'wide' }])).toEqual({ nav: 'top', rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false }, { width: 'narrow' }])).toEqual({ nav: 'top', rail: false, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: true, width: 'wide' }])).toEqual({ nav: 'top', rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false, width: 'huge' }])).toEqual({ nav: 'top', rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
  });

  it('topBar: false drops the desktop top bar, deepest route wins', () => {
    expect(shellLayoutFor([{ rail: false, topBar: false }])).toEqual({ nav: 'top', rail: false, width: 'wide', chrome: 'app', topBar: false, fill: false });
    expect(shellLayoutFor([{ topBar: false }, { topBar: true }]).topBar).toBe(true);
  });

  it('fill makes a one-screen page (Messages), never with the rail or site chrome', () => {
    expect(shellLayoutFor([{ nav: 'rail', rail: false, width: 'wide', topBar: false, fill: true }])).toEqual({ nav: 'rail', rail: false, width: 'wide', chrome: 'app', topBar: false, fill: true });
    expect(shellLayoutFor([{ fill: true }]).fill).toBe(false);
    expect(shellLayoutFor([{ chrome: 'site', fill: true }]).fill).toBe(false);
  });

  it('site chrome always means top nav, no rail, and the narrow column', () => {
    expect(shellLayoutFor([{ chrome: 'site' }])).toEqual({ nav: 'top', rail: false, width: 'narrow', chrome: 'site', topBar: true, fill: false });
    expect(shellLayoutFor([{ chrome: 'site', nav: 'rail', rail: true, width: 'wide' }])).toEqual({ nav: 'top', rail: false, width: 'narrow', chrome: 'site', topBar: true, fill: false });
    expect(shellLayoutFor([{ chrome: 'site' }, { chrome: 'app', rail: false }])).toEqual({ nav: 'top', rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ chrome: 'web' }])).toEqual({ nav: 'top', rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
  });
});

describe('vercel.json SPA rewrites', () => {
  it('rewrites public site and app entry paths to /index.html', async () => {
    const { default: vercel } = await import('../../vercel.json');
    const spaSources = new Set(vercel.rewrites.filter((r) => r.destination === '/index.html').map((r) => r.source));
    for (const path of ['/explore', '/categories', '/c/:category', '/search', '/notifications', '/messages', '/settings', '/about', '/privacy', '/terms', '/unsubscribe', '/auth/reset']) {
      expect(spaSources.has(path)).toBe(true);
    }
  });
});
