import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './shell/AppShell';
import { EXPLORE_PAGE, MANAGE_PAGE, MESSAGES_PAGE, NO_RAIL_NARROW, SITE_PAGE, STAFF_PAGE } from './shell/layout';
import { NotFound } from './pages/NotFound';
import { RouteError } from './pages/RouteError';
import {
  AboutPage,
  AdminDisputesPage,
  AdminOverviewPage,
  AdminProductsPage,
  AdminCompaniesPage,
  AdminReportsPage,
  AdminTeamPage,
  AuthResetPage,
  BoardManagePage,
  BoardPage,
  CategoriesPage,
  CategoryPage,
  ConversationPage,
  FeedPage,
  HomePage,
  HubManagePage,
  HubPage,
  MessagesPage,
  NewConversationPage,
  NoConversationPage,
  NotificationsPage,
  PostPage,
  PrivacyPage,
  SearchPage,
  SettingsPage,
  TermsPage,
  UnsubscribePage,
  UserPage,
} from './pages/routes';

const DevKit = import.meta.env.DEV ? lazy(() => import('./pages/DevKit')) : null;

/**
 * FOUNDATION §9 route table. Real paths; the mockup's #hash routes do not carry over.
 * App routes share the unified AppShell (TopBar + left NavRail + mobile TabBar),
 * with RightRail on feed/board/hub/post/profile/search/404 routes and wide/narrow
 * no-rail columns (with LandingFooter when `!fill`) on directory, utility, manage,
 * and admin pages. Standalone links (about, terms, privacy, password reset,
 * unsubscribe) use SITE_PAGE.
 */
export const routes = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, handle: EXPLORE_PAGE, element: <HomePage /> },
      { path: 'feed', element: <FeedPage /> },
      { path: 'categories', handle: EXPLORE_PAGE, element: <CategoriesPage /> },
      { path: 'c/:category', handle: EXPLORE_PAGE, element: <CategoryPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'b/:board', element: <BoardPage /> },
      { path: 'b/:board/manage', handle: MANAGE_PAGE, element: <BoardManagePage /> },
      { path: 'h/:hub', element: <HubPage /> },
      { path: 'h/:hub/manage', handle: MANAGE_PAGE, element: <HubManagePage /> },
      { path: 'post/:id', element: <PostPage /> },
      { path: 'u/:handle', element: <UserPage /> },
      { path: 'notifications', handle: NO_RAIL_NARROW, element: <NotificationsPage /> },
      {
        path: 'messages',
        handle: MESSAGES_PAGE,
        element: <MessagesPage />,
        children: [
          { index: true, element: <NoConversationPage /> },
          { path: 'to/:handle', element: <NewConversationPage /> },
          { path: ':id', element: <ConversationPage /> },
        ],
      },
      { path: 'settings', handle: NO_RAIL_NARROW, element: <SettingsPage /> },
      { path: 'about', handle: SITE_PAGE, element: <AboutPage /> },
      { path: 'privacy', handle: SITE_PAGE, element: <PrivacyPage /> },
      { path: 'terms', handle: SITE_PAGE, element: <TermsPage /> },
      { path: 'auth/reset', handle: SITE_PAGE, element: <AuthResetPage /> },
      { path: 'unsubscribe', handle: SITE_PAGE, element: <UnsubscribePage /> },
      // Staff Command Centre: no right rail, wide content column (shell/layout.ts).
      {
        path: 'admin',
        handle: STAFF_PAGE,
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
  ...(DevKit
    ? [
        {
          path: '/dev/kit',
          errorElement: <RouteError />,
          element: (
            <Suspense fallback={null}>
              <DevKit />
            </Suspense>
          ),
        },
      ]
    : []),
];

const router = createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
