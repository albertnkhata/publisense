import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { Link, useNavigate } from 'react-router';
import {
  BODY_MAX,
  logoSrc,
  matchesAll,
  TITLE_MAX,
  useBoards,
  useCreatePost,
  useHubs,
  useSimilarPosts,
  validatePost,
  type Board,
  type Post,
  type PostErrors,
  type PostType,
} from '../api';
import { useViewer } from '../lib/viewer';
import { VoteButton } from '../posts/VoteButton';
import { BoardAvatar, Button, Dialog, Field, Icon, Input, Menu, MenuItemRadio, STATUS_META, Textarea, TYPE_META, useToast } from '../ui';
import { useRequireAuth } from './auth';

/**
 * The Composer (FOUNDATION §5): board picker (with a product picker when opened
 * from a hub), type, title with similar-post suggestions, details. Opened from
 * anywhere (nav CTA, tab bar, "C", board and hub headers, search). Signed out,
 * opening it asks for sign-in instead.
 */
export interface ComposerOptions {
  /** Preselect this board (slug). */
  board?: string;
  /** Offer this hub's boards as quick picks (slug). */
  hub?: string;
  /** Prefill the title (search's "Post about it"). */
  title?: string;
}

interface ComposerCtx {
  openComposer: (opts?: ComposerOptions) => void;
}

const ComposerContext = createContext<ComposerCtx | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const requireAuth = useRequireAuth();
  const [state, setState] = useState<{ open: boolean; opts: ComposerOptions; key: number }>({ open: false, opts: {}, key: 0 });
  const openComposer = useCallback(
    (opts?: ComposerOptions) => {
      if (!requireAuth('post feedback')) return;
      // Guard against being handed a click event as `opts`.
      const clean: ComposerOptions =
        opts && typeof opts === 'object' && !('nativeEvent' in opts) ? { board: opts.board, hub: opts.hub, title: opts.title } : {};
      setState((s) => ({ open: true, opts: clean, key: s.key + 1 }));
    },
    [requireAuth],
  );
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ openComposer }), [openComposer]);
  return (
    <ComposerContext.Provider value={value}>
      {children}
      {state.open ? <Composer key={state.key} opts={state.opts} onClose={close} /> : null}
    </ComposerContext.Provider>
  );
}

export function useComposer() {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error('useComposer must be used inside <ComposerProvider>');
  return ctx;
}

const TYPES: Array<{ value: PostType; desc: string }> = [
  { value: 'bug', desc: 'Something’s broken or not working right' },
  { value: 'feature', desc: 'A feature or change you’d like' },
];

function Composer({ opts, onClose }: { opts: ComposerOptions; onClose: () => void }) {
  const { viewer } = useViewer();
  const navigate = useNavigate();
  const { toast } = useToast();
  const boards = useBoards();
  const hubs = useHubs();
  const create = useCreatePost(viewer?.id ?? null);

  const [boardSlug, setBoardSlug] = useState<string | null>(opts.board ?? null);
  const [type, setType] = useState<PostType | null>(null);
  const [title, setTitle] = useState(opts.title ?? '');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<PostErrors & { board?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);

  const productRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const formId = useId();

  const board = boards.data?.find((b) => b.slug === boardSlug) ?? null;
  const hub = opts.hub ? (hubs.data?.find((h) => h.slug === opts.hub) ?? null) : null;

  // Similar posts look on the chosen board, or across the hub before one is chosen.
  const similarBoards = board ? [board.id] : hub ? hub.boards.map((b) => b.id) : [];
  const [debounced, setDebounced] = useState(title);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(title), 180);
    return () => clearTimeout(t);
  }, [title]);
  const similar = useSimilarPosts(debounced, similarBoards, viewer?.id ?? null);

  const valid = Boolean(board && type && title.trim());

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (create.isPending) return;
    const found: PostErrors & { board?: string } = validatePost({ type: type ?? ('' as PostType), title, body });
    if (!board) found.board = 'Choose the product this is about.';
    if (!type) found.type = 'Choose a type.';
    setErrors(found);
    if (Object.keys(found).length || !board || !type) return;
    setFailure(null);
    create.mutate(
      { boardId: board.id, type, title, body },
      {
        onSuccess: (post) => {
          onClose();
          toast(`Posted to ${board.name}`);
          void navigate(`/post/${post.id}`);
        },
        onError: (err) => setFailure(err instanceof Error ? err.message : 'We couldn’t post this. Try again.'),
      },
    );
  };

  const onSubmitKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const initialFocus = board ? (type ? titleRef : typeRef) : productRef;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Post feedback"
      size="lg"
      initialFocus={initialFocus}
      dismissable={!create.isPending}
      footer={
        <>
          <span className="mr-auto text-sm text-ink-muted max-sm:hidden">You’ll follow this post automatically</span>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!valid} loading={create.isPending}>
            Post
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} onKeyDown={onSubmitKey} className="flex flex-col gap-5">
        <Field label="Product" error={errors.board}>
          {board ? (
            <SelectedBoard board={board} onChange={() => setBoardSlug(null)} />
          ) : boardSlug && boards.isPending ? (
            <div aria-busy="true" className="h-8 animate-pulse rounded-md border border-line-strong bg-subtle" />
          ) : (
            <>
              {hub ? (
                <HubPicks
                  hubName={hub.name}
                  boards={hub.boards}
                  onPick={(b) => {
                    setBoardSlug(b.slug);
                    setErrors((x) => ({ ...x, board: undefined }));
                    requestAnimationFrame(() => (type ? titleRef : typeRef).current?.focus());
                  }}
                />
              ) : null}
              <BoardCombobox
                ref={productRef}
                boards={boards.data ?? []}
                loading={boards.isPending}
                onPick={(b) => {
                  setBoardSlug(b.slug);
                  setErrors((x) => ({ ...x, board: undefined }));
                  requestAnimationFrame(() => (type ? titleRef : typeRef).current?.focus());
                }}
              />
            </>
          )}
        </Field>

        <TypeField
          triggerRef={typeRef}
          value={type}
          error={errors.type}
          onChange={(t) => {
            setType(t);
            setErrors((x) => ({ ...x, type: undefined }));
            requestAnimationFrame(() => titleRef.current?.focus());
          }}
        />

        <Field label="Title" error={errors.title} aside={`${title.length}/${TITLE_MAX}`}>
          <Input
            ref={titleRef}
            value={title}
            maxLength={TITLE_MAX}
            placeholder="Sum it up in one line"
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                bodyRef.current?.focus();
              }
            }}
          />
        </Field>
        <Similar posts={debounced.trim().length >= 8 ? (similar.data ?? []) : []} onOpen={onClose} />

        <Field label="Details" optional error={errors.body}>
          <Textarea
            ref={bodyRef}
            rows={5}
            value={body}
            maxLength={BODY_MAX}
            placeholder="What happened, what you expected, and any workaround. Markdown works."
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>

        <p className="m-0 hidden text-center text-sm text-ink-muted max-sm:block">You’ll follow this post automatically</p>
        {failure ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {failure}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

function SelectedBoard({ board, onChange }: { board: Board; onChange: () => void }) {
  return (
    <div className="flex h-8 items-center gap-3 rounded-md border border-line-strong bg-card pr-1 pl-2">
      <BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="sm" decorative />
      <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{board.name}</span>
      <Button variant="ghost" size="sm" onClick={onChange}>
        Change
      </Button>
    </div>
  );
}

function HubPicks({ hubName, boards, onPick }: { hubName: string; boards: Board[]; onPick: (b: Board) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-ink-muted">Which {hubName} product is this about?</span>
      <div className="flex flex-wrap gap-2">
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onPick(b)}
            className="inline-flex h-7 items-center gap-2 rounded-pill border border-line bg-card pr-3 pl-1 text-sm font-medium text-ink transition-colors duration-120 hover:border-line-strong hover:bg-subtle"
          >
            <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="xs" decorative />
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Product search: type to filter boards by name or tagline; arrows and Enter pick. */
const BoardCombobox = function BoardCombobox({
  ref,
  boards,
  loading,
  onPick,
}: {
  ref: Ref<HTMLInputElement>;
  boards: Board[];
  loading: boolean;
  onPick: (b: Board) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const listId = useId();
  const term = q.trim();
  const items = useMemo(() => (term ? boards.filter((b) => matchesAll(`${b.name} ${b.tagline}`, term)) : boards).slice(0, 6), [boards, term]);
  const active = Math.min(hl, Math.max(items.length - 1, 0));
  const shown = open && term.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown) {
        if (term) setOpen(true);
        return;
      }
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHl((active + d + items.length) % Math.max(items.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = shown ? items[active] : undefined;
      if (pick) onPick(pick);
    } else if (e.key === 'Escape' && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label className="flex h-8 items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-ink-muted focus-within:border-ink-muted">
        <Icon name="search" size={15} />
        <input
          ref={ref}
          type="text"
          role="combobox"
          aria-label="Product"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && items[active] ? `${listId}-${items[active].id}` : undefined}
          placeholder={loading ? 'Loading products…' : 'Enter product name'}
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHl(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 appearance-none border-0 bg-transparent text-base text-ink outline-none focus-visible:outline-none max-md:text-md"
        />
      </label>
      {shown ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Products"
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-line bg-card py-1 shadow-overlay"
        >
          {items.length ? (
            items.map((b, i) => (
              <button
                key={b.id}
                id={`${listId}-${b.id}`}
                type="button"
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                onClick={() => onPick(b)}
                onMouseEnter={() => setHl(i)}
                className="flex w-full items-center gap-3 border-0 bg-transparent px-3 py-2 text-left aria-selected:bg-subtle"
              >
                <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="md" decorative />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-semibold text-ink">{b.name}</span>
                  <span className="truncate text-sm text-ink-muted">{b.tagline}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="m-0 px-3 py-3 text-sm text-ink-muted">No products match “{term}”.</p>
          )}
        </div>
      ) : null}
    </div>
  );
};

function TypeField({
  triggerRef,
  value,
  error,
  onChange,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  value: PostType | null;
  error?: string | undefined;
  onChange: (t: PostType) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-semibold text-ink">
        Type
      </span>
      <Menu
        label="Type"
        fullWidth
        trigger={(p) => (
          <button
            type="button"
            {...p}
            ref={(el) => {
              triggerRef.current = el;
              if (typeof p.ref === 'function') p.ref(el);
              else if (p.ref && typeof p.ref === 'object') (p.ref as RefObject<HTMLButtonElement | null>).current = el;
            }}
            aria-labelledby={`${labelId} ${p.id}`}
            aria-invalid={error ? true : undefined}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-left text-base text-ink transition-colors duration-120 aria-expanded:border-ink-muted aria-invalid:border-danger"
          >
            {value ? (
              <span className="inline-flex flex-1 items-center gap-2">
                <TypeDot type={value} />
                {TYPE_META[value].label}
              </span>
            ) : (
              <span className="flex-1 text-ink-muted">Choose a type</span>
            )}
            <span className="text-ink-muted">
              <Icon name="chevron-down" size={16} />
            </span>
          </button>
        )}
      >
        {TYPES.map((t) => (
          <MenuItemRadio key={t.value} checked={value === t.value} description={t.desc} onSelect={() => onChange(t.value)}>
            <span className="inline-flex items-center gap-2">
              <TypeDot type={t.value} />
              {TYPE_META[t.value].label}
            </span>
          </MenuItemRadio>
        ))}
      </Menu>
      {error ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TypeDot({ type }: { type: PostType }) {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true" className={TYPE_META[type].dot}>
      <circle cx="3" cy="3" r="3" fill="currentColor" />
    </svg>
  );
}

/** "Already posted?" Upvote instead of posting a duplicate (mockup). */
function Similar({ posts, onOpen }: { posts: Post[]; onOpen: () => void }) {
  if (posts.length === 0) return null;
  return (
    <section aria-live="polite" aria-label="Similar posts" className="-mt-3 rounded-md border border-line bg-elevated px-3 py-2">
      <p className="mt-0 mb-1 text-sm font-semibold text-ink">
        Already posted? <span className="font-normal text-ink-muted">Upvote to add your voice, it counts the same.</span>
      </p>
      <ul className="m-0 list-none p-0">
        {posts.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
            <Link to={`/post/${p.id}`} onClick={onOpen} className="flex min-w-0 flex-1 flex-col text-ink no-underline hover:underline">
              <span className="text-base font-medium">{p.title}</span>
              <span className="text-xs text-ink-muted">
                {p.status !== 'open' ? `${STATUS_META[p.status].label} · ` : ''}
                {p.board?.name ?? ''} · {p.reply_count} {p.reply_count === 1 ? 'reply' : 'replies'}
              </span>
            </Link>
            <VoteButton post={p} size="sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}

