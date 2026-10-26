import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../App';
import { Providers } from '../Providers';

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
  ['/claim', 'Claim your board'], // public explainer (#157)
  ['/auth/reset', 'Set a new password'],
  ['/unsubscribe?token=abc', 'Unsubscribe'],
  // Admin screens are for platform admins only; signed out they ask you to sign in.
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
});
