import { useEffect, useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { CATEGORIES, isLive, isProductFamily, plural, useBoards, useHubs, type Board, type BoardCategory } from '../api';
import { BoardCard, CardGrid, HubRow, RowItem, RowList, Section } from '../boards/parts';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { LoadError } from '../posts/PostList';
import { AddProductLink } from '../products/AddProductDialog';
import { EmptyState, SkeletonBlock } from '../ui';

/**
 * Category page (`/c/:category`): dedicated view opened from Categories at the
 * bottom of Landing and Explore. Uses `EXPLORE_PAGE` wide layout so all products
 * in the category sit in a 3-column grid.
 */
export function CategoryPage() {
  const { category } = useParams();
  const { viewer } = useViewer();
  const backTo = viewer ? '/explore' : '/';
  const fallbackLabel = viewer ? 'Explore' : 'Home';

  useEffect(() => {
    if (typeof window !== 'undefined' && !navigator.userAgent.includes('jsdom')) {
      window.scrollTo(0, 0);
    }
  }, [category]);

  if (category === 'all') return <Navigate to="/explore" replace />;

  const meta = CATEGORIES.find((c): c is { value: BoardCategory; label: string } => c.value !== 'all' && c.value === category);
  usePageTitle(meta ? meta.label : 'Category not found');

  const boards = useBoards();
  const hubs = useHubs();

  const { list, hubList } = useMemo(() => {
    if (!meta) return { list: [], hubList: [] };
    const inCat = (b: Pick<Board, 'category' | 'status'>) => isLive(b) && b.category === meta.value;
    const filteredBoards = (boards.data ?? [])
      .filter(inCat)
      .slice()
      .sort((a, b) => b.follower_count - a.follower_count || b.post_count - a.post_count || a.name.localeCompare(b.name));
    const filteredHubs = (hubs.data ?? [])
      .filter((h) => isProductFamily(h.boards.length) && h.boards.some(inCat));
    return { list: filteredBoards, hubList: filteredHubs };
  }, [meta, boards.data, hubs.data]);

  const backAction = (
    <Link
      to={backTo}
      className="inline-flex h-7 items-center justify-center rounded-md border border-line-strong bg-card px-3 text-sm font-semibold text-ink no-underline transition-colors duration-120 hover:bg-subtle"
    >
      Back to {fallbackLabel}
    </Link>
  );

  if (!meta) {
    return (
      <section aria-labelledby="page-title" className="flex flex-col">
        <h1 id="page-title" className="sr-only">
          Category not found
        </h1>
        <div className="rounded-md border border-line bg-card">
          <EmptyState icon="explore" title="Category not found" action={backAction}>
            Choose a category from Explore to browse products.
          </EmptyState>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 id="page-title" className="m-0 text-2xl font-bold text-ink">
            {meta.label}
          </h1>
          {boards.isSuccess && hubs.isSuccess ? (
            <span className="font-mono text-sm text-ink-muted tabular-nums">{plural(list.length, 'product')}</span>
          ) : null}
        </div>
        <AddProductLink className="text-sm font-medium text-ink-muted hover:text-brand">
          + Add a missing product
        </AddProductLink>
      </div>

      {boards.isPending || hubs.isPending ? (
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1" aria-busy="true">
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
      ) : boards.isError || hubs.isError ? (
        <LoadError
          title="We couldn’t load this category"
          onRetry={() => {
            void boards.refetch();
            void hubs.refetch();
          }}
          retrying={boards.isRefetching || hubs.isRefetching}
        />
      ) : list.length === 0 && hubList.length === 0 ? (
        <div className="mb-6 rounded-md border border-line bg-card">
          <EmptyState icon="explore" title="No products in this category yet." action={backAction}>
            Browse another category or add the product you use below.
          </EmptyState>
        </div>
      ) : (
        <>
          {hubList.length ? (
            <Section id="cat-hubs" title="Hubs">
              <RowList label={`${meta.label} hubs`}>
                {hubList.map((h) => (
                  <RowItem key={h.id}>
                    <HubRow hub={h} />
                  </RowItem>
                ))}
              </RowList>
            </Section>
          ) : null}
          {list.length ? (
            <div className="mb-6">
              <CardGrid cols={3} label={meta.label}>
                {list.map((b) => (
                  <li key={b.id} className="min-w-0">
                    <BoardCard board={b} />
                  </li>
                ))}
              </CardGrid>
            </div>
          ) : null}
        </>
      )}

      {boards.isSuccess && hubs.isSuccess ? (
        <p className="m-0 rounded-md border border-dashed border-line-strong bg-card px-4 py-4 text-center text-base text-ink-secondary">
          Can’t find a product you use? <AddProductLink>Add it</AddProductLink>
        </p>
      ) : null}
    </section>
  );
}
