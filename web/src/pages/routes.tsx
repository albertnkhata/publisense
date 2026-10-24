import { useParams } from 'react-router';
import { Placeholder } from './Placeholder';

/*
 * Placeholder screens for every route in FOUNDATION §9. Each names the build
 * step that replaces it. Param-driven titles prove the real paths resolve.
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

export function UserPage() {
  const { handle } = useParams();
  return <Placeholder title={`@${handle ?? ''}`} icon="user" step={8} />;
}

export const NotificationsPage = () => <Placeholder title="Notifications" icon="bell" step={8} />;
// Step 4: account screens.
export { SettingsPage } from './SettingsPage';
export { PrivacyPage, TermsPage } from './LegalPages';
export { AuthResetPage } from './AuthResetPage';
export { UnsubscribePage } from './UnsubscribePage';

export const AdminReportsPage = () => <Placeholder title="Reports" icon="flag" step={8} />;
export const AdminDisputesPage = () => <Placeholder title="Ownership disputes" icon="shield" step={8} />;
