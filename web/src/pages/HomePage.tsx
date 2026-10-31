import { useMemo } from 'react';
import pitchGradient from '../assets/pitch-gradient.webp';
import { useSearchParams } from 'react-router';
import { dedupePosts, useFeed, type FeedScope, type FeedSort } from '../api';
import { useClaim } from '../claim/ClaimDialog';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { LoadError, PostList, PostListSkeleton } from '../posts/PostList';
import { useAuthDialog, useRequireAuth } from '../shell/auth';
import { useComposer } from '../shell/composer';
import { Button, Card, EmptyState, Icon, Menu, MenuItemRadio, MenuLabel, Tabs } from '../ui';
import { useSetUrlParams } from '../lib/useUrlParam';

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
  const [params] = useSearchParams();
  const setUrl = useSetUrlParams();
  const sort: FeedSort = params.get('sort') === 'new' ? 'new' : 'top';
  const scope: FeedScope = viewer && params.get('scope') === 'following' ? 'following' : 'all';

  const set = (key: 'sort' | 'scope', value: string, fallback: string) => setUrl([[key, value, fallback]]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <h1 id="page-title" className="sr-only">
        Home
      </h1>
      {viewer ? null : <HomePitch />}
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

/** Pitch copy for signed-out visitors, kept here so tests and docs quote one source. */
export const PITCH = {
  title: 'Make your voice heard',
  body: 'Feedback on products, ranked by the people who use them.',
  join: 'Join Publisense',
  claim: 'Claim your board',
  claimReason: 'claim your product’s board',
};

/**
 * Signed-out pitch above the composer, after Substack's signed-out home: the
 * visitor lands in the real feed with one card saying what this is. Not
 * dismissible; signed-in viewers never see it. The secondary action opens the
 * claim dialog so visitors can pick their product and read how verification
 * works before signing up.
 *
 * The card sits on a decorative gradient image under a dark scrim and uses the
 * theme-independent on-image tokens, so it reads the same (light text on a
 * dark card) in both themes. It deliberately does not set data-theme: dialogs
 * inherit the opener's theme scope, and sign-up should follow the page. The
 * secondary action is a translucent outline button made for the image.
 */
function HomePitch() {
  const { openAuth } = useAuthDialog();
  const { openClaim } = useClaim();
  return (
    <Card
      as="section"
      padding="none"
      aria-labelledby="home-pitch-title"
      className="relative isolate overflow-hidden px-5 py-6 text-center max-md:px-4 max-md:py-5"
    >
      <img src={pitchGradient} alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-b from-scrim/40 to-scrim" />
      <div className="flex flex-col items-center gap-4 max-md:gap-3">
        <div className="flex flex-col items-center gap-1">
          <h2 id="home-pitch-title" className="m-0 text-xl font-bold text-balance text-on-image max-md:text-lg">
            {PITCH.title}
          </h2>
          <p className="m-0 text-base text-balance text-on-image-muted">{PITCH.body}</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" onClick={() => openAuth('signup')}>
            {PITCH.join}
          </Button>
          <button
            type="button"
            onClick={() => openClaim()}
            className="inline-flex h-7 items-center justify-center rounded-md border border-on-image-line bg-on-image/10 px-3 text-sm font-semibold whitespace-nowrap text-on-image backdrop-blur-md transition-colors duration-120 ease-out select-none hover:bg-on-image/20"
          >
            {PITCH.claim}
          </button>
        </div>
      </div>
    </Card>
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

/**
 * The collapsed composer: a field, not a card — one rule, one line, one quiet action.
 * It shares the feed's grid (PostCard: px-5, then a pl-gutter column): the plus
 * hangs in the gutter where avatars sit, and the prompt and its rule span exactly
 * the post content's width, so the rule reads as the field's underline.
 */
function ComposerTrigger() {
  const requireAuth = useRequireAuth();
  const { openComposer } = useComposer();
  return (
    <button
      type="button"
      onClick={() => {
        if (requireAuth('post feedback')) openComposer();
      }}
      className="group flex w-full cursor-pointer items-center border-0 bg-transparent px-5 text-left max-sm:px-4"
    >
      <span className="flex w-gutter shrink-0 items-center">
        <span className="flex size-6 items-center justify-center rounded-pill border border-line-strong text-ink-muted transition-colors duration-120 group-hover:border-ink-muted group-hover:text-ink-secondary">
          <Icon name="plus" size={11} strokeWidth={2} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3 border-b border-line-strong py-2">
        <span className="min-w-0 flex-1 truncate text-base text-ink-muted transition-colors duration-120 group-hover:text-ink-secondary">
          Share feedback on a product
        </span>
        {/* Looks like the primary sm Button, but is a span: the whole row is already
            the button, and a button can't nest inside another. Kept at every width:
            the old filled button was hidden under 640px, which left phones with no action. */}
        <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-md bg-brand px-3 text-sm font-semibold whitespace-nowrap text-on-brand transition-colors duration-120 ease-out group-hover:bg-brand-hover">
          Post
        </span>
      </span>
    </button>
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
