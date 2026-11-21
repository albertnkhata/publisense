import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import {
  avatarSrc,
  CATEGORIES,
  compactCount,
  isLive,
  isProductFamily,
  logoSrc,
  loggableSearchTerm,
  recordEvent,
  rememberSearch,
  SEARCH_EMPTY_SETTLE_MS,
  SEARCH_MIN,
  shortAge,
  useBoards,
  useFollowedScopes,
  useHubs,
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

/**
 * Search trigger and command-palette modal (FOUNDATION §5).
 *
 * The trigger in the right rail and the top bar is a button styled as the
 * search field; clicking it, pressing Cmd/Ctrl+K, or `/` outside inputs opens
 * the Search Modal. The shortcut works but is not advertised on screen (the
 * light redesign keeps hints and counters out of the UI).
 *
 * Empty, the modal is a light discovery palette: category chips, a few product
 * boards (trending, followed or most followed) and the most wanted requests.
 * Typing shows scope filters and grouped results for product boards, company
 * hubs, feedback & bugs and people, then “See all results”.
 *
 * On phones the modal fills the screen with the field pinned at the top, so it never
 * shrinks or slides behind the keyboard while results change as you type.
 *
 * Accessibility: the modal input is a combobox owning a listbox that holds only
 * options and labelled groups. Closing the modal returns focus to whatever
 * opened it (or this trigger). The search has no dependency on the composer, so
 * it renders anywhere the router and query client are mounted.
 */
interface PopItem {
  key: string;
  go: () => void;
  render: (active: boolean) => ReactNode;
  group?: string;
  layout?: 'pill' | 'card' | 'row' | 'callout';
}

export type SearchScope = 'all' | 'boards' | 'posts' | 'hubs' | 'people';

export interface OpenSearchOptions {
  query?: string;
  scope?: SearchScope;
}

const CATEGORY_LABEL = new Map<BoardCategory, string>(
  CATEGORIES.filter((c): c is { value: BoardCategory; label: string } => c.value !== 'all').map((c) => [c.value, c.label]),
);

const TRIGGER_LABEL = 'Search products, posts, hubs';

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Apple platforms use ⌘, everything else Ctrl. Only feeds aria-keyshortcuts (nothing is shown). */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** A rendered (laid-out) element; hidden triggers (display:none at this breakpoint) can’t take focus. */
function isRendered(el: HTMLElement | null): boolean {
  if (!el) return false;
  // jsdom has no layout: treat everything as rendered there.
  if (typeof el.getClientRects !== 'function' || navigator.userAgent.includes('jsdom')) return true;
  return el.getClientRects().length > 0;
}

interface ModalController {
  isOpen: () => boolean;
  open: (opts?: OpenSearchOptions) => void;
  close: () => void;
  isVisible: () => boolean;
}

const modalControllers = new Map<symbol, ModalController>();

/** The trigger to open: the first one actually on screen, else the first mounted. */
function pickController(): ModalController | undefined {
  const all = [...modalControllers.values()];
  return all.find((c) => c.isVisible()) ?? all[0];
}

/** Programmatically open the search modal from anywhere in the shell (e.g. mobile TopBar icon or section links). */
export function openSearchModal(opts?: OpenSearchOptions): void {
  for (const c of modalControllers.values()) {
    if (c.isOpen()) {
      if (opts) c.open(opts);
      return;
    }
  }
  pickController()?.open(opts);
}

function toggleSearchModal(): void {
  for (const c of modalControllers.values()) {
    if (c.isOpen()) {
      c.close();
      return;
    }
  }
  pickController()?.open();
}

export function SearchWell({
  className,
  triggerClassName,
  placeholder = TRIGGER_LABEL,
  onSubmitted,
}: {
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  onSubmitted?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [itemCount, setItemCount] = useState(0);
  const itemsRef = useRef<PopItem[]>([]);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const listId = useId();
  const titleId = useId();
  const instanceId = useRef(Symbol('SearchWell')).current;
  const openRef = useRef(open);
  openRef.current = open;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const returnToRef = useRef<HTMLElement | null>(null);
  const [shortcut] = useState(() => (isApplePlatform() ? 'Meta+K' : 'Control+K'));

  // Every close (Escape, Close, outside click, picking a result, navigating away)
  // starts the next search fresh.
  useEffect(() => {
    if (open) return;
    setQ('');
    setScope('all');
    setActive(-1);
  }, [open]);

  // Navigating (Back, Forward, a link elsewhere) closes the modal.
  const lastLocation = useRef(location.key);
  useEffect(() => {
    if (lastLocation.current === location.key) return;
    lastLocation.current = location.key;
    setOpen(false);
  }, [location.key]);

  const openExclusive = (opts?: OpenSearchOptions) => {
    for (const [id, c] of modalControllers.entries()) {
      if (id !== instanceId && c.isOpen()) c.close();
    }
    if (opts?.query !== undefined) setQ(opts.query);
    setScope(opts?.scope ?? 'all');
    setActive(-1);
    setOpen(true);
  };
  const openExclusiveRef = useRef(openExclusive);
  openExclusiveRef.current = openExclusive;

  // Register with the singleton controller map so Cmd/Ctrl+K or `/` only opens one modal
  // even when both TopBar and RightRail mount a SearchWell in AppShell.
  useEffect(() => {
    const id = instanceId;
    modalControllers.set(id, {
      isOpen: () => openRef.current,
      open: (opts) => openExclusiveRef.current(opts),
      close: () => setOpen(false),
      isVisible: () => isRendered(triggerRef.current),
    });

    const onWindowKeyDown = (e: globalThis.KeyboardEvent) => {
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
        if (locationRef.current === '/search' || (typeof window !== 'undefined' && window.location.pathname === '/search')) {
          const pageInput = document.querySelector<HTMLInputElement>('form[role="search"] input[type="search"]');
          if (pageInput) {
            e.preventDefault();
            pageInput.focus();
            pageInput.select?.();
            return;
          }
          return;
        }
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

  // Remember the opener (trigger, mobile icon, or whatever had focus for Cmd/Ctrl+K)
  // and inherit its theme scope, since the portal leaves the subtree.
  useLayoutEffect(() => {
    if (!open) return;
    const activeEl = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    returnToRef.current = activeEl;
    const source = activeEl ?? triggerRef.current;
    const scoped = source?.closest('[data-theme]');
    setTheme(scoped && scoped !== document.documentElement ? (scoped.getAttribute('data-theme') ?? undefined) : undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    recordEvent('search_open');
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
      // Return focus to the opener. The trigger is a button, so focusing it doesn’t reopen the modal.
      const back = returnToRef.current;
      const target = back && document.contains(back) && isRendered(back) ? back : triggerRef.current;
      returnToRef.current = null;
      if (target && document.contains(target)) target.focus();
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
    const item = open && active >= 0 ? itemsRef.current[active] : undefined;
    if (item) item.go();
    else goSearch(q);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = itemsRef.current.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open && count) {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i < 0 ? (d > 0 ? 0 : count - 1) : (i + d + count) % count));
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  // Typing a character on the focused trigger opens the modal with that character.
  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      openExclusive({ query: e.key });
    }
  };

  const activeDescendant = open && active >= 0 && active < itemCount ? `${listId}-${active}` : undefined;

  return (
    <>
      <div className={cx('relative w-full', className)}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts={shortcut}
          onClick={() => openExclusive()}
          onKeyDown={onTriggerKeyDown}
          className={cx(
            'flex w-full cursor-pointer items-center gap-3 rounded-md border border-line bg-card px-3 text-left text-base text-ink-muted transition-colors duration-120 hover:border-line-strong focus-visible:border-line-strong max-md:text-md',
            triggerClassName ?? 'h-8',
          )}
        >
          <Icon name="search" size={15} />
          <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        </button>
      </div>

      {open
        ? createPortal(
            <div
              data-theme={theme}
              className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-9 pb-4 max-sm:p-0"
            >
              <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-overlay" onClick={() => finish()} />
              <div
                ref={modalPanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="relative flex max-h-full w-full max-w-dialog-lg animate-rise-in flex-col overflow-hidden rounded-lg border border-line bg-card text-ink shadow-overlay outline-none max-sm:h-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0"
              >
                <h2 id={titleId} className="sr-only">
                  Search
                </h2>
                <form role="search" onSubmit={submit} className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <span className="grid size-6 shrink-0 place-items-center text-brand">
                    <Icon name="search" size={18} />
                  </span>
                  <input
                    ref={modalInputRef}
                    type="search"
                    role="combobox"
                    aria-expanded={itemCount > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeDescendant}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setActive(-1);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={TRIGGER_LABEL}
                    aria-label={TRIGGER_LABEL}
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
                    data-dialog-close="true"
                    className="shrink-0 cursor-pointer rounded-sm border-0 bg-transparent px-1 text-sm font-medium text-ink-secondary transition-colors duration-120 hover:text-ink"
                  >
                    Close
                  </button>
                </form>

                <SearchModalBody
                  q={q}
                  scope={scope}
                  setScope={setScope}
                  listId={listId}
                  active={active}
                  setActive={setActive}
                  itemsRef={itemsRef}
                  onCount={setItemCount}
                  focusInput={() => modalInputRef.current?.focus()}
                  goSearch={goSearch}
                  go={(to, term) => {
                    recordEvent('search_click');
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
}

function SearchModalBody({
  q,
  scope,
  setScope,
  listId,
  active,
  setActive,
  itemsRef,
  onCount,
  focusInput,
  goSearch,
  go,
  close,
}: {
  close: () => void;
  q: string;
  scope: SearchScope;
  setScope: (s: SearchScope) => void;
  listId: string;
  active: number;
  setActive: (i: number) => void;
  itemsRef: { current: PopItem[] };
  onCount: (n: number) => void;
  focusInput: () => void;
  goSearch: (q: string) => void;
  go: (to: string, term?: string) => void;
}) {
  const { viewer } = useViewer();
  const term = q.trim();
  const [debounced, setDebounced] = useState(term);
  const [catFilter, setCatFilter] = useState<'all' | BoardCategory>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(t);
  }, [term]);

  const boardsQuery = useBoards();
  const hubsQuery = useHubs();
  const live = (boardsQuery.data ?? []).filter(isLive);
  const trendingQuery = useTrending(live, 4);
  const wantedQuery = useWanted(!term);
  const followedScopes = useFollowedScopes(viewer?.id ?? null);
  const search = useSearch(debounced, viewer?.id ?? null, { postLimit: 6, keepPrevious: true });
  const peopleQuery = usePeopleSearch(debounced);
  const addProduct = useAddProduct();

  // Categories that actually have live boards
  const usedCats = new Set(live.map((b) => b.category).filter((c): c is BoardCategory => Boolean(c)));
  const categoryChips = CATEGORIES.filter((c) => c.value === 'all' || usedCats.has(c.value)).slice(0, 8);

  // Boards to highlight in the zero-query state, falling back to post activity when follower counts aren't differentiated.
  const hasFollowerSignal = live.filter((b) => b.follower_count > 1).length >= 2;
  const byActivity = live
    .slice()
    .sort((a, b) => b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name));
  const byFollowers = live
    .slice()
    .sort((a, b) => b.follower_count - a.follower_count || b.post_count - a.post_count || a.name.localeCompare(b.name));
  const rankedBoards = hasFollowerSignal ? byFollowers : byActivity;
  const trendingList = trendingQuery.data ?? [];
  const followedList = live.filter((b) => followedScopes.data?.has(`board:${b.id}`));

  let featuredBoards: Board[];
  let featuredGroupTitle: string;

  if (catFilter !== 'all') {
    const label = CATEGORY_LABEL.get(catFilter) ?? 'Category';
    featuredBoards = rankedBoards.filter((b) => b.category === catFilter).slice(0, 4);
    featuredGroupTitle = `${label} products`;
  } else if (trendingList.length > 0) {
    const seen = new Set(trendingList.map((b) => b.id));
    featuredBoards = [...trendingList, ...rankedBoards.filter((b) => !seen.has(b.id))].slice(0, 4);
    featuredGroupTitle = 'Trending products this week';
  } else if (followedList.length > 0) {
    featuredBoards = followedList.slice(0, 4);
    featuredGroupTitle = 'Products you follow';
  } else if (hasFollowerSignal) {
    featuredBoards = byFollowers.slice(0, 4);
    featuredGroupTitle = 'Most followed products';
  } else {
    featuredBoards = byActivity.slice(0, 4);
    featuredGroupTitle = 'Most active products';
  }

  const wantedPosts = (wantedQuery.data ?? []).slice(0, scope === 'posts' ? 8 : 3);
  const wantedHasVotes = wantedPosts.some((p) => p.vote_count > 0);
  const liveHubs = (hubsQuery.data ?? []).filter((h) => isProductFamily(h.boards.length));

  const items: PopItem[] = [];
  const hasQuery = term.length >= SEARCH_MIN;

  const boards = search.data && debounced === term ? search.data.boards : [];
  const hubs = search.data && debounced === term ? search.data.hubs : [];
  const posts = search.data && debounced === term ? search.data.posts : [];
  const people = peopleQuery.data && debounced === term ? peopleQuery.data : [];
  // Unmet demand (0054): log a zero-result search only once the query has settled
  // (debounced, then unchanged for SEARCH_EMPTY_SETTLE_MS), is 3+ characters, and
  // doesn't look like an email or phone number; each term at most once per modal.
  const emptyLoggedRef = useRef<Set<string>>(new Set());
  const noResults =
    hasQuery && Boolean(search.data) && !search.isPlaceholderData && debounced === term && boards.length === 0 && hubs.length === 0 && posts.length === 0;
  useEffect(() => {
    if (!noResults) return;
    const q = loggableSearchTerm(debounced);
    if (!q || emptyLoggedRef.current.has(q.toLowerCase())) return;
    const t = setTimeout(() => {
      emptyLoggedRef.current.add(q.toLowerCase());
      recordEvent('search_empty', { meta: { q } });
    }, SEARCH_EMPTY_SETTLE_MS);
    return () => clearTimeout(t);
  }, [noResults, debounced]);

  if (!term) {
    if (scope === 'boards') {
      const scopedBoards = (catFilter === 'all' ? rankedBoards : rankedBoards.filter((b) => b.category === catFilter)).slice(0, 8);
      for (const b of scopedBoards) {
        items.push({
          key: `board-${b.id}`,
          group: 'Products',
          layout: 'row',
          go: () => go(`/b/${b.slug}`),
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
                </span>
                <span className="truncate text-xs text-ink-muted">{b.tagline}</span>
              </span>
              {b.follower_count > 0 || b.post_count > 0 ? (
                <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-muted tabular-nums max-sm:hidden">
                  {b.follower_count > 0 ? (
                    <span>
                      {compactCount(b.follower_count)} {b.follower_count === 1 ? 'follower' : 'followers'}
                    </span>
                  ) : null}
                  <span>
                    {compactCount(b.post_count)} {b.post_count === 1 ? 'post' : 'posts'}
                  </span>
                </span>
              ) : null}
            </>
          ),
        });
      }
    } else if (scope === 'posts') {
      for (const p of wantedPosts) {
        items.push({
          key: `wanted-${p.id}`,
          group: wantedHasVotes ? 'Popular feedback & bugs' : 'Latest feedback & bugs',
          layout: 'row',
          go: () => go(`/post/${p.id}`),
          render: () => (
            <>
              <BoardAvatar name={p.board?.name ?? '?'} color={p.board?.color} logoSrc={logoSrc(p.board)} size="sm" decorative />
              <Text
                title={p.title}
                sub={[p.board?.name ?? 'Unknown product', TYPE_META[p.type].label, shortAge(p.created_at)].filter(Boolean).join(' · ')}
              />
              {p.status !== 'open' ? <StatusPill status={p.status} /> : null}
              <VoteBadge count={p.vote_count} />
            </>
          ),
        });
      }
    } else if (scope === 'hubs') {
      for (const h of liveHubs.slice(0, 8)) {
        items.push({
          key: `hub-${h.id}`,
          group: 'Hubs',
          layout: 'row',
          go: () => go(`/h/${h.slug}`),
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
            </>
          ),
        });
      }
    } else if (scope === 'all') {
      // Recent searches are parked until the broad layout is finished, so the empty state starts with products.
      for (const b of featuredBoards) {
        items.push({
          key: `featured-${b.id}`,
          group: featuredGroupTitle,
          layout: 'card',
          go: () => go(`/b/${b.slug}`),
          render: () => <BoardSpotlightCard board={b} />,
        });
      }
      for (const p of wantedPosts) {
        items.push({
          key: `wanted-${p.id}`,
          group: wantedHasVotes ? 'Most wanted across products' : 'Latest feedback & bugs',
          layout: 'row',
          go: () => go(`/post/${p.id}`),
          render: () => (
            <>
              <BoardAvatar name={p.board?.name ?? '?'} color={p.board?.color} logoSrc={logoSrc(p.board)} size="sm" decorative />
              <Text
                title={p.title}
                sub={[p.board?.name ?? 'Unknown product', TYPE_META[p.type].label, shortAge(p.created_at)].filter(Boolean).join(' · ')}
              />
              {p.status !== 'open' ? <StatusPill status={p.status} /> : null}
              <VoteBadge count={p.vote_count} />
            </>
          ),
        });
      }
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
          group: 'Products',
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
                </span>
                <span className="truncate text-xs text-ink-muted">{b.tagline}</span>
              </span>
              {b.follower_count > 0 || b.post_count > 0 ? (
                <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-muted tabular-nums max-sm:hidden">
                  {b.follower_count > 0 ? (
                    <span>
                      {compactCount(b.follower_count)} {b.follower_count === 1 ? 'follower' : 'followers'}
                    </span>
                  ) : null}
                  <span>
                    {compactCount(b.post_count)} {b.post_count === 1 ? 'post' : 'posts'}
                  </span>
                </span>
              ) : null}
            </>
          ),
        });
      }
    }
    if (showHubs) {
      for (const h of hubs.slice(0, scope === 'hubs' ? 6 : 2)) {
        items.push({
          key: `h-${h.id}`,
          group: 'Hubs',
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
          layout: 'row',
          go: () => go(`/post/${p.id}`, term),
          render: () => (
            <>
              <BoardAvatar name={p.board?.name ?? '?'} color={p.board?.color} logoSrc={logoSrc(p.board)} size="md" decorative />
              <Text title={p.title} sub={[p.board?.name ?? '', TYPE_META[p.type].label, shortAge(p.created_at)].filter(Boolean).join(' · ')} />
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
    if (addProduct && !search.isPlaceholderData && boards.length === 0 && hubs.length === 0) {
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
              <span className="truncate text-xs text-ink-muted">Add “{term}” to Publisense and be the first to post feedback</span>
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
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted">
            <span>Full search</span>
            <Icon name="arrow-up-right" size={14} />
          </span>
        </>
      ),
    });
  }

  // The list is rebuilt each render; keep the parent’s copy current every render so the
  // closures it calls on Enter never go stale, and publish the count when it changes.
  useLayoutEffect(() => {
    itemsRef.current = items;
  });
  const keys = items.map((i) => i.key).join('|');
  useEffect(() => {
    onCount(items.length);
  }, [keys]);

  const scopes: Array<{ id: SearchScope; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'boards', label: 'Products' },
    { id: 'posts', label: 'Feedback & bugs' },
    { id: 'hubs', label: 'Hubs' },
    { id: 'people', label: 'People' },
  ];

  // Group consecutive items by their `group` name so pills wrap, board spotlight cards sit
  // in a 2-column grid, and option ids keep flat indexes for aria-activedescendant.
  const sections: Array<{
    group?: string;
    layout: PopItem['layout'];
    entries: Array<{ item: PopItem; index: number }>;
  }> = [];

  items.forEach((item, index) => {
    const prev = sections[sections.length - 1];
    if (prev && prev.group === item.group && prev.layout === item.layout && item.group !== undefined) {
      prev.entries.push({ item, index });
    } else {
      sections.push({ group: item.group, layout: item.layout, entries: [{ item, index }] });
    }
  });

  const option = (item: PopItem, index: number, className: string) => (
    <div
      key={item.key}
      id={`${listId}-${index}`}
      role="option"
      aria-selected={index === active}
      onClick={item.go}
      onMouseEnter={() => setActive(index)}
      className={className}
    >
      {item.render(index === active)}
    </div>
  );

  const renderEntries = (section: (typeof sections)[number]) => {
    if (section.layout === 'pill') {
      return (
        <div role="presentation" className="flex flex-wrap gap-2 px-1">
          {section.entries.map(({ item, index }) =>
            option(
              item,
              index,
              'inline-flex cursor-pointer items-center gap-1 rounded-pill border border-line bg-subtle px-3 py-1 text-xs text-ink-secondary transition-colors duration-120 hover:border-line-strong hover:text-ink aria-selected:border-brand aria-selected:bg-brand-soft aria-selected:text-brand',
            ),
          )}
        </div>
      );
    }
    if (section.layout === 'card') {
      return (
        <div role="presentation" className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          {section.entries.map(({ item, index }) =>
            option(
              item,
              index,
              'flex cursor-pointer flex-col gap-2 rounded-md border border-line bg-subtle p-3 transition-colors duration-120 hover:border-line-strong aria-selected:border-brand aria-selected:bg-brand-soft',
            ),
          )}
        </div>
      );
    }
    if (section.layout === 'callout') {
      return (
        <div role="presentation" className="flex flex-col gap-1">
          {section.entries.map(({ item, index }) =>
            option(
              item,
              index,
              'flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong bg-subtle px-3 py-3 text-sm transition-colors duration-120 hover:border-brand aria-selected:border-brand aria-selected:bg-brand-soft',
            ),
          )}
        </div>
      );
    }
    return (
      <div role="presentation" className="flex flex-col">
        {section.entries.map(({ item, index }) =>
          option(
            item,
            index,
            cx(
              'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-120 aria-selected:bg-subtle',
              item.key === 'all' && index > 0 && 'mt-1 border-t border-line',
            ),
          ),
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {hasQuery || scope !== 'all' ? (
        <div role="group" aria-label="Filter search results" className="flex flex-wrap items-center gap-1 border-b border-line bg-subtle px-4 py-2">
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
                  'inline-flex shrink-0 cursor-pointer items-center rounded-pill border px-3 py-1 text-xs font-semibold transition-colors duration-120',
                  selected
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ) : !term && categoryChips.length > 1 ? (
        <div role="group" aria-label="Browse by category" className="flex flex-wrap items-center gap-1 border-b border-line bg-subtle px-4 py-2">
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

      {term.length > 0 && term.length < SEARCH_MIN ? (
        <p className="m-0 px-4 py-6 text-center text-sm text-ink-muted">Keep typing to search products, feedback, hubs, or people.</p>
      ) : items.length === 0 && !hasQuery ? (
        <p className="m-0 px-4 py-6 text-center text-sm text-ink-muted">Type a product, feature request, bug or @handle to search.</p>
      ) : null}

      <div
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        onMouseDown={(e) => e.preventDefault()}
        className={cx('flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3', items.length === 0 && 'hidden')}
      >
        {sections.map((section, sIdx) => {
          const headingId = `${listId}-g${sIdx}`;
          return section.group ? (
            <div key={`${section.group}-${sIdx}`} role="group" aria-labelledby={headingId}>
              <div role="presentation" className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <span id={headingId} className="text-xs font-semibold text-ink-muted uppercase">
                  {section.group}
                </span>
              </div>
              {renderEntries(section)}
            </div>
          ) : (
            <div key={`ungrouped-${sIdx}`} role="presentation">
              {renderEntries(section)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardSpotlightCard({ board }: { board: Board }) {
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
      {board.follower_count > 0 || board.post_count > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs text-ink-muted">
          <div className="flex items-center gap-2">
            {board.follower_count > 0 ? (
              <span>
                <b className="font-semibold text-ink">{compactCount(board.follower_count)}</b>{' '}
                {board.follower_count === 1 ? 'follower' : 'followers'}
              </span>
            ) : null}
            <span>
              <b className="font-semibold text-ink">{compactCount(board.post_count)}</b> {board.post_count === 1 ? 'post' : 'posts'}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function VoteBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-line bg-subtle px-2 py-1 font-mono text-xs font-semibold text-ink-secondary tabular-nums">
      <Icon name="arrow-up" size={11} />
      <span>{count}</span>
      <span className="sr-only">{count === 1 ? 'upvote' : 'upvotes'}</span>
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
