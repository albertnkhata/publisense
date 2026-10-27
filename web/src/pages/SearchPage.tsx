import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Link } from 'react-router';
import { avatarSrc, clearRecentSearches, readRecentSearches, rememberSearch, SEARCH_MIN, usePeopleSearch, useSearch } from '../api';
import { BoardRow, HubRow, RowItem, RowList, rowLink } from '../boards/parts';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { PostCard } from '../posts/PostCard';
import { LoadError, PostListSkeleton } from '../posts/PostList';
import { useComposer } from '../shell/composer';
import { AddProductLink } from '../products/AddProductDialog';
import { Button, Icon, IconButton, TabPanel, Tabs, UserAvatar } from '../ui';
import { useSetUrlParams } from '../lib/useUrlParam';

/**
 * Search (FOUNDATION §9 `/search?q=`): boards ("Products"), hubs and posts.
 * Posts use Postgres full-text search; boards and hubs match by name and
 * description. Tabs Top / Posts / Products live in the URL (`&tab=posts`).
 * With no query it shows this device's recent searches. People (by handle or
 * name) are listed on the Top tab.
 */
type SearchTab = 'top' | 'posts' | 'products';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const setUrl = useSetUrlParams();
  const urlQ = params.get('q') ?? '';
  const tabParam = params.get('tab');
  const tab: SearchTab = tabParam === 'posts' || tabParam === 'products' ? tabParam : 'top';
  const [q, setQ] = useState(urlQ);
  const inputRef = useRef<HTMLInputElement>(null);
  usePageTitle(urlQ.trim() ? `${urlQ.trim()} · Search` : 'Search');

  // Keep the field in step when the URL changes from outside (top bar search, Back),
  // but not when the change is our own debounced push of what is being typed.
  const pushed = useRef<string | null>(null);
  useEffect(() => {
    if (pushed.current === urlQ) return;
    pushed.current = null;
    setQ(urlQ);
  }, [urlQ]);
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (focusedOnce.current) return;
    focusedOnce.current = true;
    if (!urlQ) inputRef.current?.focus();
  }, [urlQ]);

  // Results follow the typing (debounced), replacing the history entry.
  useEffect(() => {
    if (q.trim() === urlQ.trim()) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams();
      if (q.trim()) next.set('q', q.trim());
      pushed.current = q.trim();
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, urlQ, setParams]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) rememberSearch(term);
    const next = new URLSearchParams();
    if (term) next.set('q', term);
    setParams(next);
    inputRef.current?.blur();
  };

  const setTab = (v: SearchTab) => setUrl([['tab', v, 'top']]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <h1 id="page-title" className="sr-only">
        Search
      </h1>
      <form role="search" onSubmit={submit} className="mb-3">
        <label className="flex h-9 items-center gap-3 rounded-lg border border-line-strong bg-card pr-2 pl-4 text-ink-muted transition-colors duration-120 focus-within:border-ink-muted">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, posts, hubs"
            aria-label="Search products, posts and hubs"
            autoComplete="off"
            enterKeyHint="search"
            className="w-full min-w-0 appearance-none border-0 bg-transparent text-md text-ink outline-none focus-visible:outline-none"
          />
          {q ? (
            <IconButton
              icon="close"
              label="Clear search"
              size="sm"
              onClick={() => {
                setQ('');
                setParams(new URLSearchParams(), { replace: true });
                inputRef.current?.focus();
              }}
            />
          ) : null}
        </label>
      </form>
      {urlQ.trim().length >= SEARCH_MIN ? (
        <Results q={urlQ.trim()} tab={tab} setTab={setTab} />
      ) : urlQ.trim() ? (
        <p className="m-0 px-3 py-9 text-center text-base text-ink-muted">Keep typing to search.</p>
      ) : (
        <Recent onPick={(term) => setParams(new URLSearchParams({ q: term }))} />
      )}
    </section>
  );
}

function Recent({ onPick }: { onPick: (q: string) => void }) {
  const [recent, setRecent] = useState(readRecentSearches);
  if (recent.length === 0) {
    return <p className="m-0 px-3 py-9 text-center text-base text-ink-muted">Search for a product, a hub, or what’s bugging you.</p>;
  }
  return (
    <section aria-labelledby="sr-recent" className="mt-2">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="sr-recent" className="m-0 text-sm font-semibold text-ink">
          Recent
        </h2>
        <button
          type="button"
          onClick={() => {
            clearRecentSearches();
            setRecent([]);
          }}
          className="border-0 bg-transparent p-0 text-sm font-medium text-ink-muted hover:text-ink"
        >
          Clear
        </button>
      </div>
      <ul className="m-0 list-none p-0">
        {recent.map((r) => (
          <li key={r}>
            <button
              type="button"
              onClick={() => onPick(r)}
              className="flex w-full items-center gap-3 rounded-sm border-0 bg-transparent px-1 py-2 text-left text-base text-ink hover:bg-subtle"
            >
              <span className="text-ink-muted">
                <Icon name="status-review" size={15} />
              </span>
              {r}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Results({ q, tab, setTab }: { q: string; tab: SearchTab; setTab: (t: SearchTab) => void }) {
  const { viewer } = useViewer();
  const { openComposer } = useComposer();
  const search = useSearch(q, viewer?.id ?? null);
  const people = usePeopleSearch(q).data ?? [];

  // Remember a search once its results are on screen.
  useEffect(() => {
    if (search.isSuccess) rememberSearch(q);
  }, [search.isSuccess, q]);

  if (search.isPending) return <PostListSkeleton count={2} />;
  if (search.isError) return <LoadError title="We couldn’t search right now" onRetry={() => void search.refetch()} retrying={search.isRefetching} />;

  const { boards, hubs, posts } = search.data;
  if (boards.length === 0 && hubs.length === 0 && posts.length === 0 && people.length === 0) {
    return (
      <div className="px-4 py-9 text-center text-base text-ink-muted">
        <b className="mb-1 block text-md text-ink">No results for “{q}”</b>
        Nobody has posted about this yet. If it’s bugging you, be the first.
        <div className="mt-4">
          <Button onClick={() => openComposer({ title: q.charAt(0).toUpperCase() + q.slice(1) })}>Post about it</Button>
        </div>
        <p className="mt-4 mb-0 text-sm">
          Can’t find the product? <AddProductLink prefill={q}>Add it</AddProductLink>
        </p>
      </div>
    );
  }

  const postList = (list: typeof posts) =>
    list.length ? (
      <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Posts">
        {list.map((p) => (
          <li key={p.id}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="m-0 px-3 py-9 text-center text-base text-ink-muted">No posts match.</p>
    );

  const boardList = (list: typeof boards) => (
    <RowList label="Products">
      {list.map((b) => (
        <RowItem key={b.id}>
          <BoardRow board={b} />
        </RowItem>
      ))}
    </RowList>
  );

  return (
    <>
      <Tabs
        idBase="search"
        label="Search results"
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: 'top', label: 'Top' },
          { value: 'posts', label: 'Posts', count: posts.length },
          { value: 'products', label: 'Products', count: boards.length },
        ]}
      />
      <TabPanel idBase="search" value={tab}>
        {tab === 'posts' ? (
          postList(posts)
        ) : tab === 'products' ? (
          boards.length ? (
            boardList(boards)
          ) : (
            <p className="m-0 px-3 py-9 text-center text-base text-ink-muted">
              No products match. <AddProductLink prefill={q}>Add it</AddProductLink>
            </p>
          )
        ) : (
          <div className="flex flex-col gap-6">
            {hubs.length ? (
              <ResultSection title="Hubs">
                <RowList label="Hubs">
                  {hubs.map((h) => (
                    <RowItem key={h.id}>
                      <HubRow hub={h} />
                    </RowItem>
                  ))}
                </RowList>
              </ResultSection>
            ) : null}
            {people.length ? (
              <ResultSection title="People">
                <RowList label="People">
                  {people.map((p) => (
                    <RowItem key={p.id}>
                      <Link to={`/u/${p.handle}`} className={rowLink}>
                        <UserAvatar src={avatarSrc(p)} size="md" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-base font-semibold">{p.name || `@${p.handle}`}</span>
                          <span className="truncate text-sm text-ink-muted">@{p.handle}</span>
                        </span>
                      </Link>
                    </RowItem>
                  ))}
                </RowList>
              </ResultSection>
            ) : null}
            {boards.length ? (
              <ResultSection title="Products" more={boards.length > 3 ? { n: boards.length, go: () => setTab('products') } : undefined}>
                {boardList(boards.slice(0, 3))}
              </ResultSection>
            ) : null}
            {posts.length ? (
              <ResultSection title="Posts" more={posts.length > 5 ? { n: posts.length, go: () => setTab('posts') } : undefined}>
                {postList(posts.slice(0, 5))}
              </ResultSection>
            ) : null}
          </div>
        )}
      </TabPanel>
    </>
  );
}

function ResultSection({ title, more, children }: { title: string; more?: { n: number; go: () => void } | undefined; children: ReactNode }) {
  const id = `sr-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id={id} className="m-0 text-sm font-semibold text-ink">
          {title}
        </h2>
        {more ? (
          <button type="button" onClick={more.go} className="border-0 bg-transparent p-0 text-sm font-medium text-brand hover:underline">
            See all {more.n}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
