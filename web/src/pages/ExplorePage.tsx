import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { CATEGORIES, isLive, isProductFamily, matchCatalogue, useBoards, useHubs, useTrending, type Board, type BoardCategory, type Hub } from '../api';
import { BoardCard, CardGrid, HubRow, RowItem, RowList, Section } from '../boards/parts';
import { CategoriesSection, DiscoveryBoardsSection, HubsSection, PopularPostsSection } from '../discovery/DiscoverySections';
import { usePageTitle } from '../lib/usePageTitle';
import { useSetUrlParams, useUrlTextParam } from '../lib/useUrlParam';
import { LoadError } from '../posts/PostList';
import { AddProductLink } from '../products/AddProductDialog';
import { SearchWell } from '../shell/SearchWell';
import { Button, EmptyState, Icon, SkeletonBlock } from '../ui';

/**
 * Explore (`/explore`): signed-in discovery directory with wide layout (`EXPLORE_PAGE`).
 * Shows header + search trigger, Trending, Popular posts by status, Hubs, and the
 * 3-column Categories grid linking to dedicated `/c/:category` pages.
 */
type Cat = 'all' | BoardCategory;

export function ExplorePage() {
  usePageTitle('Explore');
  const [params] = useSearchParams();
  const [q, setQ] = useUrlTextParam('q');
  const setUrl = useSetUrlParams();
  const catParam = params.get('cat');
  const cat: Cat = (CATEGORIES.find((c) => c.value === catParam)?.value ?? 'all') as Cat;
  const boards = useBoards();
  const hubs = useHubs();

  if (cat !== 'all') {
    return <Navigate to={`/c/${cat}`} replace />;
  }

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 id="page-title" className="m-0 text-2xl font-bold text-ink">
          Explore
        </h1>
        <AddProductLink className="text-sm font-medium text-ink-muted hover:text-brand">
          + Add a missing product
        </AddProductLink>
      </div>
      <SearchWell
        className="mb-6"
        triggerClassName="h-9 border-line-strong text-md"
      />
      {q.trim() ? (
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={`Clear search “${q.trim()}”`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-pill border border-ink bg-ink px-3 text-sm font-medium text-card"
          >
            “{q.trim()}”
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}
      {boards.isPending || hubs.isPending ? (
        <ExploreSkeleton />
      ) : boards.isError || hubs.isError ? (
        <LoadError
          title="We couldn’t load the products"
          onRetry={() => {
            void boards.refetch();
            void hubs.refetch();
          }}
          retrying={boards.isRefetching || hubs.isRefetching}
        />
      ) : q.trim() ? (
        <Filtered
          q={q.trim()}
          boards={boards.data.filter(isLive)}
          hubs={hubs.data.filter((h) => isProductFamily(h.boards.length))}
          onClear={() => {
            setQ('');
            setUrl([['q', '', '']]);
          }}
        />
      ) : (
        <Discover boards={boards.data.filter(isLive)} hubs={hubs.data.filter((h) => isProductFamily(h.boards.length))} />
      )}
      {boards.isSuccess && hubs.isSuccess ? <MissingProduct q={q.trim()} /> : null}
    </section>
  );
}

function Filtered({ q, boards, hubs, onClear }: { q: string; boards: Board[]; hubs: Hub[]; onClear: () => void }) {
  const { boards: list, hubs: hubList } = useMemo(() => matchCatalogue(q, boards, hubs), [q, boards, hubs]);
  const title = 'Results';
  if (list.length === 0 && hubList.length === 0) {
    return (
      <div className="mb-6 rounded-md border border-line bg-card">
        <EmptyState
          icon="explore"
          title={`No products match “${q}”.`}
          action={
            <Button size="sm" variant="secondary" onClick={onClear}>
              Clear filters
            </Button>
          }
        >
          Try a different spelling or browse all categories.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      {hubList.length ? (
        <Section id="ex-hubs" title="Hubs">
          <RowList>
            {hubList.map((h) => (
              <RowItem key={h.id}>
                <HubRow hub={h} />
              </RowItem>
            ))}
          </RowList>
        </Section>
      ) : null}
      {list.length ? (
        <Section id="ex-results" title={title} action={`${list.length} ${list.length === 1 ? 'product' : 'products'}`}>
          <CardGrid cols={3} label={title}>
            {list.map((b) => (
              <li key={b.id} className="min-w-0">
                <BoardCard board={b} />
              </li>
            ))}
          </CardGrid>
        </Section>
      ) : null}
    </>
  );
}

function Discover({ boards, hubs }: { boards: Board[]; hubs: Hub[] }) {
  const trending = useTrending(boards, 6);
  const now = useMemo(() => new Date(), []);

  return (
    <>
      <DiscoveryBoardsSection id="ex-trending" boards={boards} trending={trending.data ?? []} now={now} showMostActiveFallback={false} />
      <PopularPostsSection id="ex-popular" />
      <HubsSection id="ex-hubs" hubs={hubs} />
      <CategoriesSection id="ex-categories" boards={boards} />
    </>
  );
}

/** Bottom of Explore: the way to add a product that isn't here yet. */
function MissingProduct({ q }: { q: string }) {
  return (
    <p className="m-0 rounded-md border border-dashed border-line-strong bg-card px-4 py-4 text-center text-base text-ink-secondary">
      Can’t find a product you use? <AddProductLink prefill={q || undefined}>Add it</AddProductLink>
    </p>
  );
}

function ExploreSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="h-3 w-1/5" />
        </div>
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="size-9 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <SkeletonBlock className="h-3 w-1/2" />
                  <SkeletonBlock className="h-3 w-3/4" />
                </div>
              </div>
              <SkeletonBlock className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <SkeletonBlock className="h-4 w-1/4" />
          <SkeletonBlock className="h-3 w-1/4" />
        </div>
        <div className="divide-y divide-line rounded-md border border-line bg-card px-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-3">
              <SkeletonBlock className="size-7 rounded-sm" />
              <div className="flex flex-1 flex-col gap-2">
                <SkeletonBlock className="h-3 w-2/5" />
                <SkeletonBlock className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
