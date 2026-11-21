import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  compactCount,
  followKey,
  isLive,
  logoSrc,
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
import { trendingTitle } from '../lib/trendingCopy';
import { useViewer } from '../lib/viewer';
import { LoadError } from '../posts/PostList';
import { useRequireAuth } from '../shell/auth';
import { BoardAvatar, HubAvatar, Icon, SkeletonBlock, StatusPill, STATUS_META, TabPanel, Tabs, TypePill, useToast } from '../ui';

const YOUR_PRODUCTS_LIMIT = 6;

type FollowedItem = { kind: 'board'; board: Board } | { kind: 'hub'; hub: Hub };

/**
 * Compact strip of products & hubs the signed-in viewer follows, linking directly
 * to each board/hub and offering a shortcut to `/feed?scope=following`.
 * Omitted entirely when the viewer follows nothing yet (Day 1).
 */
export function YourProductsSection({
  boards,
  hubs,
  followed,
  id = 'home-your-products',
}: {
  boards: Board[];
  hubs: Hub[];
  followed: Set<string> | undefined;
  id?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const items = useMemo<FollowedItem[]>(() => {
    if (!followed || followed.size === 0) return [];
    const followedBoards: FollowedItem[] = boards
      .filter((b) => isLive(b) && followed.has(followKey('board', b.id)))
      .slice()
      .sort((a, b) => b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name))
      .map((board) => ({ kind: 'board', board }));
    const followedHubs: FollowedItem[] = hubs
      .filter((h) => followed.has(followKey('hub', h.id)))
      .slice()
      .sort((a, b) => b.follower_count - a.follower_count || a.name.localeCompare(b.name))
      .map((hub) => ({ kind: 'hub', hub }));
    return [...followedBoards, ...followedHubs];
  }, [boards, hubs, followed]);

  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, YOUR_PRODUCTS_LIMIT);
  const hiddenCount = items.length - shown.length;

  return (
    <Section
      id={id}
      title="Your products"
      action={
        <Link to="/feed?scope=following" className="text-sm font-semibold text-brand no-underline hover:underline">
          See posts →
        </Link>
      }
    >
      <ul aria-label="Your followed products" className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {shown.map((item) =>
          item.kind === 'board' ? (
            <li key={`board:${item.board.id}`} className="min-w-0">
              <Link
                to={`/b/${item.board.slug}`}
                className="flex h-full items-center gap-3 rounded-md border border-line bg-card p-3 text-ink no-underline transition-colors duration-120 hover:border-line-strong hover:bg-subtle/35"
              >
                <BoardAvatar name={item.board.name} color={item.board.color} logoSrc={logoSrc(item.board)} size="md" decorative />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold text-ink">{item.board.name}</span>
                  <span className="truncate text-sm text-ink-muted">
                    {item.board.post_count > 0 ? plural(item.board.post_count, 'post') : item.board.tagline}
                  </span>
                </span>
              </Link>
            </li>
          ) : (
            <li key={`hub:${item.hub.id}`} className="min-w-0">
              <Link
                to={`/h/${item.hub.slug}`}
                className="flex h-full items-center gap-3 rounded-md border border-line bg-card p-3 text-ink no-underline transition-colors duration-120 hover:border-line-strong hover:bg-subtle/35"
              >
                <HubAvatar
                  name={`${item.hub.name} hub`}
                  size="md"
                  boards={item.hub.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))}
                  reserve
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold text-ink">{item.hub.name} hub</span>
                  <span className="truncate text-sm text-ink-muted">{plural(item.hub.boards.length, 'product')}</span>
                </span>
              </Link>
            </li>
          ),
        )}
      </ul>
      {items.length > YOUR_PRODUCTS_LIMIT ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-ink-secondary hover:text-ink"
          >
            {expanded ? 'Show fewer' : `Show ${hiddenCount} more`}
          </button>
        </div>
      ) : null}
    </Section>
  );
}

const POPULAR_EMPTY: Record<PopularStatus, string> = {
  open: 'No open posts yet',
  under_review: 'No posts under review yet',
  planned: 'No planned posts yet',
  in_progress: 'No posts in progress yet',
  shipped: 'No shipped posts yet',
};

/**
 * Trending boards this week (3-column grid), or a "Most active" fallback (all-time activity)
 * when there are no recent posts but boards have existing activity.
 */
export function DiscoveryBoardsSection({
  boards,
  trending,
  now,
  showMostActiveFallback = true,
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
        .filter((b) => isLive(b) && (b.post_count > 0 || b.follower_count > 0))
        .slice()
        .sort((a, b) => b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name))
        .slice(0, 6),
    [boards],
  );

  if (trending.length > 0) {
    const items = trending.slice(0, 6);
    return (
      <Section id={id} title={trendingTitle(items.length)} action={action}>
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
    <Section id={id} title="Most active" action={action}>
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

  // Hide status tabs that have settled empty, and omit the tab bar entirely when Open is the only populated status.
  const visibleStatuses = POPULAR_STATUSES.filter((_, i) => {
    const q = popularQueries[i];
    return q?.isPending || q?.isError || (q?.data?.length ?? 0) > 0;
  });
  const populatedStatuses = POPULAR_STATUSES.filter((_, i) => (popularQueries[i]?.data?.length ?? 0) > 0);
  const showTabs =
    populatedStatuses.length > 1 ||
    (populatedStatuses.length === 1 && populatedStatuses[0] !== 'open') ||
    (populatedStatuses.length === 0 && anyError);

  const candidateTab: PopularStatus = pickedTab ?? firstNonEmpty ?? visibleStatuses[0] ?? 'open';
  const tab: PopularStatus = visibleStatuses.includes(candidateTab) ? candidateTab : (firstNonEmpty ?? visibleStatuses[0] ?? 'open');
  const activeQuery = popularQueries[POPULAR_STATUSES.indexOf(tab)];
  const waitingForFirst = pickedTab === null && !firstNonEmpty && anyPending && !allErrored;
  const posts = activeQuery?.data ?? [];

  const items = visibleStatuses.map((status) => ({
    value: status,
    label: STATUS_META[status].label,
  }));

  const body =
    waitingForFirst || activeQuery?.isPending ? (
      <div className="divide-y divide-line rounded-md border border-line bg-card px-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <SkeletonBlock className="size-8 rounded-sm" />
            <div className="flex flex-1 flex-col gap-2">
              <SkeletonBlock className="h-3 w-3/5" />
              <SkeletonBlock className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    ) : activeQuery?.isError ? (
      <LoadError title="We couldn’t load top feedback" onRetry={() => void activeQuery.refetch()} retrying={activeQuery.isRefetching} />
    ) : posts.length === 0 ? (
      <p className="m-0 rounded-md border border-dashed border-line-strong bg-card px-4 py-6 text-center text-sm text-ink-muted">
        {POPULAR_EMPTY[tab]}
      </p>
    ) : (
      <ul aria-label={`${STATUS_META[tab].label} popular posts`} className="m-0 list-none divide-y divide-line rounded-md border border-line bg-card p-0">
            {posts.map((p) => {
              const voteLabel = `${p.voted ? 'Remove upvote' : 'Upvote'}, ${p.vote_count} ${p.vote_count === 1 ? 'vote' : 'votes'}`;
              const boardName = p.board?.name ?? 'Unknown product';
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 transition-colors duration-120 hover:bg-subtle/35">
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
                      'inline-flex min-h-8 min-w-8 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border font-mono text-xs leading-none font-semibold tabular-nums transition-colors duration-120',
                      p.vote_count > 0 ? 'px-2 py-1' : 'size-8',
                      p.voted
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-line-strong bg-card text-ink-secondary hover:border-brand hover:bg-brand-soft hover:text-brand',
                    )}
                  >
                    <Icon name="arrow-up" size={p.vote_count > 0 ? 12 : 15} strokeWidth={2} />
                    {p.vote_count > 0 ? <span>{compactCount(p.vote_count)}</span> : null}
                  </button>
                  <Link
                    to={`/post/${p.id}`}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-4 no-underline max-sm:flex-col max-sm:items-start max-sm:gap-2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-base font-semibold text-ink wrap-anywhere transition-colors duration-120 group-hover:text-brand">
                        {p.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-ink-muted">
                        <span className="inline-flex items-center gap-1 font-medium text-ink-secondary">
                          {p.board ? (
                            <BoardAvatar name={boardName} color={p.board.color} logoSrc={logoSrc(p.board)} size="xs" decorative />
                          ) : null}
                          <span>{boardName}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{shortAge(p.created_at)}</span>
                        {p.has_official_reply ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-brand">Team replied</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 whitespace-nowrap">
                      {p.reply_count > 0 ? (
                        <span
                          aria-label={`${p.reply_count} ${p.reply_count === 1 ? 'reply' : 'replies'}`}
                          className="inline-flex items-center gap-1 font-mono text-xs text-ink-muted tabular-nums"
                        >
                          <Icon name="reply" size={13} strokeWidth={1.8} />
                          <span>{compactCount(p.reply_count)}</span>
                        </span>
                      ) : null}
                      {p.status === 'shipped' ? <StatusPill status="shipped" /> : null}
                      <TypePill type={p.type} />
                    </span>
                  </Link>
                </li>
              );
            })}
      </ul>
    );

  return (
    <Section
      id={id}
      title="Top feedback"
      action={
        <Link to="/feed" className="text-sm font-medium text-ink-secondary no-underline hover:text-ink">
          All feedback →
        </Link>
      }
    >
      {showTabs ? (
        <>
          <Tabs idBase={id} label="Posts by status" value={tab} onChange={setPickedTab} items={items} className="mb-3" />
          <TabPanel idBase={id} value={tab}>
            {body}
          </TabPanel>
        </>
      ) : (
        body
      )}
    </Section>
  );
}

/**
 * Product-family hubs (companies with 2+ live boards).
 */
export function HubsSection({ hubs, id = 'disc-hubs' }: { hubs: Hub[]; id?: string }) {
  if (hubs.length === 0) return null;
  return (
    <Section id={id} title="Hubs">
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

  if (cats.length === 0) return null;

  return (
    <Section
      id={id}
      title="Categories"
      action={
        <Link to="/categories" className="text-sm font-semibold text-brand no-underline hover:underline">
          All categories →
        </Link>
      }
    >
      <ul aria-label="Categories" className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {cats.map((c) => (
          <li key={c.category} className="min-w-0">
            <Link
              to={`/c/${c.category}`}
              className="flex h-full flex-col gap-1 rounded-md border border-line bg-card p-4 text-ink no-underline transition-colors duration-120 hover:border-line-strong hover:bg-subtle/35"
            >
              <span className="text-base font-semibold text-ink">{c.label}</span>
              <span className="truncate text-sm text-ink-muted">{c.examples.join(', ')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
