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
  ['/b/supabase', 'supabase'],
  ['/b/supabase?tab=roadmap', 'supabase'],
  ['/b/supabase/manage', 'Manage supabase'],
  ['/h/acme', 'acme'],
  ['/h/acme/manage', 'Manage acme'],
  ['/post/123', 'Post 123'],
  ['/u/alex', '@alex'],
  ['/notifications', 'Notifications'],
  ['/settings', 'Settings'],
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms of Service'],
  ['/auth/reset', 'Set a new password'],
  ['/unsubscribe?token=abc', 'Unsubscribe'],
  ['/admin/reports', 'Reports'],
  ['/admin/disputes', 'Ownership disputes'],
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
