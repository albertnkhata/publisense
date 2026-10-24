import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { dedupePosts, useFeed, type FeedScope, type FeedSort } from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { PostCard } from '../posts/PostCard';
import { useRequireAuth } from '../shell/auth';
import { useComposer } from '../shell/composer';
import {
  Button,
  EmptyState,
  Icon,
  Menu,
  MenuItemRadio,
  MenuLabel,
  Skeleton,
  Spinner,
  Tabs,
  UserAvatar,
} from '../ui';

/**
 * Home feed (FOUNDATION §11 step 5). Scope (All / Following, signed in only) and
 * sort (Top / New) as in the mockup's feed bar; both live in the URL so Back
 * returns to the same view. Pages load as the end of the list nears.
 */
export const SORTS: Array<{ value: FeedSort; label: string; hint: string }> = [
  { value: 'top', label: 'Top', hint: 'Most upvoted' },
  { value: 'new', label: 'New', hint: 'Most recent first' },
];

export function HomePage() {
  usePageTitle(null);
  const { viewer } = useViewer();
  const [params, setParams] = useSearchParams();
  const sort: FeedSort = params.get('sort') === 'new' ? 'new' : 'top';
  const scope: FeedScope = viewer && params.get('scope') === 'following' ? 'following' : 'all';

  const set = (key: 'sort' | 'scope', value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <h1 id="page-title" className="sr-only">
        Home
      </h1>
      <ComposerTrigger />
      <div className={viewer ? 'flex items-center justify-between gap-3 border-b border-line' : 'flex items-center justify-end gap-3'}>
        {viewer ? (
          <Tabs
            idBase="feed"
            label="Feed"
            value={scope}
            onChange={(v) => set('scope', v, 'all')}
            bordered={false}
            items={[
              { value: 'all', label: 'All' },
              { value: 'following', label: 'Following' },
            ]}
          />
        ) : null}
        <SortMenu sort={sort} onChange={(v) => set('sort', v, 'top')} />
      </div>
      <div role="tabpanel" id={`feed-panel-${scope}`} aria-labelledby={viewer ? `feed-tab-${scope}` : undefined} aria-label={viewer ? undefined : 'Feed'}>
        <Feed scope={scope} sort={sort} viewerId={viewer?.id ?? null} />
      </div>
    </section>
  );
}

function SortMenu({ sort, onChange }: { sort: FeedSort; onChange: (s: FeedSort) => void }) {
  const current = SORTS.find((s) => s.value === sort) ?? SORTS[0];
  return (
    <Menu
      align="end"
      label="Sort feed"
      trigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={`Sort feed: ${current?.label}`}
          className="inline-flex items-center gap-1 rounded-sm border-0 bg-transparent py-1 pr-1 pl-2 text-sm font-semibold text-ink-secondary hover:bg-subtle hover:text-ink aria-expanded:bg-subtle"
        >
          {current?.label}
          <Icon name="chevron-down" size={14} />
        </button>
      )}
    >
      <MenuLabel>Sort by</MenuLabel>
      {SORTS.map((s) => (
        <MenuItemRadio key={s.value} checked={s.value === sort} description={s.hint} onSelect={() => onChange(s.value)}>
          {s.label}
        </MenuItemRadio>
      ))}
    </Menu>
  );
}

/** The mockup's minimal composer bar; the full Composer arrives in step 6. */
function ComposerTrigger() {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { openComposer } = useComposer();
  return (
    <div className="rounded-md border border-line bg-card">
      <button
        type="button"
        onClick={() => {
          if (requireAuth('post feedback')) openComposer();
        }}
        className="flex w-full items-center gap-3 rounded-md border-0 bg-transparent py-2 pr-2 pl-3 text-left"
      >
        <UserAvatar src={viewer?.avatarUrl ?? null} size="md" />
        <span className="min-w-0 flex-1 truncate text-base text-ink-muted">What’s slowing you down, or what do you wish existed?</span>
        <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-brand px-4 text-sm font-semibold text-on-brand max-sm:hidden">
          Post
        </span>
      </button>
    </div>
  );
}

function Feed({ scope, sort, viewerId }: { scope: FeedScope; sort: FeedSort; viewerId: string | null }) {
  const feed = useFeed(scope, sort, viewerId);
  const { openComposer } = useComposer();
  const requireAuth = useRequireAuth();
  const posts = useMemo(() => dedupePosts(feed.data?.pages ?? []), [feed.data]);
  const sentinel = useRef<HTMLDivElement>(null);
  const canObserve = typeof window !== 'undefined' && 'IntersectionObserver' in window;
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError } = feed;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canObserve || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage && !isError) void fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canObserve, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  if (feed.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (feed.isError && posts.length === 0) {
    return (
      <div className="rounded-md border border-line bg-card">
        <EmptyState
          icon="flag"
          title="We couldn’t load the feed"
          action={
            <Button variant="secondary" onClick={() => void feed.refetch()} loading={feed.isRefetching}>
              Try again
            </Button>
          }
        >
          Check your connection, then try again.
        </EmptyState>
      </div>
    );
  }

  if (posts.length === 0) {
    return scope === 'following' ? (
      <p className="m-0 px-4 py-9 text-center text-sm text-ink-muted">
        Nothing from what you follow yet. Follow people, boards or posts and they’ll show up here.
      </p>
    ) : (
      <div className="rounded-md border border-line bg-card">
        <EmptyState
          icon="reply"
          title="No posts yet"
          action={
            <Button
              onClick={() => {
                if (requireAuth('post feedback')) openComposer();
              }}
            >
              Post feedback
            </Button>
          }
        >
          Be the first to share what’s slowing you down, or what you wish a product did.
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Posts">
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>
      {hasNextPage ? (
        <div ref={sentinel} className="flex justify-center pt-4 pb-2">
          {isFetchingNextPage ? (
            <span role="status" aria-label="Loading more posts" className="text-ink-muted">
              <Spinner />
            </span>
          ) : isError ? (
            <Button variant="secondary" size="sm" onClick={() => void fetchNextPage()}>
              Couldn’t load more. Try again
            </Button>
          ) : !canObserve ? (
            <Button variant="secondary" size="sm" onClick={() => void fetchNextPage()}>
              Show more
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="m-0 pt-2 pb-6 text-center text-sm text-ink-muted">You’re all caught up</p>
      )}
    </>
  );
}
