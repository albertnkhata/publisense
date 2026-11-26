import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { plural, summarizeCategories, useBoards } from '../api';
import { CATEGORY_ICON } from '../boards/categoryIcon';
import { usePageTitle } from '../lib/usePageTitle';
import { LoadError } from '../posts/PostList';
import { AddProductLink } from '../products/AddProductDialog';
import { Icon, SkeletonBlock } from '../ui';

/**
 * Categories directory (`/categories`): dedicated view opened from the
 * "All categories →" link above Categories on Landing and Home, or the
 * Categories link in NavRail. Lists populated categories in canonical order
 * in a 3-column grid linking to `/c/:category`.
 */
export function CategoriesPage() {
  usePageTitle('Categories');
  const boards = useBoards();

  useEffect(() => {
    if (typeof window !== 'undefined' && !navigator.userAgent.includes('jsdom')) {
      window.scrollTo(0, 0);
    }
  }, []);

  const categories = useMemo(() => summarizeCategories(boards.data ?? []), [boards.data]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 id="page-title" className="m-0 text-2xl font-bold text-ink">
          Categories
        </h1>
        {boards.isSuccess && categories.length > 0 ? (
          <span className="font-mono text-sm text-ink-muted tabular-nums">
            {plural(categories.length, 'category', 'categories')}
          </span>
        ) : null}
      </div>

      {boards.isPending ? (
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : boards.isError ? (
        <LoadError
          title="We couldn’t load categories"
          onRetry={() => void boards.refetch()}
          retrying={boards.isRefetching}
        />
      ) : categories.length === 0 ? (
        <p className="mb-6 rounded-md border border-dashed border-line-strong bg-card px-4 py-6 text-center text-sm text-ink-muted">
          No categories with products yet.
        </p>
      ) : (
        <div className="mb-6">
          <ul aria-label="Categories" className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {categories.map((c) => (
              <li key={c.category} className="min-w-0">
                <Link
                  to={`/c/${c.category}`}
                  className="flex h-full flex-col gap-1 rounded-md border border-line bg-card p-4 text-ink no-underline transition-colors duration-120 hover:border-line-strong hover:bg-subtle/35"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-ink">
                    <Icon name={CATEGORY_ICON[c.category]} size={16} strokeWidth={1.75} className="shrink-0 text-ink-muted" />
                    <span className="truncate">{c.label}</span>
                  </span>
                  <span className="truncate text-sm text-ink-muted">{c.examples.join(', ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {boards.isSuccess ? (
        <p className="m-0 rounded-md border border-dashed border-line-strong bg-card px-4 py-4 text-center text-base text-ink-secondary">
          Can’t find a product you use? <AddProductLink>Add it</AddProductLink>
        </p>
      ) : null}
    </section>
  );
}
