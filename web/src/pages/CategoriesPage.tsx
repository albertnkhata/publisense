import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { CATEGORIES, plural, summarizeCategories, useBoards, type BoardCategory, type CategorySummary } from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { LoadError } from '../posts/PostList';
import { AddProductLink } from '../products/AddProductDialog';
import { SkeletonBlock } from '../ui';

const ALL_CATEGORIES = CATEGORIES.filter((c): c is { value: BoardCategory; label: string } => c.value !== 'all');

/**
 * Categories directory (`/categories`): dedicated view opened from the
 * "All categories →" link above Categories on Landing and Explore. Lists every
 * category in canonical order in a 3-column grid linking to `/c/:category`.
 */
export function CategoriesPage() {
  usePageTitle('Categories');
  const boards = useBoards();

  useEffect(() => {
    if (typeof window !== 'undefined' && !navigator.userAgent.includes('jsdom')) {
      window.scrollTo(0, 0);
    }
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<BoardCategory, CategorySummary>();
    for (const summary of summarizeCategories(boards.data ?? [])) {
      map.set(summary.category, summary);
    }
    return map;
  }, [boards.data]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 id="page-title" className="m-0 text-2xl font-bold text-ink">
          Categories
        </h1>
        <span className="font-mono text-sm text-ink-muted tabular-nums">
          {plural(ALL_CATEGORIES.length, 'category', 'categories')}
        </span>
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
      ) : (
        <div className="mb-6">
          <ul aria-label="Categories" className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {ALL_CATEGORIES.map((c) => {
              const summary = byCategory.get(c.value);
              return (
                <li key={c.value} className="min-w-0">
                  <Link
                    to={`/c/${c.value}`}
                    className="flex h-full flex-col gap-1 rounded-md border border-line bg-card p-4 text-ink no-underline transition-colors duration-120 hover:border-line-strong"
                  >
                    <span className="text-base font-semibold text-ink">{c.label}</span>
                    <span className="truncate text-sm text-ink-muted">
                      {summary ? summary.examples.join(', ') : 'No products yet'}
                    </span>
                  </Link>
                </li>
              );
            })}
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
