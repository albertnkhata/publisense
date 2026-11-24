import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../App';
import { RouteError } from '../pages/RouteError';
import { Providers } from '../Providers';
import { ThemeProvider } from '../lib/ThemeProvider';
import { StaticViewerProvider, type Viewer } from '../lib/viewer';
import { shellLayoutFor } from '../shell/layout';
import { ToastProvider } from '../ui';
import { TEST_VIEWER } from './renderApp';

// FOUNDATION §9, with sample params. Each must render a page heading, not NotFound.
const CASES: Array<[string, string]> = [
  ['/', 'Find any product. Shape what ships next.'],
  ['/feed', 'Feed'],
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

  it('/ renders the signed-in discovery home in the wide TopBar + NavRail shell without a right rail', () => {
    renderAt('/', TEST_VIEWER);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home');
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(document.getElementById('main')!.className).toContain('max-w-wide');
  });

  it('/feed renders the feed inside the TopBar + NavRail shell with a right rail when signed in', () => {
    renderAt('/feed', TEST_VIEWER);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Feed');
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(document.getElementById('main')!.className).toContain('max-w-content');
  });

  it('removed /explore path renders NotFound', () => {
    renderAt('/explore');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found');
  });

  it('/?scope=following redirects to /feed?scope=following and keeps the TopBar + NavRail shell for the sign-in gate', () => {
    renderAt('/?scope=following');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Following');
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
  });

  it('unknown paths render NotFound inside the TopBar + NavRail shell', () => {
    renderAt('/nope/really');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found');
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  // App pages render the global TopBar together with the left NavRail.
  // Signed-out `/` uses LandingHeader/Footer; SITE_PAGE uses SiteHeader/Footer.
  const paths = CASES.map(([p]) => p);
  const WIDE = [...paths.filter((p) => p.startsWith('/admin')), '/categories', '/c/dev', '/b/supabase/manage', '/h/acme/manage'];
  const NARROW = ['/notifications', '/settings'];
  const SITE = ['/about', '/privacy', '/terms', '/auth/reset', '/unsubscribe?token=abc'];
  const LANDING = ['/'];
  const RAIL = ['/feed', '/search?q=dark%20mode', '/b/supabase', '/b/supabase?tab=roadmap', '/h/acme', '/post/123', '/u/alex', '/no/such/page'];

  it('every route case is classified', () => {
    expect([...WIDE, ...NARROW, ...SITE, ...LANDING, ...RAIL.filter((p) => p !== '/no/such/page')].sort()).toEqual([...paths].sort());
  });

  function expectNoRail() {
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    const header = screen.getAllByRole('banner')[0]!;
    expect(header.className.split(/\s+/)).toContain('flex');
    expect(header.className).not.toContain('max-lg:flex');
    expect(screen.getAllByRole('button', { name: /search/i }).length).toBeGreaterThan(0);
  }

  it.each(WIDE)('%s has TopBar and left NavRail, no right rail, and uses wide column width', (path) => {
    renderAt(path);
    expectNoRail();
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-wide');
    expect(main.className).not.toContain('max-w-content');
  });

  it('/messages uses the global TopBar and left NavRail with fill layout', () => {
    renderAt('/messages', TEST_VIEWER);
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    const header = screen.getAllByRole('banner')[0]!;
    expect(header.className.split(/\s+/)).toContain('flex');
    expect(header.className).not.toContain('max-lg:flex');
  });

  it.each(NARROW)('%s uses TopBar and left NavRail, has no right rail, and keeps the narrow reading column', (path) => {
    renderAt(path);
    expectNoRail();
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-content');
    expect(main.className).not.toContain('max-w-wide');
  });

  it.each(LANDING)('%s signed out uses the unified TopBar + NavRail shell with the landing content and footer', (path) => {
    renderAt(path);
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Publisense home' }).getAttribute('href')).toBe('/');
    expect(within(header).getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(within(header).queryByRole('button', { name: 'Join Publisense' })).toBeNull();
    expect(within(header).queryByRole('link', { name: 'Explore' })).toBeNull();
    expect(document.getElementById('main')!.className).toContain('max-w-wide');
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

  it.each(RAIL)('%s uses TopBar, left NavRail, and right rail', (path) => {
    renderAt(path);
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(document.getElementById('main')!.className).toContain('max-w-content');
    const header = screen.getAllByRole('banner')[0]!;
    expect(header.className.split(/\s+/)).toContain('flex');
    expect(header.className).not.toContain('max-lg:flex');
  });

  // About · Terms · Privacy live at the foot of the right rail on desktop, and are omitted from the left nav.
  it.each(RAIL)('%s has About, Terms and Privacy in the right rail', (path) => {
    renderAt(path);
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });
    expect(within(nav).queryByRole('navigation', { name: 'Legal links' })).toBeNull();
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
  it('defaults to the right rail and lets the deepest route that says something win', () => {
    expect(shellLayoutFor([])).toEqual({ rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([undefined, null, 'x', {}])).toEqual({ rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([undefined, { rail: false }, undefined])).toEqual({ rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false }, { rail: true }])).toEqual({ rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
  });

  it('sizes the column without the rail: wide by default, narrow on request, ignored with the rail', () => {
    expect(shellLayoutFor([{ rail: false, width: 'narrow' }])).toEqual({ rail: false, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false, width: 'wide' }])).toEqual({ rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false, width: 'narrow' }, { width: 'wide' }])).toEqual({ rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false }, { width: 'narrow' }])).toEqual({ rail: false, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: true, width: 'wide' }])).toEqual({ rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ rail: false, width: 'huge' }])).toEqual({ rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
  });

  it('topBar: false is preserved in layout state, deepest route wins', () => {
    expect(shellLayoutFor([{ rail: false, topBar: false }])).toEqual({ rail: false, width: 'wide', chrome: 'app', topBar: false, fill: false });
    expect(shellLayoutFor([{ topBar: false }, { topBar: true }]).topBar).toBe(true);
  });

  it('fill makes a one-screen page (Messages), never with the rail or site chrome', () => {
    expect(shellLayoutFor([{ rail: false, width: 'wide', topBar: false, fill: true }])).toEqual({ rail: false, width: 'wide', chrome: 'app', topBar: false, fill: true });
    expect(shellLayoutFor([{ fill: true }]).fill).toBe(false);
    expect(shellLayoutFor([{ chrome: 'site', fill: true }]).fill).toBe(false);
  });

  it('site chrome always means no rail and the narrow column', () => {
    expect(shellLayoutFor([{ chrome: 'site' }])).toEqual({ rail: false, width: 'narrow', chrome: 'site', topBar: true, fill: false });
    expect(shellLayoutFor([{ chrome: 'site', rail: true, width: 'wide' }])).toEqual({ rail: false, width: 'narrow', chrome: 'site', topBar: true, fill: false });
    expect(shellLayoutFor([{ chrome: 'site' }, { chrome: 'app', rail: false }])).toEqual({ rail: false, width: 'wide', chrome: 'app', topBar: true, fill: false });
    expect(shellLayoutFor([{ chrome: 'web' }])).toEqual({ rail: true, width: 'narrow', chrome: 'app', topBar: true, fill: false });
  });
});

describe('vercel.json SPA rewrites and security headers', () => {
  it('rewrites public site and app entry paths to /index.html without exposing /dev/kit', async () => {
    const { default: vercel } = await import('../../vercel.json');
    const spaSources = new Set(vercel.rewrites.filter((r) => r.destination === '/index.html').map((r) => r.source));
    for (const path of ['/feed', '/categories', '/c/:category', '/search', '/notifications', '/messages', '/settings', '/about', '/privacy', '/terms', '/unsubscribe', '/auth/reset']) {
      expect(spaSources.has(path)).toBe(true);
    }
    expect(spaSources.has('/explore')).toBe(false);
    expect(spaSources.has('/dev/kit')).toBe(false);

    const globalHeaders = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
    const keys = new Set(globalHeaders.map((h) => h.key));
    expect(keys.has('Content-Security-Policy')).toBe(true);
    expect(keys.has('Permissions-Policy')).toBe(true);
    expect(keys.has('Strict-Transport-Security')).toBe(true);
  });
});

describe('RouteError', () => {
  it('renders a branded recovery screen for runtime and stale-chunk errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const Boom = () => {
        throw new Error('Unexpected boom');
      };
      const router1 = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }], { initialEntries: ['/'] });
      const first = render(<RouterProvider router={router1} />);
      expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Go home' }).getAttribute('href')).toBe('/');
      first.unmount();

      const StaleChunk = () => {
        throw new Error('Failed to fetch dynamically imported module: /assets/index.js');
      };
      const router2 = createMemoryRouter([{ path: '/', element: <StaleChunk />, errorElement: <RouteError /> }], { initialEntries: ['/'] });
      render(<RouterProvider router={router2} />);
      expect(screen.getByRole('heading', { level: 1, name: 'A new version of Publisense is available' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
