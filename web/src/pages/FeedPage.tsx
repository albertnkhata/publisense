import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { dedupePosts, useFeed, type FeedScope, type FeedSort } from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { useSetUrlParams } from '../lib/useUrlParam';
import { useViewer } from '../lib/viewer';
import { LoadError, PostList, PostListSkeleton } from '../posts/PostList';
import { useAuthDialog, useRequireAuth } from '../shell/auth';
import { useComposer } from '../shell/composer';
import { Button, EmptyState, Icon, Menu, MenuItemRadio, MenuLabel, Tabs } from '../ui';

/**
 * Feed (`/feed`): stream of feedback across all products (`All`) or what the
 * signed-in member follows (`Following`), sorted by Top or New. Signed-out
 * visitors can browse `All` directly; switching to or landing on
 * `/feed?scope=following` shows an explicit sign-in gate (GAP-001).
 */
export const SORTS: Array<{ value: FeedSort; label: string; hint: string }> = [
  { value: 'top', label: 'Top', hint: 'Most upvoted' },
  { value: 'new', label: 'New', hint: 'Most recent first' },
];

export function FeedPage() {
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  const [params] = useSearchParams();
  const setUrl = useSetUrlParams();
  const sort: FeedSort = params.get('sort') === 'new' ? 'new' : 'top';
  const scope: FeedScope = params.get('scope') === 'following' ? 'following' : 'all';
  usePageTitle(scope === 'following' ? 'Following' : 'Feed');

  const set = (key: 'sort' | 'scope', value: string, fallback: string) => setUrl([[key, value, fallback]]);

  const isFollowingGate = !viewer && scope === 'following';

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <h1 id="page-title" className="sr-only">
        {scope === 'following' ? 'Following' : 'Feed'}
      </h1>
      <div className="flex items-center justify-between gap-3 border-b border-line">
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
        {!isFollowingGate ? <SortMenu sort={sort} onChange={(v) => set('sort', v, 'top')} /> : null}
      </div>
      <div role="tabpanel" id={`feed-panel-${scope}`} aria-labelledby={`feed-tab-${scope}`}>
        {isFollowingGate ? (
          ready ? (
            <div className="rounded-md border border-line bg-card">
              <EmptyState
                icon="users"
                title="Sign in to see what you follow"
                action={<Button onClick={() => openAuth('signin', 'see what you follow')}>Sign in</Button>}
              >
                Follow people, boards and posts to keep up with them here.
              </EmptyState>
            </div>
          ) : null
        ) : (
          <Feed scope={scope} sort={sort} viewerId={viewer?.id ?? null} />
        )}
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

function Feed({ scope, sort, viewerId }: { scope: FeedScope; sort: FeedSort; viewerId: string | null }) {
  const feed = useFeed(scope, sort, viewerId);
  const { openComposer } = useComposer();
  const requireAuth = useRequireAuth();
  const posts = useMemo(() => dedupePosts(feed.data?.pages ?? []), [feed.data]);

  if (feed.isPending) return <PostListSkeleton />;

  if (feed.isError && posts.length === 0) {
    return <LoadError title="We couldn’t load the feed" onRetry={() => void feed.refetch()} retrying={feed.isRefetching} />;
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
    <PostList
      posts={posts}
      hasNextPage={Boolean(feed.hasNextPage)}
      isFetchingNextPage={feed.isFetchingNextPage}
      isError={feed.isError}
      fetchNextPage={feed.fetchNextPage}
    />
  );
}
