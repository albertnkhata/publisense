import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  compactCount,
  dedupePosts,
  logoSrc,
  useBoard,
  useChangelog,
  useIsBoardTeam,
  usePostCounts,
  usePostList,
  useRoadmap,
  type BoardWithHub,
  type FeedSort,
  type StatusFilter,
  type TypeFilter,
} from '../api';
import { BackLink, ChoiceMenu, FollowScopeButton, type Choice } from '../boards/parts';
import { Changelog, Roadmap } from '../boards/Roadmap';
import { ScopeHeader, Stat } from '../boards/ScopeHeader';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { LoadError, PostList, PostListSkeleton } from '../posts/PostList';
import { useComposer } from '../shell/composer';
import { BoardAvatar, Button, EmptyState, Icon, Skeleton, SkeletonBlock, TabPanel, Tabs } from '../ui';

/**
 * Board page (FOUNDATION §9 `/b/:board`): header, then Feedback (filters by
 * type and status, Top / New), Roadmap and Changelog tabs. The tab and the
 * filters live in the URL (`?tab=roadmap`, `?type=bug&status=planned&sort=new`)
 * so Back and shared links return to the same view.
 */
export type BoardTab = 'feedback' | 'roadmap' | 'changelog';

export const TYPE_CHOICES: Choice<TypeFilter>[] = [
  { value: 'all', label: 'All types' },
  { value: 'bug', label: 'Bugs' },
  { value: 'feature', label: 'Feature requests' },
];

export const STATUS_CHOICES: Choice<StatusFilter>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under review' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'shipped', label: 'Shipped' },
];

export const SORT_CHOICES: Choice<FeedSort>[] = [
  { value: 'top', label: 'Top', hint: 'Most upvoted' },
  { value: 'new', label: 'New', hint: 'Most recent first' },
];

const pick = <T extends string>(v: string | null, choices: Choice<T>[], fallback: T): T =>
  (choices.find((c) => c.value === v)?.value ?? fallback) as T;

export const actionLink =
  'inline-flex h-7 items-center justify-center rounded-md border border-line-strong bg-card px-3 text-sm font-semibold text-ink no-underline transition-colors duration-120 hover:bg-subtle';

export function BoardPage() {
  const { board: slug } = useParams();
  const query = useBoard(slug);
  const board = query.data;
  usePageTitle(board ? board.name : query.isPending ? null : 'Board not found');

  if (query.isPending) return <HeaderSkeleton label="Loading board" />;
  if (query.isError) {
    return (
      <section aria-labelledby="page-title" className="flex flex-col gap-4">
        <h1 id="page-title" className="sr-only">
          Board
        </h1>
        <LoadError title="We couldn’t load this board" onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      </section>
    );
  }
  if (!board) return <ScopeNotFound kind="board" />;
  return <Board board={board} />;
}

function Board({ board }: { board: BoardWithHub }) {
  const { viewer } = useViewer();
  const { openComposer } = useComposer();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: BoardTab = tabParam === 'roadmap' || tabParam === 'changelog' ? tabParam : 'feedback';
  const ids = useMemo(() => [board.id], [board.id]);
  const counts = usePostCounts(ids);
  const team = useIsBoardTeam(board.id, viewer?.id ?? null);

  /** Set URL params; a value equal to its default is removed. Tab changes add a history entry. */
  const update = (changes: Array<[key: string, value: string, fallback: string]>) => {
    const next = new URLSearchParams(params);
    for (const [key, value, fallback] of changes) {
      if (value === fallback) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: !changes.some(([k]) => k === 'tab') });
  };
  const setParam = (key: string, value: string, fallback: string) => update([[key, value, fallback]]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-4">
        <BackLink to="/">Home</BackLink>
      </div>
      <ScopeHeader
        logo={<BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="xl" decorative />}
        title={board.name}
        description={
          <>
            {board.tagline}
            {board.site ? `${board.tagline ? ' · ' : ''}${board.site}` : ''}
          </>
        }
        stats={
          <>
            <Stat value={board.post_count} label={board.post_count === 1 ? 'post' : 'posts'} />
            <Stat value={compactCount(board.follower_count)} label={board.follower_count === 1 ? 'follower' : 'followers'} />
            {board.hub ? (
              <Link
                to={`/h/${board.hub.slug}`}
                title={`All ${board.hub.name} boards`}
                className="inline-flex items-center gap-1 text-ink-secondary no-underline hover:text-ink hover:underline hover:underline-offset-2"
              >
                <Icon name="hub" size={12} />
                {board.hub.name} hub
              </Link>
            ) : null}
            {board.claimed_at ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-success">
                  <Icon name="check" size={13} strokeWidth={2.2} />
                </span>
                {team.data ? 'You manage this board' : 'Verified team'}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            {team.data ? (
              <Link to={`/b/${board.slug}/manage`} className={actionLink}>
                Manage
              </Link>
            ) : null}
            <FollowScopeButton target="board" id={board.id} name={board.name} size="sm" />
            <Button size="sm" onClick={() => openComposer({ board: board.slug })}>
              Post feedback
            </Button>
          </>
        }
      />
      <Tabs
        idBase="board"
        label={`${board.name} board`}
        value={tab}
        onChange={(v) => setParam('tab', v, 'feedback')}
        className="mb-4"
        items={[
          { value: 'feedback', label: 'Feedback', ...(counts.data ? { count: counts.data.posts } : {}) },
          { value: 'roadmap', label: 'Roadmap', ...(counts.data ? { count: counts.data.roadmap } : {}) },
          { value: 'changelog', label: 'Changelog' },
        ]}
      />
      <TabPanel idBase="board" value={tab}>
        {tab === 'feedback' ? (
          <Feedback board={board} params={params} setParam={setParam} clear={() => update([['type', 'all', 'all'], ['status', 'all', 'all']])} />
        ) : tab === 'roadmap' ? (
          <RoadmapTab boardIds={ids} />
        ) : (
          <ChangelogTab boardIds={ids} />
        )}
      </TabPanel>
    </section>
  );
}

function Feedback({
  board,
  params,
  setParam,
  clear,
}: {
  board: BoardWithHub;
  params: URLSearchParams;
  setParam: (key: string, value: string, fallback: string) => void;
  clear: () => void;
}) {
  const { viewer } = useViewer();
  const { openComposer } = useComposer();
  const type = pick(params.get('type'), TYPE_CHOICES, 'all');
  const status = pick(params.get('status'), STATUS_CHOICES, 'all');
  const sort = pick(params.get('sort'), SORT_CHOICES, 'top');
  const list = usePostList({ boardIds: [board.id], type, status, sort, viewerId: viewer?.id ?? null });
  const posts = useMemo(() => dedupePosts(list.data?.pages ?? []), [list.data]);
  const filtered = type !== 'all' || status !== 'all';

  return (
    <>
      <div className="mb-4 flex items-center gap-1">
        <ChoiceMenu label="Type" value={type} choices={TYPE_CHOICES} onChange={(v) => setParam('type', v, 'all')} set={type !== 'all'} />
        <ChoiceMenu label="Status" value={status} choices={STATUS_CHOICES} onChange={(v) => setParam('status', v, 'all')} set={status !== 'all'} />
        {filtered ? (
          <button
            type="button"
            onClick={clear}
            className="rounded-sm border-0 bg-transparent px-2 py-1 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Clear
          </button>
        ) : null}
        <span className="ml-auto">
          <ChoiceMenu label="Sort" heading="Sort by" align="end" value={sort} choices={SORT_CHOICES} onChange={(v) => setParam('sort', v, 'top')} />
        </span>
      </div>
      {list.isPending ? (
        <PostListSkeleton />
      ) : list.isError && posts.length === 0 ? (
        <LoadError title="We couldn’t load this board’s posts" onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : posts.length === 0 ? (
        filtered ? (
          <p className="m-0 px-3 py-9 text-center text-base text-ink-muted">No posts match these filters.</p>
        ) : (
          <div className="rounded-md border border-line bg-card">
            <EmptyState icon="reply" title="No posts yet" action={<Button onClick={() => openComposer({ board: board.slug })}>Post feedback</Button>}>
              Be the first to tell the {board.name} team what’s slowing you down, or what you wish it did.
            </EmptyState>
          </div>
        )
      ) : (
        <PostList
          posts={posts}
          hasNextPage={Boolean(list.hasNextPage)}
          isFetchingNextPage={list.isFetchingNextPage}
          isError={list.isError}
          fetchNextPage={list.fetchNextPage}
          label={`${board.name} posts`}
          hideBoard
        />
      )}
    </>
  );
}

export function RoadmapTab({ boardIds, showBoard = false, perColumn }: { boardIds: string[]; showBoard?: boolean; perColumn?: number }) {
  const roadmap = useRoadmap(boardIds);
  if (roadmap.isPending) return <ColumnsSkeleton />;
  if (roadmap.isError) return <LoadError title="We couldn’t load the roadmap" onRetry={() => void roadmap.refetch()} retrying={roadmap.isRefetching} />;
  return <Roadmap data={roadmap.data} showBoard={showBoard} {...(perColumn ? { perColumn } : {})} />;
}

function ChangelogTab({ boardIds }: { boardIds: string[] }) {
  const changelog = useChangelog(boardIds);
  if (changelog.isPending) return <PostListSkeleton count={2} />;
  if (changelog.isError) {
    return <LoadError title="We couldn’t load the changelog" onRetry={() => void changelog.refetch()} retrying={changelog.isRefetching} />;
  }
  if (changelog.data.length === 0) {
    return (
      <div className="rounded-md border border-line bg-card">
        <EmptyState icon="check-circle" title="Nothing shipped yet">
          When the team marks a request Shipped, it shows up here.
        </EmptyState>
      </div>
    );
  }
  return <Changelog entries={changelog.data} />;
}

function ColumnsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-md border border-line bg-card p-3">
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="h-6 w-full" />
          <SkeletonBlock className="h-6 w-full" />
        </div>
      ))}
    </div>
  );
}

export function HeaderSkeleton({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="flex flex-col gap-4">
      <h1 id="page-title" className="sr-only">
        {label}
      </h1>
      <Skeleton variant="header" />
      <PostListSkeleton count={2} />
    </section>
  );
}

export function ScopeNotFound({ kind }: { kind: 'board' | 'hub' }) {
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <BackLink to="/">Home</BackLink>
      <div className="rounded-md border border-line bg-card">
        <h1 id="page-title" className="sr-only">
          {kind === 'board' ? 'Board not found' : 'Hub not found'}
        </h1>
        <EmptyState
          icon="search"
          title={kind === 'board' ? 'Board not found' : 'Hub not found'}
          action={
            <Link to="/explore" className={actionLink}>
              Explore boards
            </Link>
          }
        >
          The link may be wrong, or the {kind} was renamed.
        </EmptyState>
      </div>
    </section>
  );
}
