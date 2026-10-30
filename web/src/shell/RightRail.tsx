import { Link, useLocation } from 'react-router';
import { compactCount, hasSupabaseConfig, isLive, logoSrc, shortAge, useBoards, useHubs, useTrending, type Board } from '../api';
import { BoardAvatar, Card, SkeletonBlock } from '../ui';
import { useClaim } from '../claim/ClaimDialog';
import { LegalLinks } from './LegalLinks';
import { SearchWell } from './SearchWell';

/**
 * Right rail above lg: search, a boards card and the claim line.
 * Terms · Privacy sit at the foot of the right rail.
 * The boards card says what its ordering is (#156): "Trending this
 * week" (boards with new posts this week, most first, with that count) when
 * there is activity, else "Recently added" (newest boards, with their age).
 */
export function RightRail() {
  return (
    <aside aria-label="Sidebar" className="sticky top-6 flex w-rail shrink-0 flex-col gap-4 self-start max-lg:hidden">
      <SearchWell />
      <Card padding="md">{hasSupabaseConfig ? <RailBoards /> : <RailEmpty />}</Card>
      <ClaimLine />
      <LegalLinks inline className="pt-2" />
    </aside>
  );
}

/** Mockup .claim-line: opens the claim flow on the board or hub being viewed, else the product picker. */
export function ClaimLine() {
  const { openClaim } = useClaim();
  const location = useLocation();
  const boards = useBoards();
  const hubs = useHubs();
  const boardSlug = /^\/b\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
  const hubSlug = /^\/h\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
  const hereBoard = boardSlug ? boards.data?.find((b) => b.slug === boardSlug) : undefined;
  const hereHub = hubSlug ? hubs.data?.find((h) => h.slug === hubSlug) : undefined;

  const handleClaim = () => {
    if (hereBoard && !hereBoard.claimed_at) {
      openClaim({ board: hereBoard.slug });
    } else if (hereHub && !hereHub.claimed_at) {
      openClaim({ hub: hereHub.slug });
    } else {
      openClaim();
    }
  };

  // Hub copy only while the hub can still be claimed; otherwise the generic picker line.
  const hubOpen = Boolean(hereHub && !hereHub.claimed_at);
  const actionText = hubOpen ? 'Claim this hub' : 'Claim its board';
  const promptText = hubOpen ? 'Maintain these products?' : 'Maintain a product?';

  return (
    <p className="m-0 px-2 text-sm text-ink-muted">
      {promptText}{' '}
      <button
        type="button"
        onClick={handleClaim}
        className="border-0 bg-transparent p-0 font-semibold text-ink-secondary underline decoration-line-strong underline-offset-3 hover:text-brand hover:decoration-current"
      >
        {actionText}
      </button>
    </p>
  );
}

export const RAIL = { trending: 'Trending this week', recent: 'Recently added', empty: 'Boards', emptyText: 'Boards with new posts this week will show here.' };

function RailHeading({ children }: { children: string }) {
  return <h2 className="mt-0 mb-3 text-sm font-bold text-ink">{children}</h2>;
}

function RailEmpty() {
  return (
    <>
      <RailHeading>{RAIL.empty}</RailHeading>
      <p className="m-0 text-sm text-ink-muted">{RAIL.emptyText}</p>
    </>
  );
}

export function RailBoards() {
  const boards = useBoards();
  const trending = useTrending(boards.data, 5);
  if (boards.isPending || (boards.isSuccess && boards.data.length > 0 && trending.isPending)) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading boards" aria-busy="true">
        <SkeletonBlock className="h-4 w-1/2" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-4 w-2/3" />
      </div>
    );
  }
  const hot = trending.data ?? [];
  if (hot.length) {
    return (
      <>
        <RailHeading>{RAIL.trending}</RailHeading>
        <RailList
          label="Trending boards"
          boards={hot}
          meta={(b) => {
            const n = (b as Board & { recent: number }).recent;
            return { text: `${compactCount(n)} new`, title: `${n} new ${n === 1 ? 'post' : 'posts'} this week` };
          }}
        />
      </>
    );
  }
  const newest = (boards.data ?? [])
    .filter(isLive)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  if (newest.length === 0) return <RailEmpty />;
  return (
    <>
      <RailHeading>{RAIL.recent}</RailHeading>
      <RailList label="Recently added boards" boards={newest} meta={(b) => ({ text: shortAge(b.created_at), title: `Added ${new Date(b.created_at).toLocaleDateString()}` })} />
    </>
  );
}

function RailList({ label, boards, meta }: { label: string; boards: Board[]; meta: (b: Board) => { text: string; title: string } }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label={label}>
      {boards.map((b) => {
        const m = meta(b);
        return (
          <li key={b.id}>
            <Link to={`/b/${b.slug}`} className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-2 text-base font-medium text-ink no-underline hover:bg-subtle">
              <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="sm" decorative />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              <span title={m.title} className="font-mono text-xs text-ink-muted tabular-nums">
                {m.text}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
