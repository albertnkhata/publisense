import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  covered,
  dedupePosts,
  logoSrc,
  onHubDomain,
  siteDomain,
  useClaimHub,
  useHub,
  useMyRequests,
  usePostCounts,
  usePostList,
  useScopeRole,
  useVerifiedDomains,
  type Hub,
} from '../api';
import { BoardRow, ChoiceMenu, FollowScopeButton, RowItem, RowList } from '../boards/parts';
import { FollowerStat, ScopeHeader, Stat } from '../boards/ScopeHeader';
import { claimHref } from '../lib/claimLink';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { LoadError, PostList, PostListSkeleton } from '../posts/PostList';
import { useComposer } from '../shell/composer';
import { BoardAvatar, Button, EmptyState, HubAvatar, Icon, TabPanel, Tabs, useToast } from '../ui';
import { useClaim } from '../claim/ClaimDialog';
import { actionLink, ClaimExplainerLink, ClaimLink, HeaderSkeleton, RoadmapTab, ScopeNotFound, SORT_CHOICES } from './BoardPage';

/**
 * Hub page (FOUNDATION §9 `/h/:hub`): a public group of boards. Feedback from
 * every board in the hub, its Boards, and a combined Roadmap. The tab and sort
 * live in the URL (`?tab=boards`, `?sort=new`). Its team sees Manage.
 */
export type HubTab = 'feedback' | 'boards' | 'roadmap';

export function HubPage() {
  const { hub: slug } = useParams();
  const query = useHub(slug);
  const hub = query.data;
  usePageTitle(hub ? `${hub.name} hub` : query.isPending ? null : 'Hub not found');

  if (query.isPending) return <HeaderSkeleton label="Loading hub" />;
  if (query.isError) {
    return (
      <section aria-labelledby="page-title" className="flex flex-col gap-4">
        <h1 id="page-title" className="sr-only">
          Hub
        </h1>
        <LoadError title="We couldn’t load this hub" onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      </section>
    );
  }
  if (!hub) return <ScopeNotFound kind="hub" />;
  // A former slug resolves to the company it belongs to: send the reader to the current
  // address instead of showing two URLs for one page (0030).
  if (slug && hub.slug !== slug) return <Navigate to={`/h/${hub.slug}`} replace />;
  return <HubView hub={hub} />;
}

function HubView({ hub }: { hub: Hub }) {
  const navigate = useNavigate();
  const { viewer } = useViewer();
  const role = useScopeRole('hub', hub.id, viewer?.id ?? null);
  const { openComposer } = useComposer();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: HubTab = tabParam === 'boards' || tabParam === 'roadmap' ? tabParam : 'feedback';
  const ids = useMemo(() => hub.boards.map((b) => b.id), [hub.boards]);
  const counts = usePostCounts(ids);
  const first = hub.boards[0];

  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key !== 'tab' });
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-4">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? void navigate(-1) : void navigate('/'))}
          className="inline-flex items-center gap-2 border-0 bg-transparent p-0 text-sm font-medium text-ink-muted hover:text-ink"
        >
          <Icon name="arrow-left" size={14} />
          Back
        </button>
      </div>
      <ScopeHeader
        logo={<BoardAvatar name={hub.name} color={first?.color} logoSrc={logoSrc(first)} size="xl" decorative />}
        title={hub.name}
        tag={
          <span className="inline-flex items-center gap-1 rounded-sm bg-subtle px-2 text-xs font-medium text-ink-secondary">
            <Icon name="hub" size={12} />
            Hub
          </span>
        }
        description={hub.description}
        stats={
          <>
            <HubAvatar name={`${hub.name} boards`} size="xs" boards={hub.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))} max={6} />
            <Stat value={hub.boards.length} label={hub.boards.length === 1 ? 'board' : 'boards'} />
            <FollowerStat count={hub.follower_count} />
          </>
        }
        actions={
          <>
            {role.data ? (
              <Link to={`/h/${hub.slug}/manage`} className={actionLink}>
                Manage
              </Link>
            ) : null}
            <FollowScopeButton target="hub" id={hub.id} name={hub.name} boardCount={hub.boards.length} size="sm" />
            <Button size="sm" onClick={() => openComposer({ hub: hub.slug })}>
              Post feedback
            </Button>
          </>
        }
      />
      {hub.former_names.length || hub.legal_name ? (
        <p className="mt-0 mb-3 text-sm text-ink-muted">
          {hub.former_names.length ? <>Formerly {hub.former_names.join(', ')}.</> : null}
          {hub.former_names.length && hub.legal_name ? ' ' : null}
          {hub.legal_name ? <>Legal entity: {hub.legal_name}.</> : null}
        </p>
      ) : null}
      <p className="mt-0 mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
        <HubVoice hub={hub} manages={Boolean(role.data)} />
      </p>
      <Tabs
        idBase="hub"
        label={`${hub.name} hub`}
        value={tab}
        onChange={(v) => setParam('tab', v, 'feedback')}
        className="mb-4"
        items={[
          { value: 'feedback', label: 'Feedback', ...(counts.data ? { count: counts.data.posts } : {}) },
          { value: 'boards', label: 'Boards', count: hub.boards.length },
          { value: 'roadmap', label: 'Roadmap', ...(counts.data ? { count: counts.data.roadmap } : {}) },
        ]}
      />
      <TabPanel idBase="hub" value={tab}>
        {tab === 'feedback' ? (
          <HubFeedback hub={hub} ids={ids} sortParam={params.get('sort')} onSort={(v) => setParam('sort', v, 'top')} />
        ) : tab === 'boards' ? (
          <RowList label={`${hub.name} boards`}>
            {hub.boards.map((b) => (
              <RowItem key={b.id}>
                <BoardRow board={b} extra={<FollowScopeButton target="board" id={b.id} name={b.name} size="sm" />} />
              </RowItem>
            ))}
          </RowList>
        ) : (
          <RoadmapTab boardIds={ids} showBoard perColumn={8} />
        )}
      </TabPanel>
    </section>
  );
}

/** The hub header's claim line for signed-out visitors (#157). */
export const HUB_CLAIM_CTA = 'Is this your company? Claim it';

/** Mockup .hub-voice: who runs the hub, and the way in for people who work there. */
function HubVoice({ hub, manages }: { hub: Hub; manages: boolean }) {
  const { viewer } = useViewer();
  const viewerId = viewer?.id ?? null;
  const { openClaim } = useClaim();
  const { toast } = useToast();
  const verified = useVerifiedDomains(viewerId);
  const claimHub = useClaimHub();
  const mine = useMyRequests('hub', hub.id, viewerId, Boolean(hub.claimed_at) && !manages);
  if (hub.claimed_at) {
    return (
      <>
        <span className="inline-flex items-center gap-1">
          <span className="text-success">
            <Icon name="check" size={13} strokeWidth={2.2} />
          </span>
          {manages ? 'You manage this hub' : 'Verified team'}
        </span>
        {manages ? null : mine.data?.join ? (
          <span className="text-ink-muted">Request to join pending</span>
        ) : (
          <ClaimLink onClick={() => openClaim({ hub: hub.slug })}>Work here?</ClaimLink>
        )}
      </>
    );
  }
  // 0026: proof of any of the company's domains claims the hub.
  const provedDomain = hub.domains.find((d) => covered(verified.data, d)) ?? null;
  if (provedDomain) {
    return (
      <>
        <span>{provedDomain} is verified.</span>
        <ClaimLink
          onClick={() =>
            claimHub.mutate(
              { id: hub.id, name: hub.name, domain: provedDomain },
              { onSuccess: () => toast(`You manage the ${hub.name} hub now`), onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong.') },
            )
          }
        >
          Claim the {hub.name} hub
        </ClaimLink>
      </>
    );
  }
  const onDomain = hub.boards.find((b) => !b.claimed_at && onHubDomain(hub, siteDomain(b.site)));
  return (
    <>
      <span>No team has claimed this hub yet. Anyone can follow and post here.</span>
      {viewerId ? (
        <ClaimLink onClick={() => openClaim(onDomain ? { board: onDomain.slug } : { hub: hub.slug })}>Work at {hub.name}?</ClaimLink>
      ) : (
        // Signed out: explain claiming first, no sign-up wall (#157).
        <ClaimExplainerLink to={claimHref({ hub: hub.slug })}>{HUB_CLAIM_CTA}</ClaimExplainerLink>
      )}
    </>
  );
}

function HubFeedback({ hub, ids, sortParam, onSort }: { hub: Hub; ids: string[]; sortParam: string | null; onSort: (v: string) => void }) {
  const { viewer } = useViewer();
  const { openComposer } = useComposer();
  const sort = sortParam === 'new' ? 'new' : 'top';
  const list = usePostList({ boardIds: ids, sort, viewerId: viewer?.id ?? null, excludeClosed: true });
  const posts = useMemo(() => dedupePosts(list.data?.pages ?? []), [list.data]);
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-ink-muted">Posts from every {hub.name} board</span>
        <span className="ml-auto">
          <ChoiceMenu label="Sort" heading="Sort by" align="end" value={sort} choices={SORT_CHOICES} onChange={onSort} />
        </span>
      </div>
      {list.isPending ? (
        <PostListSkeleton />
      ) : list.isError && posts.length === 0 ? (
        <LoadError title="We couldn’t load this hub’s posts" onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : posts.length === 0 ? (
        <div className="rounded-md border border-line bg-card">
          <EmptyState icon="reply" title="No posts yet" action={<Button onClick={() => openComposer({ hub: hub.slug })}>Post feedback</Button>}>
            Be the first to post about a {hub.name} product.
          </EmptyState>
        </div>
      ) : (
        <PostList
          posts={posts}
          hasNextPage={Boolean(list.hasNextPage)}
          isFetchingNextPage={list.isFetchingNextPage}
          isError={list.isError}
          fetchNextPage={list.fetchNextPage}
          label={`${hub.name} posts`}
        />
      )}
    </>
  );
}
