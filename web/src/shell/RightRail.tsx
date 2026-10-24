import { Link } from 'react-router';
import { hasSupabaseConfig, logoSrc, useBoards, useTrending } from '../api';
import { BoardAvatar, Card, SkeletonBlock } from '../ui';
import { LegalLinks } from './LegalLinks';
import { SearchWell } from './SearchWell';

/**
 * Right rail above lg: search, Trending boards (most new posts this week),
 * the claim line and the legal footer.
 */
export function RightRail() {
  return (
    <aside aria-label="Sidebar" className="sticky top-6 flex w-rail shrink-0 flex-col gap-4 self-start max-lg:hidden">
      <SearchWell />
      <Card padding="md">
        <h2 className="mt-0 mb-3 text-sm font-bold text-ink">Trending</h2>
        {hasSupabaseConfig ? <Trending /> : <p className="m-0 text-sm text-ink-muted">Boards with the most activity this week will show here.</p>}
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

function Trending() {
  const boards = useBoards();
  const trending = useTrending(boards.data, 5);
  if (boards.isPending || (boards.isSuccess && trending.isPending)) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
    );
  }
  const list = trending.data ?? [];
  if (list.length === 0) return <p className="m-0 text-sm text-ink-muted">Boards with the most activity this week will show here.</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label="Trending boards">
      {list.map((b) => (
        <li key={b.id}>
          <Link to={`/b/${b.slug}`} className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-2 text-base font-medium text-ink no-underline hover:bg-subtle">
            <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="sm" decorative />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            <span title={`${b.post_count} ${b.post_count === 1 ? 'post' : 'posts'}`} className="font-mono text-xs text-ink-muted tabular-nums">
              {b.post_count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
