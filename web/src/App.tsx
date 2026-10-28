import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './shell/AppShell';
import { NO_RAIL_NARROW, NO_RAIL_WIDE, SITE_PAGE } from './shell/layout';
import { NotFound } from './pages/NotFound';
import {
  AdminDisputesPage,
  AdminOverviewPage,
  AdminProductsPage,
  AdminCompaniesPage,
  AdminReportsPage,
  AdminTeamPage,
  AuthResetPage,
  BoardManagePage,
  BoardPage,
  ExplorePage,
  HomePage,
  HubManagePage,
  HubPage,
  NotificationsPage,
  PostPage,
  PrivacyPage,
  SearchPage,
  SettingsPage,
  TermsPage,
  UnsubscribePage,
  UserPage,
} from './pages/routes';

const DevKit = lazy(() => import('./pages/DevKit'));

/**
 * FOUNDATION §9 route table. Real paths; the mockup's #hash routes do not carry over.
 * The right rail shows on browsing pages (home, explore, search, boards, hubs, posts,
 * profiles, 404). Task pages drop it (shell/layout.ts): Manage and /admin go wide;
 * settings, notifications, password reset and unsubscribe keep the reading width.
 * The legal pages swap the app frame for a plain website header (SITE_PAGE).
 */
export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'explore', element: <ExplorePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'b/:board', element: <BoardPage /> },
      { path: 'b/:board/manage', handle: NO_RAIL_WIDE, element: <BoardManagePage /> },
      { path: 'h/:hub', element: <HubPage /> },
      { path: 'h/:hub/manage', handle: NO_RAIL_WIDE, element: <HubManagePage /> },
      { path: 'post/:id', element: <PostPage /> },
      { path: 'u/:handle', element: <UserPage /> },
      { path: 'notifications', handle: NO_RAIL_NARROW, element: <NotificationsPage /> },
      { path: 'settings', handle: NO_RAIL_NARROW, element: <SettingsPage /> },
      { path: 'privacy', handle: SITE_PAGE, element: <PrivacyPage /> },
      { path: 'terms', handle: SITE_PAGE, element: <TermsPage /> },
      { path: 'auth/reset', handle: NO_RAIL_NARROW, element: <AuthResetPage /> },
      { path: 'unsubscribe', handle: NO_RAIL_NARROW, element: <UnsubscribePage /> },
      // Staff Command Centre: no right rail, full-width content (shell/layout.ts).
      {
        path: 'admin',
        handle: NO_RAIL_WIDE,
        children: [
          { index: true, element: <AdminOverviewPage /> },
          { path: 'products', element: <AdminProductsPage /> },
          { path: 'companies', element: <AdminCompaniesPage /> },
          { path: 'reports', element: <AdminReportsPage /> },
          { path: 'disputes', element: <AdminDisputesPage /> },
          { path: 'team', element: <AdminTeamPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/dev/kit',
    element: (
      <Suspense fallback={null}>
        <DevKit />
      </Suspense>
    ),
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
