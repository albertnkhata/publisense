import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './shell/AppShell';
import { NotFound } from './pages/NotFound';
import {
  AdminDisputesPage,
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

/** FOUNDATION §9 route table. Real paths; the mockup's #hash routes do not carry over. */
export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'explore', element: <ExplorePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'b/:board', element: <BoardPage /> },
      { path: 'b/:board/manage', element: <BoardManagePage /> },
      { path: 'h/:hub', element: <HubPage /> },
      { path: 'h/:hub/manage', element: <HubManagePage /> },
      { path: 'post/:id', element: <PostPage /> },
      { path: 'u/:handle', element: <UserPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'auth/reset', element: <AuthResetPage /> },
      { path: 'unsubscribe', element: <UnsubscribePage /> },
      { path: 'admin/products', element: <AdminProductsPage /> },
      { path: 'admin/companies', element: <AdminCompaniesPage /> },
      { path: 'admin/reports', element: <AdminReportsPage /> },
      { path: 'admin/disputes', element: <AdminDisputesPage /> },
      { path: 'admin/team', element: <AdminTeamPage /> },
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
