import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router';
import {
  avatarSrc,
  CATEGORIES,
  clearRecentSearches,
  compactCount,
  isLive,
  logoSrc,
  readRecentSearches,
  rememberSearch,
  SEARCH_MIN,
  shortAge,
  useBoards,
  useFollowedScopes,
  usePeopleSearch,
  useSearch,
  useTrending,
  useWanted,
  type Board,
  type BoardCategory,
} from '../api';
import { cx } from '../lib/cx';
import { trapTab } from '../lib/focus';
import { useViewer } from '../lib/viewer';
import { useAddProduct } from '../products/AddProductDialog';
import { BoardAvatar, HubAvatar, Icon, IconButton, StatusPill, TYPE_META, UserAvatar } from '../ui';
import { useComposer } from './composer';

/**
 * Search trigger and command-palette modal (FOUNDATION §5):
 * Clicking the search bar in the right rail or top bar, or pressing Cmd/Ctrl+K
 * (or `/` outside inputs), opens the Search Modal.
 *
 * When empty, acts as a rich discovery palette: Recent searches, Browse by
 * category chips, a 2-column grid of Trending / Followed / Most followed
 * product boards, Most wanted requests across boards, and quick actions.
 * When typing, shows scope filter pills and grouped results for Product boards,
 * Company hubs, Feedback & bugs, and People.
 */
interface PopItem {
  key: string;
  go: () => void;
  render: (active: boolean) => ReactNode;
  group?: string;
  groupNote?: string;
  layout?: 'pill' | 'card' | 'row' | 'callout';
}

type SearchScope = 'all' | 'boards' | 'posts' | 'hubs' | 'people';

const CATEGORY_LABEL = new Map<BoardCategory, string>(
  CATEGORIES.filter((c): c is { value: BoardCategory; label: string } => c.value !== 'all').map((c) => [c.value, c.label]),
);

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

interface ModalController {
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
}

const modalControllers = new Map<symbol, ModalController>();

/** Programmatically open the search modal from anywhere in the shell (e.g. mobile TopBar icon). */
export function openSearchModal(): void {
  for (const c of modalControllers.values()) {
    if (c.isOpen()) return;
  }
  const first = modalControllers.values().next().value;
  if (first) first.setOpen(true);
}

function toggleSearchModal(): void {
  for (const c of modalControllers.values()) {
    if (c.isOpen()) {
      c.setOpen(false);
      return;
    }
  }
  const first = modalControllers.values().next().value;
  if (first) first.setOpen(true);
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
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const listId = useId();
  const titleId = useId();
  const instanceId = useRef(Symbol('SearchWell')).current;
  const openRef = useRef(open);
  openRef.current = open;
  const triggerRef = useRef<HTMLFormElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const returnToRef = useRef<HTMLElement | null>(null);

  const openExclusive = () => {
    for (const [id, c] of modalControllers.entries()) {
      if (id !== instanceId && c.isOpen()) c.setOpen(false);
    }
    setOpen(true);
  };

  // Register with the singleton controller map so Cmd/Ctrl+K or `/` only opens one modal
  // even when both TopBar and RightRail mount a SearchWell in AppShell.
  useEffect(() => {
    const id = instanceId;
    modalControllers.set(id, {
      isOpen: () => openRef.current,
      setOpen: (next) => setOpen(next),
    });

    const onWindowKeyDown = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (modalControllers.keys().next().value !== id) return;
      const isModK = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        toggleSearchModal();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) {
        const el = e.target instanceof Element ? e.target : document.activeElement;
        if (el?.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
        e.preventDefault();
        openSearchModal();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
      modalControllers.delete(id);
    };
  }, [instanceId]);

  useLayoutEffect(() => {
    if (!open) return;
    const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnToRef.current = activeEl;
    const source = activeEl ?? triggerRef.current;
    const scoped = source?.closest('[data-theme]');
    setTheme(scoped && scoped !== document.documentElement ? (scoped.getAttribute('data-theme') ?? undefined) : undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    modalInputRef.current?.focus();

    const onDocKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setActive(-1);
        return;
      }
      if (modalPanelRef.current) {
        trapTab(e, modalPanelRef.current);
      }
    };
    document.addEventListener('keydown', onDocKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onDocKeyDown, true);
      document.body.style.overflow = overflow;
    };
  }, [open]);

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

  const activeDescendant = open && active >= 0 && items[active] ? `${listId}-${active}` : undefined;

  return (
    <>
      <form ref={triggerRef} role="search" onSubmit={submit} className={cx('relative w-full', className)}>
        <label
          onClick={() => openExclusive()}
          className="flex h-8 cursor-pointer items-center gap-3 rounded-md border border-line bg-card px-3 text-ink-muted transition-colors duration-120 hover:border-line-strong focus-within:border-line-strong"
        >
          <Icon name="search" size={15} />
          <input
            ref={ref}
            type="search"
            role={open ? undefined : 'combobox'}
            aria-expanded={open ? undefined : false}
            aria-controls={open ? undefined : listId}
            aria-autocomplete={open ? undefined : 'list'}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(-1);
              openExclusive();
            }}
            onFocus={() => openExclusive()}
            onKeyDown={onKeyDown}
            placeholder="Search products, posts, hubs"
            aria-label={open ? 'Search trigger' : 'Search products, posts and hubs'}
            aria-keyshortcuts="Control+K Meta+K"
            autoComplete="off"
            className="w-full min-w-0 cursor-pointer appearance-none border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none max-md:text-md"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none shrink-0 rounded-sm border border-line bg-subtle px-1 font-mono text-xs text-ink-muted max-sm:hidden"
          >
            ⌘K
          </kbd>
        </label>
      </form>

      {open
        ? createPortal(
            <div
              data-theme={theme}
              className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-9 pb-4 max-sm:items-end max-sm:p-0"
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 animate-fade-in bg-overlay"
                onClick={() => finish()}
              />
              <div
                ref={modalPanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="relative flex max-h-full w-full max-w-dialog-lg animate-rise-in flex-col overflow-hidden rounded-lg border border-line bg-card text-ink shadow-overlay outline-none max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
              >
                <h2 id={titleId} className="sr-only">
                  Search
                </h2>
                <div aria-hidden="true" className="mx-auto mt-2 hidden h-1 w-8 rounded-pill bg-line-strong max-sm:block" />
                <form role="search" onSubmit={submit} className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <span className="grid size-6 shrink-0 place-items-center text-brand">
                    <Icon name="search" size={18} />
                  </span>
                  <input
                    ref={modalInputRef}
                    type="search"
                    role="combobox"
                    aria-expanded={items.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeDescendant}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setActive(-1);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder="Search boards, feature requests, bugs, hubs, people…"
                    aria-label="Search products, posts and hubs"
                    autoComplete="off"
                    className="w-full min-w-0 appearance-none border-0 bg-transparent text-md text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none"
                  />
                  {q ? (
                    <IconButton
                      icon="close"
                      size="sm"
                      label="Clear search"
                      onClick={() => {
                        setQ('');
                        setActive(-1);
                        modalInputRef.current?.focus();
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => finish()}
                    aria-label="Close search"
                    data-dialog-close="true"
                    className="shrink-0 cursor-pointer rounded-sm border border-line bg-subtle px-2 py-1 font-mono text-xs font-medium text-ink-secondary transition-colors duration-120 hover:border-line-strong hover:text-ink"
                  >
                    Esc
                  </button>
                </form>

                <SearchModalBody
                  q={q}
                  listId={listId}
                  active={active}
                  setActive={setActive}
                  onItems={setItems}
                  focusInput={() => modalInputRef.current?.focus()}
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
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
});

function SearchModalBody({
  q,
  listId,
  active,
  setActive,
  onItems,
  focusInput,
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
  focusInput: () => void;
  goSearch: (q: string) => void;
  go: (to: string, term?: string) => void;
}) {
  const { viewer } = useViewer();
  const term = q.trim();
  const [debounced, setDebounced] = useState(term);
  const [scope, setScope] = useState<SearchScope>('all');
  const [catFilter, setCatFilter] = useState<'all' | BoardCategory>('all');
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!term) setScope('all');
  }, [term]);

  const boardsQuery = useBoards();
  const live = (boardsQuery.data ?? []).filter(isLive);
  const trendingQuery = useTrending(live, 4);
  const wantedQuery = useWanted(!term);
  const followedScopes = useFollowedScopes(viewer?.id ?? null);
  const search = useSearch(debounced, viewer?.id ?? null, { postLimit: 6 });
  const peopleQuery = usePeopleSearch(debounced);
  const addProduct = useAddProduct();
  const composer = useComposer();

  // Categories that actually have live boards
  const usedCats = new Set(live.map((b) => b.category).filter((c): c is BoardCategory => Boolean(c)));
  const categoryChips = CATEGORIES.filter((c) => c.value === 'all' || usedCats.has(c.value)).slice(0, 8);

  // Determine which boards to highlight in the zero-query state, with an explicit reason
  const byFollowers = live
    .slice()
    .sort((a, b) => b.follower_count - a.follower_count || b.post_count - a.post_count || a.name.localeCompare(b.name));
  const trendingList = trendingQuery.data ?? [];
  const followedList = live.filter((b) => followedScopes.data?.has(`board:${b.id}`));

  let featuredBoards: Array<Board & { recent?: number }>;
  let featuredGroupTitle: string;
  let featuredGroupNote: string;

  if (catFilter !== 'all') {
    const label = CATEGORY_LABEL.get(catFilter) ?? 'Category';
    featuredBoards = byFollowers.filter((b) => b.category === catFilter).slice(0, 4);
    featuredGroupTitle = `${label} boards`;
    featuredGroupNote = `${featuredBoards.length} ${featuredBoards.length === 1 ? 'board' : 'boards'}`;
  } else if (trendingList.length > 0) {
    const seen = new Set(trendingList.map((b) => b.id));
    featuredBoards = [...trendingList, ...byFollowers.filter((b) => !seen.has(b.id))].slice(0, 4);
    featuredGroupTitle = 'Trending boards this week';
    featuredGroupNote = 'Most new posts in the last 7 days';
  } else if (followedList.length > 0) {
    featuredBoards = followedList.slice(0, 4);
    featuredGroupTitle = 'Boards you follow';
    featuredGroupNote = 'Jump to a product you follow';
  } else {
    featuredBoards = byFollowers.slice(0, 4);
    featuredGroupTitle = 'Most followed boards';
    featuredGroupNote = 'Active product boards on Publisense';
  }

  const wantedPosts = (wantedQuery.data ?? []).slice(0, 3);
  const wantedHasVotes = wantedPosts.some((p) => p.vote_count > 0);

  const items: PopItem[] = [];
  const hasQuery = term.length >= SEARCH_MIN;

  const boards = search.data && debounced === term ? search.data.boards : [];
  const hubs = search.data && debounced === term ? search.data.hubs : [];
  const posts = search.data && debounced === term ? search.data.posts : [];
  const people = peopleQuery.data && debounced === term ? peopleQuery.data : [];

  if (!term) {
    for (const r of recent.slice(0, 5)) {
      items.push({
        key: `recent-${r}`,
        group: 'Recent searches',
        layout: 'pill',
        go: () => goSearch(r),
        render: () => (
          <>
            <Icon name="status-review" size={13} />
            <span className="truncate font-medium text-ink">{r}</span>
          </>
        ),
      });
    }
    for (const b of featuredBoards) {
      items.push({
        key: `featured-${b.id}`,
        group: featuredGroupTitle,
        groupNote: featuredGroupNote,
        layout: 'card',
        go: () => go(`/b/${b.slug}`),
        render: () => <BoardSpotlightCard board={b} />,
      });
    }
    for (const p of wantedPosts) {
      items.push({
        key: `wanted-${p.id}`,
        group: wantedHasVotes ? 'Most wanted across boards' : 'Latest feedback & bugs',
        groupNote: wantedHasVotes ? 'Top upvoted requests' : 'Newest across boards',
        layout: 'row',
        go: () => go(`/post/${p.id}`),
        render: () => (
          <>
            <BoardAvatar name={p.board?.name ?? '?'} color={p.board?.color} logoSrc={logoSrc(p.board)} size="sm" decorative />
            <Text
              title={p.title}
              sub={[p.board?.name ?? 'Unknown board', TYPE_META[p.type].label, shortAge(p.created_at)].filter(Boolean).join(' · ')}
            />
            {p.status !== 'open' ? <StatusPill status={p.status} /> : null}
            <VoteBadge count={p.vote_count} />
          </>
        ),
      });
    }
  } else if (hasQuery && search.data && debounced === term) {
    const showBoards = scope === 'all' || scope === 'boards';
    const showHubs = scope === 'all' || scope === 'hubs';
    const showPosts = scope === 'all' || scope === 'posts';
    const showPeople = scope === 'all' || scope === 'people';

    if (showBoards) {
      for (const b of boards.slice(0, scope === 'boards' ? 8 : 4)) {
        items.push({
          key: `b-${b.id}`,
          group: 'Product boards',
          groupNote: `${boards.length} ${boards.length === 1 ? 'match' : 'matches'}`,
          layout: 'row',
          go: () => go(`/b/${b.slug}`, term),
          render: () => (
            <>
              <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="md" decorative />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1">
                  <span className="truncate font-semibold text-ink">{b.name}</span>
                  {b.claimed_at ? (
                    <span className="inline-flex shrink-0 items-center text-success" title="Verified team">
                      <Icon name="check" size={12} strokeWidth={2.5} />
                    </span>
                  ) : null}
                  {b.category && CATEGORY_LABEL.has(b.category) ? (
                    <span className="shrink-0 rounded-sm border border-line bg-subtle px-2 text-xs text-ink-muted">
                      {CATEGORY_LABEL.get(b.category)}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-xs text-ink-muted">{b.tagline}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-muted tabular-nums">
                {b.follower_count > 0 ? <span>{compactCount(b.follower_count)} followers</span> : null}
                {b.post_count > 0 ? (
                  <span>
                    {compactCount(b.post_count)} {b.post_count === 1 ? 'post' : 'posts'}
                  </span>
                ) : null}
              </span>
            </>
          ),
        });
      }
    }
    if (showHubs) {
      for (const h of hubs.slice(0, scope === 'hubs' ? 6 : 2)) {
        items.push({
          key: `h-${h.id}`,
          group: 'Company hubs',
          groupNote: 'Product families',
          layout: 'row',
          go: () => go(`/h/${h.slug}`, term),
          render: () => (
            <>
              {h.boards.length > 0 ? (
                <HubAvatar name={`${h.name} hub`} size="xs" boards={h.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))} />
              ) : (
                <IconCell>
                  <Icon name="hub" size={15} />
                </IconCell>
              )}
              <Text title={`${h.name} hub`} sub={h.boards.map((b) => b.name).join(', ') || h.description} />
              {h.boards.length > 0 ? (
                <span className="shrink-0 rounded-pill border border-line bg-subtle px-2 py-1 font-mono text-xs text-ink-secondary tabular-nums">
                  {h.boards.length} {h.boards.length === 1 ? 'board' : 'boards'}
                </span>
              ) : null}
            </>
          ),
        });
      }
    }
    if (showPosts) {
      for (const p of posts.slice(0, scope === 'posts' ? 8 : 4)) {
        items.push({
          key: `p-${p.id}`,
          group: 'Feedback & bugs',
          groupNote: 'Most upvoted first',
          layout: 'row',
          go: () => go(`/post/${p.id}`, term),
          render: () => (
            <>
              <BoardAvatar name={p.board?.name ?? '?'} color={p.board?.color} logoSrc={logoSrc(p.board)} size="md" decorative />
              <Text
                title={p.title}
                sub={[p.board?.name ?? '', TYPE_META[p.type].label, shortAge(p.created_at), `${p.vote_count} upvotes`].filter(Boolean).join(' · ')}
              />
              {p.status !== 'open' ? <StatusPill status={p.status} /> : null}
              <VoteBadge count={p.vote_count} />
            </>
          ),
        });
      }
    }
    if (showPeople) {
      for (const person of people.slice(0, scope === 'people' ? 6 : 3)) {
        items.push({
          key: `u-${person.id}`,
          group: 'People',
          groupNote: 'Community profiles',
          layout: 'row',
          go: () => go(`/u/${person.handle}`, term),
          render: () => (
            <>
              <UserAvatar name={person.name} src={avatarSrc(person)} size="md" />
              <Text title={person.name} sub={`@${person.handle}`} />
            </>
          ),
        });
      }
    }
    if (addProduct && boards.length === 0 && hubs.length === 0) {
      items.push({
        key: 'add',
        layout: 'callout',
        go: () => {
          addProduct.openAddProduct({ prefill: term });
          close();
        },
        render: () => (
          <>
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
              <Icon name="plus" size={16} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-ink">
                Can’t find it? <b className="font-semibold text-brand">Add it</b>
              </span>
              <span className="truncate text-xs text-ink-muted">Add “{term}” to Publisense and post the first feedback on its board</span>
            </span>
            <span className="shrink-0 rounded-sm border border-brand bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
              Add product →
            </span>
          </>
        ),
      });
    }
    items.push({
      key: 'all',
      layout: 'row',
      go: () => goSearch(term),
      render: () => (
        <>
          <IconCell>
            <Icon name="search" size={15} />
          </IconCell>
          <span className="min-w-0 flex-1 truncate font-semibold text-ink">
            {items.length ? 'See all results for' : 'Search for'} “{term}”
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <span>Full search</span>
            <Icon name="arrow-up-right" size={14} />
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

  const scopes: Array<{ id: SearchScope; label: string; count?: number }> = [
    { id: 'all', label: 'All' },
    { id: 'boards', label: 'Product boards', count: boards.length },
    { id: 'posts', label: 'Feedback & bugs', count: posts.length },
    { id: 'hubs', label: 'Company hubs', count: hubs.length },
    { id: 'people', label: 'People', count: people.length },
  ];

  // Group consecutive items by their `group` name so we can render pills in a flex-wrap row
  // and board spotlight cards in a 2-column grid while keeping flat index numbers for ARIA options.
  const sections: Array<{
    group?: string;
    groupNote?: string;
    layout: PopItem['layout'];
    entries: Array<{ item: PopItem; index: number }>;
  }> = [];

  items.forEach((item, index) => {
    const prev = sections[sections.length - 1];
    if (prev && prev.group === item.group && prev.layout === item.layout && item.group !== undefined) {
      prev.entries.push({ item, index });
    } else {
      sections.push({
        group: item.group,
        groupNote: item.groupNote,
        layout: item.layout,
        entries: [{ item, index }],
      });
    }
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {hasQuery ? (
        <div
          role="toolbar"
          aria-label="Filter search results"
          className="flex items-center gap-1 overflow-x-auto border-b border-line bg-subtle px-4 py-2"
        >
          {scopes.map((s) => {
            const selected = scope === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setScope(s.id);
                  setActive(-1);
                  focusInput();
                }}
                className={cx(
                  'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-pill border px-3 py-1 text-xs font-semibold transition-colors duration-120',
                  selected
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
                )}
              >
                <span>{s.label}</span>
                {typeof s.count === 'number' && s.count > 0 ? (
                  <span className="font-mono text-xs tabular-nums">{s.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : categoryChips.length > 1 ? (
        <div
          role="toolbar"
          aria-label="Browse by category"
          className="flex items-center gap-1 overflow-x-auto border-b border-line bg-subtle px-4 py-2"
        >
          <span className="mr-1 shrink-0 text-xs font-semibold text-ink-muted">Category:</span>
          {categoryChips.map((c) => {
            const selected = catFilter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCatFilter(c.value);
                  setActive(-1);
                  focusInput();
                }}
                className={cx(
                  'inline-flex shrink-0 cursor-pointer items-center rounded-pill border px-3 py-1 text-xs font-medium transition-colors duration-120',
                  selected
                    ? 'border-brand bg-brand-soft font-semibold text-brand'
                    : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        onMouseDown={(e) => e.preventDefault()}
        className="flex-1 overflow-y-auto px-3 py-3"
      >
        {term.length > 0 && term.length < SEARCH_MIN ? (
          <p className="m-0 px-4 py-6 text-center text-sm text-ink-muted">Keep typing to search boards, feedback, hubs and people.</p>
        ) : items.length === 0 && !hasQuery ? (
          <p className="m-0 px-4 py-6 text-center text-sm text-ink-muted">Type a product, feature request, bug or @handle to search.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sections.map((section, sIdx) => (
              <div key={`${section.group ?? 'ungrouped'}-${sIdx}`}>
                {section.group ? (
                  <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                    <span className="text-xs font-semibold text-ink-muted uppercase">{section.group}</span>
                    {section.group === 'Recent searches' ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentSearches();
                          setRecent([]);
                          focusInput();
                        }}
                        className="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-ink-muted transition-colors duration-120 hover:text-ink"
                      >
                        Clear
                      </button>
                    ) : section.groupNote ? (
                      <span className="text-xs text-ink-muted">{section.groupNote}</span>
                    ) : null}
                  </div>
                ) : null}

                {section.layout === 'pill' ? (
                  <div className="flex flex-wrap gap-2 px-1">
                    {section.entries.map(({ item, index }) => (
                      <div
                        key={item.key}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onClick={item.go}
                        onMouseEnter={() => setActive(index)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-pill border border-line bg-subtle px-3 py-1 text-xs text-ink-secondary transition-colors duration-120 hover:border-line-strong hover:text-ink aria-selected:border-brand aria-selected:bg-brand-soft aria-selected:text-brand"
                      >
                        {item.render(index === active)}
                      </div>
                    ))}
                  </div>
                ) : section.layout === 'card' ? (
                  <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                    {section.entries.map(({ item, index }) => (
                      <div
                        key={item.key}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onClick={item.go}
                        onMouseEnter={() => setActive(index)}
                        className="flex cursor-pointer flex-col gap-2 rounded-md border border-line bg-subtle p-3 transition-colors duration-120 hover:border-line-strong aria-selected:border-brand aria-selected:bg-brand-soft"
                      >
                        {item.render(index === active)}
                      </div>
                    ))}
                  </div>
                ) : section.layout === 'callout' ? (
                  <div className="flex flex-col gap-1">
                    {section.entries.map(({ item, index }) => (
                      <div
                        key={item.key}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onClick={item.go}
                        onMouseEnter={() => setActive(index)}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong bg-subtle px-3 py-3 text-sm transition-colors duration-120 hover:border-brand aria-selected:border-brand aria-selected:bg-brand-soft"
                      >
                        {item.render(index === active)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {section.entries.map(({ item, index }) => (
                      <div key={item.key}>
                        {item.key === 'all' && index > 0 ? <div className="my-1 border-t border-line" /> : null}
                        <div
                          id={`${listId}-${index}`}
                          role="option"
                          aria-selected={index === active}
                          onClick={item.go}
                          onMouseEnter={() => setActive(index)}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-120 aria-selected:bg-subtle"
                        >
                          {item.render(index === active)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line bg-subtle px-3 py-2 text-xs text-ink-muted">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              close();
              composer.openComposer();
            }}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-line bg-card px-2 py-1 text-xs font-semibold whitespace-nowrap text-ink-secondary transition-colors duration-120 hover:border-line-strong hover:text-ink"
          >
            <Icon name="plus" size={12} />
            <span>Post feedback</span>
          </button>
          {addProduct ? (
            <button
              type="button"
              onClick={() => {
                addProduct.openAddProduct({ prefill: term || undefined });
                close();
              }}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-line bg-card px-2 py-1 text-xs font-semibold whitespace-nowrap text-ink-secondary transition-colors duration-120 hover:border-line-strong hover:text-ink"
            >
              <Icon name="globe" size={12} />
              <span>Add a product</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => go('/explore')}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-line bg-card px-2 py-1 text-xs font-semibold whitespace-nowrap text-ink-secondary transition-colors duration-120 hover:border-line-strong hover:text-ink"
          >
            <Icon name="explore" size={12} />
            <span>Explore boards</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap max-sm:hidden">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-sm border border-line bg-card px-1 font-mono text-xs text-ink-secondary">↑</kbd>
            <kbd className="rounded-sm border border-line bg-card px-1 font-mono text-xs text-ink-secondary">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-sm border border-line bg-card px-1 font-mono text-xs text-ink-secondary">↵</kbd>
            <span>Open</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-sm border border-line bg-card px-1 font-mono text-xs text-ink-secondary">esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

function BoardSpotlightCard({ board }: { board: Board & { recent?: number } }) {
  const catLabel = board.category ? CATEGORY_LABEL.get(board.category) : undefined;
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="md" decorative />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold text-ink">{board.name}</span>
            {board.claimed_at ? (
              <span className="inline-flex shrink-0 items-center text-success" title="Verified team">
                <Icon name="check" size={12} strokeWidth={2.5} />
              </span>
            ) : null}
          </div>
          <span className="truncate text-xs text-ink-muted">{board.tagline}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          {board.follower_count > 0 ? (
            <span>
              <b className="font-semibold text-ink">{compactCount(board.follower_count)}</b>{' '}
              {board.follower_count === 1 ? 'follower' : 'followers'}
            </span>
          ) : null}
          {board.post_count > 0 ? (
            <span>
              <b className="font-semibold text-ink">{compactCount(board.post_count)}</b>{' '}
              {board.post_count === 1 ? 'post' : 'posts'}
            </span>
          ) : null}
        </div>
        {typeof board.recent === 'number' && board.recent > 0 ? (
          <span className="font-mono text-xs font-semibold text-brand">+{board.recent} this week</span>
        ) : catLabel ? (
          <span className="rounded-sm bg-card px-2 text-xs text-ink-secondary">{catLabel}</span>
        ) : null}
      </div>
    </>
  );
}

function VoteBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-line bg-subtle px-2 py-1 font-mono text-xs font-semibold text-ink-secondary tabular-nums">
      <Icon name="arrow-up" size={11} />
      <span>{count}</span>
    </span>
  );
}

function IconCell({ children }: { children: ReactNode }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-subtle text-ink-muted">{children}</span>;
}

function Text({ title, sub }: { title: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-semibold text-ink">{title}</span>
      {sub ? <span className="truncate text-xs text-ink-muted">{sub}</span> : null}
    </span>
  );
}
