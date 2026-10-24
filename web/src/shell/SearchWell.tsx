import { forwardRef, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { logoSrc, readRecentSearches, rememberSearch, SEARCH_MIN, useSearch } from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { useAddProduct } from '../products/AddProductDialog';
import { BoardAvatar, HubAvatar, Icon, TYPE_META } from '../ui';

/**
 * The search field used in the right rail and the top bar, with the
 * SearchPopover (FOUNDATION §5): recent searches when empty, then quick results
 * (products, hubs, posts) as you type, and "See all results". Arrow keys move
 * through it, Enter opens the highlighted item or the full results at
 * /search?q=…, Escape closes it.
 */
interface PopItem {
  key: string;
  go: () => void;
  render: (active: boolean) => ReactNode;
  group?: string;
}

export const SearchWell = forwardRef<HTMLInputElement, { className?: string; onSubmitted?: () => void }>(function SearchWell(
  { className, onSubmitted },
  ref,
) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [items, setItems] = useState<PopItem[]>([]);
  const listId = useId();

  const finish = () => {
    setOpen(false);
    setActive(-1);
    onSubmitted?.();
  };

  const goSearch = (term: string) => {
    const t = term.trim();
    if (t) rememberSearch(t);
    void navigate(t ? `/search?q=${encodeURIComponent(t)}` : '/search');
    finish();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const item = open && active >= 0 ? items[active] : undefined;
    if (item) item.go();
    else goSearch(q);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open && items.length) {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i < 0 ? (d > 0 ? 0 : items.length - 1) : (i + d + items.length) % items.length));
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  const showPopover = open && (q.trim().length >= SEARCH_MIN || q.trim().length === 0);

  return (
    <form role="search" onSubmit={submit} className={cx('relative w-full', className)}>
      <label className="flex h-8 cursor-text items-center gap-3 rounded-md border border-line bg-card px-3 text-ink-muted transition-colors duration-120 focus-within:border-line-strong">
        <Icon name="search" size={15} />
        <input
          ref={ref}
          type="search"
          role="combobox"
          aria-expanded={showPopover && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPopover && active >= 0 && items[active] ? `${listId}-${active}` : undefined}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Search products, posts, hubs"
          aria-label="Search products, posts and hubs"
          autoComplete="off"
          className="w-full min-w-0 appearance-none border-0 bg-transparent text-base text-ink outline-none focus-visible:outline-none max-md:text-md"
        />
      </label>
      {showPopover ? (
        <SearchPopover
          q={q}
          listId={listId}
          active={active}
          setActive={setActive}
          onItems={setItems}
          goSearch={goSearch}
          go={(to, term) => {
            if (term) rememberSearch(term);
            void navigate(to);
            setQ('');
            finish();
          }}
          close={() => {
            setQ('');
            finish();
          }}
        />
      ) : null}
    </form>
  );
});

function SearchPopover({
  q,
  listId,
  active,
  setActive,
  onItems,
  goSearch,
  go,
  close,
}: {
  close: () => void;
  q: string;
  listId: string;
  active: number;
  setActive: (i: number) => void;
  onItems: (items: PopItem[]) => void;
  goSearch: (q: string) => void;
  go: (to: string, term?: string) => void;
}) {
  const { viewer } = useViewer();
  const term = q.trim();
  const [debounced, setDebounced] = useState(term);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(t);
  }, [term]);
  const search = useSearch(debounced, viewer?.id ?? null, { postLimit: 4 });
  const recent = useRef(readRecentSearches()).current;
  const addProduct = useAddProduct();

  const items: PopItem[] = [];
  if (!term) {
    for (const r of recent.slice(0, 5)) {
      items.push({
        key: `recent-${r}`,
        group: 'Recent',
        go: () => goSearch(r),
        render: () => (
          <>
            <IconCell>
              <Icon name="status-review" size={15} />
            </IconCell>
            <span className="truncate font-semibold text-ink">{r}</span>
          </>
        ),
      });
    }
  } else if (search.data && debounced === term) {
    const { boards, hubs, posts } = search.data;
    for (const b of boards.slice(0, 3)) {
      items.push({
        key: `b-${b.id}`,
        group: 'Products',
        go: () => go(`/b/${b.slug}`, term),
        render: () => (
          <>
            <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="md" decorative />
            <Text title={b.name} sub={b.tagline} />
          </>
        ),
      });
    }
    for (const h of hubs.slice(0, 2)) {
      items.push({
        key: `h-${h.id}`,
        group: 'Hubs',
        go: () => go(`/h/${h.slug}`, term),
        render: () => (
          <>
            <HubAvatar name={`${h.name} hub`} size="xs" boards={h.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))} />
            <Text title={`${h.name} hub`} sub={h.boards.map((b) => b.name).join(', ')} />
          </>
        ),
      });
    }
    for (const p of posts.slice(0, 4)) {
      items.push({
        key: `p-${p.id}`,
        group: 'Posts',
        go: () => go(`/post/${p.id}`, term),
        render: () => (
          <>
            <BoardAvatar name={p.board?.name ?? '?'} color={p.board?.color} logoSrc={logoSrc(p.board)} size="md" decorative />
            <Text title={p.title} sub={`${p.board?.name ?? ''} · ${TYPE_META[p.type].label} · ${p.vote_count} upvotes`} />
          </>
        ),
      });
    }
    if (addProduct && boards.length === 0 && hubs.length === 0) {
      items.push({
        key: 'add',
        go: () => {
          addProduct.openAddProduct({ prefill: term });
          close();
        },
        render: () => (
          <>
            <IconCell>
              <Icon name="plus" size={15} />
            </IconCell>
            <span className="truncate text-ink-secondary">
              Can’t find it? <b className="font-semibold text-brand">Add it</b>
            </span>
          </>
        ),
      });
    }
    items.push({
      key: 'all',
      go: () => goSearch(term),
      render: () => (
        <>
          <IconCell>
            <Icon name="search" size={15} />
          </IconCell>
          <span className="truncate font-semibold text-ink">
            {items.length ? 'See all results for' : 'Search for'} “{term}”
          </span>
        </>
      ),
    });
  }

  const keys = items.map((i) => i.key).join('|');
  useEffect(() => {
    // The list is rebuilt each render; publish it when its contents change.
    onItems(items);
  }, [keys]);

  if (items.length === 0) return null;
  let lastGroup: string | undefined;
  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Search suggestions"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute top-full right-0 left-0 z-40 mt-2 min-w-rail overflow-hidden rounded-md border border-line bg-card py-1 shadow-overlay max-md:min-w-0"
    >
      {items.map((item, i) => {
        const heading = item.group && item.group !== lastGroup ? item.group : null;
        lastGroup = item.group ?? lastGroup;
        return (
          <div key={item.key}>
            {heading ? <div className="px-3 pt-2 pb-1 text-xs font-semibold text-ink-muted uppercase">{heading}</div> : null}
            {(item.key === 'all' || item.key === 'add') && i > 0 && items[i - 1]?.key !== 'add' ? <div className="my-1 border-t border-line" /> : null}
            <div
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={item.go}
              onMouseEnter={() => setActive(i)}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm aria-selected:bg-subtle"
            >
              {item.render(i === active)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IconCell({ children }: { children: ReactNode }) {
  return <span className="grid size-7 shrink-0 place-items-center text-ink-muted">{children}</span>;
}

function Text({ title, sub }: { title: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-semibold text-ink">{title}</span>
      {sub ? <span className="truncate text-xs text-ink-muted">{sub}</span> : null}
    </span>
  );
}
