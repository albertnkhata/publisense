import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ThemeProvider } from '../lib/ThemeProvider';
import { StaticViewerProvider, type Viewer } from '../lib/viewer';
import { AuthProvider } from '../shell/auth';
import { ToastProvider } from '../ui';

/** Test viewer: a signed-in account without Supabase. */
export const TEST_VIEWER: Viewer = {
  id: '00000000-0000-4000-8000-00000000000a',
  name: 'Alice Banda',
  handle: 'alice',
  bio: '',
  email: 'alice@example.org',
  avatarPath: null,
  avatarUrl: null,
  hasPassword: true,
  connected: [],
};

/**
 * Render `ui` at `path` with the app's providers, a fixed viewer (or none) and
 * the AuthDialog provider. No Supabase: tests mock the api layer.
 */
export function renderWith(ui: ReactNode, { viewer = null, path = '/' }: { viewer?: Viewer | null; path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '*', element: <AuthProvider>{ui}</AuthProvider> },
    ],
    { initialEntries: [path] },
  );
  const utils = render(
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
  return { ...utils, router, client };
}
