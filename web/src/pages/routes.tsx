import { useParams, useSearchParams } from 'react-router';
import { Placeholder } from './Placeholder';

/*
 * Placeholder screens for every route in FOUNDATION §9. Each names the build
 * step that replaces it. Param-driven titles prove the real paths resolve.
 */

// Step 5: feed and posts.
export { HomePage } from './HomePage';
export { PostPage } from './PostPage';
export const ExplorePage = () => <Placeholder title="Explore" icon="explore" step={6} />;

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q');
  return (
    <Placeholder title="Search" icon="search" step={6}>
      {q ? <>Results for “{q}”</> : null}
    </Placeholder>
  );
}

export function BoardPage() {
  const { board } = useParams();
  const [params] = useSearchParams();
  const tab = params.get('tab');
  return (
    <Placeholder title={board ?? 'Board'} icon="hub" step={6}>
      {tab === 'roadmap' || tab === 'changelog' ? <>Tab: {tab}</> : null}
    </Placeholder>
  );
}

export function BoardManagePage() {
  const { board } = useParams();
  return <Placeholder title={`Manage ${board ?? 'board'}`} icon="settings" step={7} />;
}

export function HubPage() {
  const { hub } = useParams();
  return <Placeholder title={hub ?? 'Hub'} icon="hub" step={6} />;
}

export function HubManagePage() {
  const { hub } = useParams();
  return <Placeholder title={`Manage ${hub ?? 'hub'}`} icon="settings" step={7} />;
}

export function UserPage() {
  const { handle } = useParams();
  return <Placeholder title={`@${handle ?? ''}`} icon="user" step={5} />;
}

export const NotificationsPage = () => <Placeholder title="Notifications" icon="bell" step={5} />;
// Step 4: account screens.
export { SettingsPage } from './SettingsPage';
export { PrivacyPage, TermsPage } from './LegalPages';
export { AuthResetPage } from './AuthResetPage';
export { UnsubscribePage } from './UnsubscribePage';

export const AdminReportsPage = () => <Placeholder title="Reports" icon="flag" step={8} />;
export const AdminDisputesPage = () => <Placeholder title="Ownership disputes" icon="shield" step={8} />;
