/*
 * Screens for every route in FOUNDATION §9, by the build step that delivered them.
 */

// Step 5: feed and posts.
export { HomePage } from './HomePage';
export { PostPage } from './PostPage';

// Step 6: boards, hubs and discovery.
export { BoardPage } from './BoardPage';
export { HubPage } from './HubPage';
export { ExplorePage } from './ExplorePage';
export { SearchPage } from './SearchPage';

// Step 7: claiming and teams.
export { BoardManagePage, HubManagePage } from '../manage/ManagePage';

// Step 8: moderation and people.
export { UserPage } from './UserPage';
export { NotificationsPage } from './NotificationsPage';
export { AdminDisputesPage, AdminReportsPage, AdminTeamPage } from './AdminPages';

// Add a product (0024): the admin review queue.
export { AdminProductsPage } from './AdminPages';

// Companies (0026): hubs and their domains.
export { AdminCompaniesPage } from './AdminPages';

// Step 4: account screens.
export { SettingsPage } from './SettingsPage';
export { PrivacyPage, TermsPage } from './LegalPages';

// How claiming works, public (#157).
export { ClaimPage } from './ClaimPage';
export { AuthResetPage } from './AuthResetPage';
export { UnsubscribePage } from './UnsubscribePage';
