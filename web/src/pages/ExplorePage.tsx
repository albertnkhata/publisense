import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CATEGORIES, isLive, isProductFamily, matchCatalogue, useBoards, useHubs, useTrending, type Board, type BoardCategory, type Hub } from '../api';
import { BoardCard, CardGrid, HubRow, RowItem, RowList, Section } from '../boards/parts';
import { CategoriesSection, DiscoveryBoardsSection, HubsSection, PopularPostsSection } from '../discovery/DiscoverySections';
import { cx } from '../lib/cx';
import { usePageTitle } from '../lib/usePageTitle';
import { useSetUrlParams, useUrlTextParam } from '../lib/useUrlParam';
import { LoadError } from '../posts/PostList';
import { AddProductLink } from '../products/AddProductDialog';
import { SearchWell } from '../shell/SearchWell';
import { Button, EmptyState, Icon, ScrollRow, SkeletonBlock } from '../ui';

/**
 * Explore (`/explore`): signed-in discovery directory with wide layout (`EXPLORE_PAGE`).
 * Shows header + search trigger, category chips, Trending, Popular posts by status,
 * Hubs, and the 3-column Categories summary (plus filter mode for `?q=` / `?cat=`).
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
  // Only chips with something behind them: categories with a live board, plus the
  // one in the URL. All of them while the boards are still loading.
  const used = boards.data ? new Set(boards.data.filter(isLive).map((b) => b.category)) : null;
  const chips = CATEGORIES.filter((c) => c.value === 'all' || c.value === cat || !used || used.has(c.value));

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
        className="mb-4"
        placeholder="Search products, hubs, or posts…"
        triggerClassName="h-9 border-line-strong text-md"
      />
      <ScrollRow label="Categories" className="mb-6">
        {q.trim() ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={`Clear search “${q.trim()}”`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-pill border border-ink bg-ink px-3 text-sm font-medium text-card"
          >
            “{q.trim()}”
            <Icon name="close" size={14} />
          </button>
        ) : null}
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={cat === c.value}
            onClick={() => setUrl([['cat', c.value, 'all']])}
            className={cx(
              'h-7 shrink-0 rounded-pill border px-3 text-sm font-medium transition-colors duration-120',
              cat === c.value ? 'border-ink bg-ink text-card' : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
            )}
          >
            {c.label}
          </button>
        ))}
      </ScrollRow>
      {boards.isPending || hubs.isPending ? (
        <ExploreSkeleton />
      ) : boards.isError || hubs.isError ? (
        <LoadError
          title="We couldn’t load the boards"
          onRetry={() => {
            void boards.refetch();
            void hubs.refetch();
          }}
          retrying={boards.isRefetching || hubs.isRefetching}
        />
      ) : q.trim() || cat !== 'all' ? (
        <Filtered
          q={q.trim()}
          cat={cat}
          boards={boards.data.filter(isLive)}
          hubs={hubs.data.filter((h) => isProductFamily(h.boards.length))}
          onClear={() => {
            setQ('');
            setUrl([['q', '', ''], ['cat', 'all', 'all']]);
          }}
        />
      ) : (
        <Discover boards={boards.data.filter(isLive)} hubs={hubs.data.filter((h) => isProductFamily(h.boards.length))} />
      )}
      {boards.isSuccess && hubs.isSuccess ? <MissingProduct q={q.trim()} /> : null}
    </section>
  );
}

function Filtered({ q, cat, boards, hubs, onClear }: { q: string; cat: Cat; boards: Board[]; hubs: Hub[]; onClear: () => void }) {
  const { list, hubList } = useMemo(() => {
    const inCat = (b: Board) => cat === 'all' || b.category === cat;
    const matched = q ? matchCatalogue(q, boards, hubs) : { boards, hubs: [] as typeof hubs };
    return {
      list: matched.boards.filter(inCat),
      hubList: q ? matched.hubs.filter((h) => cat === 'all' || h.boards.some(inCat)) : hubs.filter((h) => h.boards.some(inCat)),
    };
  }, [q, cat, boards, hubs]);
  const title = q ? 'Results' : (CATEGORIES.find((c) => c.value === cat)?.label ?? 'Results');
  if (list.length === 0 && hubList.length === 0) {
    return (
      <div className="mb-6 rounded-md border border-line bg-card">
        <EmptyState
          icon="explore"
          title={q ? `No products match “${q}”.` : 'No products in this category yet.'}
          action={
            <Button size="sm" variant="secondary" onClick={onClear}>
              {q ? 'Clear filters' : 'Show all products'}
            </Button>
          }
        >
          {q ? 'Try a different spelling or browse all categories.' : 'Browse another category or add the product you use below.'}
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
