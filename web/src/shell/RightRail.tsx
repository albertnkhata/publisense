import { Link } from 'react-router';
import { Card } from '../ui';
import { LegalLinks } from './LegalLinks';
import { SearchWell } from './SearchWell';

/**
 * Right rail above lg: search, Trending (placeholder until boards exist in
 * step 3/6), the claim line and the legal footer.
 */
export function RightRail() {
  return (
    <aside aria-label="Sidebar" className="sticky top-6 flex w-rail shrink-0 flex-col gap-4 self-start max-lg:hidden">
      <SearchWell />
      <Card padding="md">
        <h2 className="mt-0 mb-3 text-sm font-bold text-ink">Trending</h2>
        <p className="m-0 text-sm text-ink-muted">Boards with the most activity this week will show here.</p>
      </Card>
      <p className="m-0 px-2 text-sm text-ink-muted">
        Maintain a product?{' '}
        <Link
          to="/explore"
          className="font-semibold text-ink-secondary underline decoration-line-strong underline-offset-3 hover:text-brand hover:decoration-current"
        >
          Find its board
        </Link>
      </p>
      <LegalLinks />
    </aside>
  );
}
