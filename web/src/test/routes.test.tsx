import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  // The right rail (search, boards card, claim line, legal footer) is opt-out per route via
  // `handle: { rail: false }`. Today only the staff /admin branch drops it.
  const ADMIN = CASES.map(([p]) => p).filter((p) => p.startsWith('/admin'));
  const PUBLIC = CASES.map(([p]) => p).filter((p) => !p.startsWith('/admin'));

  it.each(ADMIN)('%s has no right rail, a full-width column and a top bar with search at every width', (path) => {
    renderAt(path);
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    const main = document.getElementById('main')!;
    expect(main.className).toContain('max-w-wide');
    expect(main.className).not.toContain('max-w-content');
    const header = screen.getAllByRole('banner')[0]!;
    expect(header.className.split(/\s+/)).toContain('flex');
    expect(header.className).not.toContain('max-lg:flex');
    expect(screen.getAllByRole('button', { name: /search/i }).length).toBeGreaterThan(0);
  });

  it.each(PUBLIC)('%s keeps the right rail', (path) => {
    renderAt(path);
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(document.getElementById('main')!.className).toContain('max-w-content');
    expect(screen.getAllByRole('banner')[0]!.className).toContain('max-lg:flex');
  });
});

describe('shellLayoutFor', () => {
  it('defaults to the rail and lets the deepest route that says something win', () => {
    expect(shellLayoutFor([])).toEqual({ rail: true });
    expect(shellLayoutFor([undefined, null, 'x', {}])).toEqual({ rail: true });
    expect(shellLayoutFor([undefined, { rail: false }, undefined])).toEqual({ rail: false });
    expect(shellLayoutFor([{ rail: false }, { rail: true }])).toEqual({ rail: true });
  });
});
