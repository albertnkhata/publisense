import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  compactCount,
  isLive,
  plural,
  POPULAR_STATUSES,
  shortAge,
  summarizeCategories,
  useAllPopularByStatus,
  useVote,
  type Board,
  type Hub,
  type PopularStatus,
} from '../api';
import { BoardCard, CardGrid, HubRow, RowItem, RowList, Section } from '../boards/parts';
import { cx } from '../lib/cx';
import { trendingNote, trendingTitle } from '../lib/trendingCopy';
import { useViewer } from '../lib/viewer';
import { LoadError } from '../posts/PostList';
import { useRequireAuth } from '../shell/auth';
import { openSearchModal } from '../shell/SearchWell';
import { Icon, SkeletonBlock, StatusPill, STATUS_META, TabPanel, Tabs, TYPE_META, useToast } from '../ui';

const POPULAR_EMPTY: Record<PopularStatus, string> = {
  open: 'No open posts yet',
  under_review: 'No posts under review yet',
  planned: 'No planned posts yet',
  in_progress: 'No posts in progress yet',
  shipped: 'No shipped posts yet',
};

/**
 * Trending boards this week (3-column grid), or Most active fallback when enabled
 * on the signed-out Landing page and there are no recent posts.
 */
export function DiscoveryBoardsSection({
  boards,
  trending,
  now,
  showMostActiveFallback = false,
  action,
  id = 'disc-boards',
}: {
  boards: Board[];
  trending: Array<Board & { recent: number }>;
  now?: Date;
  showMostActiveFallback?: boolean;
  action?: ReactNode;
  id?: string;
}) {
  const mostActive = useMemo(
    () =>
      boards
        .filter(isLive)
        .slice()
        .sort((a, b) => b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name))
        .slice(0, 6),
    [boards],
  );

  if (trending.length > 0) {
    const items = trending.slice(0, 6);
    return (
      <Section id={id} title={trendingTitle(items.length)} note={action ? undefined : trendingNote(items.length)} action={action}>
        <CardGrid cols={3} label="Products with new posts this week">
          {items.map((b) => (
            <li key={b.id} className="min-w-0">
              <BoardCard board={b} now={now} />
            </li>
          ))}
        </CardGrid>
      </Section>
    );
  }

  if (!showMostActiveFallback || mostActive.length === 0) return null;

  return (
    <Section id={id} title="Most active" note={action ? undefined : 'Popular products on Publisense'} action={action}>
      <CardGrid cols={3} label="Most active products">
        {mostActive.map((b) => (
          <li key={b.id} className="min-w-0">
            <BoardCard board={b} now={now} />
          </li>
        ))}
      </CardGrid>
    </Section>
  );
}

/**
 * Popular posts ranked by team status (Open · Under review · Planned · In progress · Shipped).
 * Hidden entirely when every status tab is empty.
 */
export function PopularPostsSection({ id = 'disc-popular' }: { id?: string }) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const [pickedTab, setPickedTab] = useState<PopularStatus | null>(null);
  const popularQueries = useAllPopularByStatus(viewer?.id ?? null, 6);
  const vote = useVote(viewer?.id ?? null);

  const firstNonEmpty = POPULAR_STATUSES.find((_, i) => (popularQueries[i]?.data?.length ?? 0) > 0);
  const anyPending = popularQueries.some((q) => q.isPending);
  const anyError = popularQueries.some((q) => q.isError);
  const allErrored = popularQueries.every((q) => q.isError);

  // If every status settled empty with no errors, omit the section entirely so zero-post states don't show an empty box.
  if (!anyPending && !anyError && !firstNonEmpty) return null;

  const tab: PopularStatus = pickedTab ?? firstNonEmpty ?? 'open';
  const activeQuery = popularQueries[POPULAR_STATUSES.indexOf(tab)];
  const waitingForFirst = pickedTab === null && !firstNonEmpty && anyPending && !allErrored;
  const posts = activeQuery?.data ?? [];

  const items = POPULAR_STATUSES.map((status) => ({
    value: status,
    label: STATUS_META[status].label,
  }));

  return (
    <Section id={id} title="Popular posts" note="By team status">
      <Tabs idBase={id} label="Posts by status" value={tab} onChange={setPickedTab} items={items} className="mb-3" />
      <TabPanel idBase={id} value={tab}>
        {waitingForFirst || activeQuery?.isPending ? (
          <div className="divide-y divide-line rounded-md border border-line bg-card px-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <SkeletonBlock className="h-8 w-8 rounded-sm" />
                <div className="flex flex-1 flex-col gap-2">
                  <SkeletonBlock className="h-3 w-3/5" />
                  <SkeletonBlock className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : activeQuery?.isError ? (
          <LoadError title="We couldn’t load popular posts" onRetry={() => void activeQuery.refetch()} retrying={activeQuery.isRefetching} />
        ) : posts.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed border-line-strong bg-card px-4 py-6 text-center text-sm text-ink-muted">
            {POPULAR_EMPTY[tab]}
          </p>
        ) : (
          <ul aria-label={`${STATUS_META[tab].label} popular posts`} className="m-0 list-none divide-y divide-line rounded-md border border-line bg-card p-0">
            {posts.map((p) => {
              const voteLabel = `${p.voted ? 'Remove upvote' : 'Upvote'}, ${p.vote_count} ${p.vote_count === 1 ? 'vote' : 'votes'}`;
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    aria-pressed={p.voted}
                    aria-label={voteLabel}
                    onClick={() => {
                      if (!requireAuth('upvote')) return;
                      const next = !p.voted;
                      vote.mutate(
                        { post: p, on: next },
                        {
                          onSuccess: () => {
                            if (next && !p.following) toast('Upvoted · you’ll get updates on this post');
                          },
                          onError: (err) => toast(err instanceof Error ? err.message : 'Something went wrong. Try again.'),
                        },
                      );
                    }}
                    className={cx(
                      'inline-flex min-w-8 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs leading-none font-semibold tabular-nums transition-colors duration-120',
                      p.voted
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-line bg-subtle text-ink-secondary hover:border-line-strong hover:text-ink',
                    )}
                  >
                    <Icon name="arrow-up" size={12} />
                    {p.vote_count > 0 ? <span>{compactCount(p.vote_count)}</span> : null}
                  </button>
                  <Link to={`/post/${p.id}`} className="flex min-w-0 flex-1 flex-col gap-1 no-underline">
                    <span className="text-base font-semibold text-ink wrap-anywhere hover:text-brand">{p.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                      <span>{p.board?.name ?? 'Unknown product'}</span>
                      <span>· {TYPE_META[p.type].label}</span>
                      <span>· {shortAge(p.created_at)}</span>
                      {p.has_official_reply ? <span>· Team replied</span> : null}
                      {p.status === 'shipped' ? <StatusPill status="shipped" /> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </TabPanel>
    </Section>
  );
}

/**
 * Product-family hubs (companies with 2+ live boards).
 */
export function HubsSection({ hubs, id = 'disc-hubs' }: { hubs: Hub[]; id?: string }) {
  if (hubs.length === 0) return null;
  return (
    <Section id={id} title="Hubs" note="Product families in one place">
      <RowList label="Hubs">
        {hubs.map((h) => (
          <RowItem key={h.id}>
            <HubRow hub={h} />
          </RowItem>
        ))}
      </RowList>
    </Section>
  );
}

/**
 * 3-column Categories summary grid replacing the unscalable "All products" wall.
 */
export function CategoriesSection({ boards, id = 'disc-categories' }: { boards: Board[]; id?: string }) {
  const cats = useMemo(() => summarizeCategories(boards), [boards]);
  const liveCount = useMemo(() => boards.filter(isLive).length, [boards]);

  if (cats.length === 0) return null;

  return (
    <Section
      id={id}
      title="Categories"
      action={
        <button
          type="button"
          onClick={() => openSearchModal({ scope: 'boards' })}
          className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-brand hover:underline"
        >
          All {liveCount} {liveCount === 1 ? 'product' : 'products'} →
        </button>
      }
    >
      <ul aria-label="Categories" className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {cats.map((c) => (
          <li key={c.category} className="min-w-0">
            <Link
              to={`/c/${c.category}`}
              className="flex h-full flex-col gap-1 rounded-md border border-line bg-card p-4 text-ink no-underline transition-colors duration-120 hover:border-line-strong"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold text-ink">{c.label}</span>
                <span className="font-mono text-xs text-ink-muted tabular-nums">{plural(c.count, 'product')}</span>
              </span>
              <span className="truncate text-sm text-ink-muted">{c.examples.join(', ')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
