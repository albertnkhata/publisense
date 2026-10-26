import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CATEGORIES, isLive, matchCatalogue, useBoards, useHubs, useTrending, useWanted, type Board, type BoardCategory, type Hub } from '../api';
import { BoardCard, CardGrid, HubRow, PostRow, RowItem, RowList, Section } from '../boards/parts';
import { cx } from '../lib/cx';
import { usePageTitle } from '../lib/usePageTitle';
import { LoadError } from '../posts/PostList';
import { AddProductLink } from '../products/AddProductDialog';
import { Icon, ScrollRow, SkeletonBlock } from '../ui';

/**
 * Explore (FOUNDATION §9 `/explore`): find products and follow their boards.
 * With no query or category: Trending this week, Hubs, Most wanted, Fresh bugs,
 * New on Publisense and All products (sections with nothing to show are left
 * out; Trending needs a board with new posts this week, and Most wanted reads
 * "Latest requests" until something has an upvote, #156). Typing or picking a category filters boards and hubs instead. Both live
 * in the URL (`?q=`, `?cat=`).
 */
type Cat = 'all' | BoardCategory;

export function ExplorePage() {
  usePageTitle('Explore');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const catParam = params.get('cat');
  const cat: Cat = (CATEGORIES.find((c) => c.value === catParam)?.value ?? 'all') as Cat;
  const boards = useBoards();
  const hubs = useHubs();
  // Only chips with something behind them: categories with a live board, plus the
  // one in the URL. All of them while the boards are still loading.
  const used = boards.data ? new Set(boards.data.filter(isLive).map((b) => b.category)) : null;
  const chips = CATEGORIES.filter((c) => c.value === 'all' || c.value === cat || !used || used.has(c.value));

  const set = (key: 'q' | 'cat', value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <header>
        <h1 id="page-title" className="mt-0 mb-1 text-xl font-bold text-ink">
          Explore
        </h1>
        <p className="mt-0 mb-4 text-base text-ink-secondary">Find the products you use and follow their boards.</p>
      </header>
      <label className="flex h-9 items-center gap-3 rounded-lg border border-line-strong bg-card px-4 text-ink-muted transition-colors duration-120 focus-within:border-brand">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={q}
          onChange={(e) => set('q', e.target.value, '')}
          placeholder="Search products"
          aria-label="Search products"
          autoComplete="off"
          className="w-full min-w-0 appearance-none border-0 bg-transparent text-md text-ink outline-none focus-visible:outline-none"
        />
      </label>
      <ScrollRow label="Categories" className="mt-2 mb-6">
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={cat === c.value}
            onClick={() => set('cat', c.value, 'all')}
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
        <Filtered q={q.trim()} cat={cat} boards={boards.data.filter(isLive)} hubs={hubs.data} />
      ) : (
        <Discover boards={boards.data.filter(isLive)} hubs={hubs.data} />
      )}
      {boards.isSuccess && hubs.isSuccess ? <MissingProduct q={q.trim()} /> : null}
    </section>
  );
}

function Filtered({ q, cat, boards, hubs }: { q: string; cat: Cat; boards: Board[]; hubs: Hub[] }) {
  const inCat = (b: Board) => cat === 'all' || b.category === cat;
  const matched = q ? matchCatalogue(q, boards, hubs) : { boards, hubs: [] as typeof hubs };
  const list = matched.boards.filter(inCat);
  const hubList = q ? matched.hubs.filter((h) => cat === 'all' || h.boards.some(inCat)) : hubs.filter((h) => h.boards.some(inCat));
  const title = q ? 'Results' : (CATEGORIES.find((c) => c.value === cat)?.label ?? 'Results');
  if (list.length === 0 && hubList.length === 0) {
    return <p className="m-0 px-3 py-9 text-center text-base text-ink-muted">{q ? `No products match “${q}”.` : 'No products in this category yet.'}</p>;
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
        <Section id="ex-results" title={title} note={`${list.length} ${list.length === 1 ? 'product' : 'products'}`}>
          <CardGrid label={title}>
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
  const trending = useTrending(boards, 4);
  const wanted = useWanted();
  const now = useMemo(() => new Date(), []);
  const mostWanted = (wanted.data ?? []).slice(0, 5);
  const freshBugs = (wanted.data ?? [])
    .filter((p) => p.type === 'bug')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3);
  const fresh = boards
    .filter((b) => now.getTime() - new Date(b.created_at).getTime() <= 30 * 86400_000)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4);
  const all = [...boards].sort((a, b) => a.name.localeCompare(b.name));
  // Requests rank by upvotes, then newest. With no upvotes yet that is just
  // newest, so the label says so (#156).
  const anyVotes = mostWanted.some((p) => p.vote_count > 0);
  const wantedTitle = anyVotes ? 'Most wanted' : 'Latest requests';

  return (
    <>
      {trending.data && trending.data.length ? (
        <Section id="ex-trending" title="Trending this week" note="Most new posts this week">
          <CardGrid label="Trending this week">
            {trending.data.map((b) => (
              <li key={b.id} className="min-w-0">
                <BoardCard board={b} now={now} />
              </li>
            ))}
          </CardGrid>
        </Section>
      ) : null}
      {hubs.length ? (
        <Section id="ex-hubs" title="Hubs" note="Product families in one place">
          <RowList label="Hubs">
            {hubs.map((h) => (
              <RowItem key={h.id}>
                <HubRow hub={h} />
              </RowItem>
            ))}
          </RowList>
        </Section>
      ) : null}
      {mostWanted.length ? (
        <Section id="ex-wanted" title={wantedTitle} note={anyVotes ? 'Top requests across all boards' : 'Newest across all boards'}>
          <RowList label={wantedTitle}>
            {mostWanted.map((p) => (
              <RowItem key={p.id}>
                <PostRow post={p} />
              </RowItem>
            ))}
          </RowList>
        </Section>
      ) : null}
      {freshBugs.length ? (
        <Section id="ex-bugs" title="Fresh bugs" note={freshBugs.some((p) => p.vote_count > 0) ? 'Newly reported problems people are upvoting' : 'Newly reported problems'}>
          <RowList label="Fresh bugs">
            {freshBugs.map((p) => (
              <RowItem key={p.id}>
                <PostRow post={p} />
              </RowItem>
            ))}
          </RowList>
        </Section>
      ) : null}
      {fresh.length ? (
        <Section id="ex-new" title="New on Publisense" note="Boards added recently">
          <CardGrid label="New on Publisense">
            {fresh.map((b) => (
              <li key={b.id} className="min-w-0">
                <BoardCard board={b} now={now} />
              </li>
            ))}
          </CardGrid>
        </Section>
      ) : null}
      <Section id="ex-all" title="All products" note={String(all.length)}>
        <CardGrid label="All products">
          {all.map((b) => (
            <li key={b.id} className="min-w-0">
              <BoardCard board={b} now={now} />
            </li>
          ))}
        </CardGrid>
      </Section>
    </>
  );
}

/** Bottom of the boards list: the way to add a product that isn't here yet. */
function MissingProduct({ q }: { q: string }) {
  return (
    <p className="m-0 rounded-md border border-dashed border-line-strong px-4 py-4 text-center text-base text-ink-secondary">
      Can’t find a product you use? <AddProductLink prefill={q || undefined}>Add it</AddProductLink>
    </p>
  );
}

function ExploreSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
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
  );
}
