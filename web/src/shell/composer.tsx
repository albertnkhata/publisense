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
  recordEvent,
  isLive,
  isPostable,
  isSourceUrl,
  logoSrc,
  matchesAll,
  TITLE_MAX,
  TITLE_MIN,
  TITLE_TOO_LONG,
  TITLE_TOO_SHORT,
  useBoards,
  useCreatePost,
  useHubs,
  useIsPlatformAdmin,
  useSimilarPosts,
  validatePost,
  type Board,
  type Post,
  type PostErrors,
  type Platform,
  type PostType,
  sourceAuthorFromUrl,
  sourceLabel,
} from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { PlatformField } from '../posts/PlatformField';
import { VoteButton } from '../posts/VoteButton';
import { BoardAvatar, Button, Dialog, Field, Icon, Input, STATUS_META, TYPE_META, useToast } from '../ui';
import { useRequireAuth } from './auth';
import { useAddProduct } from '../products/AddProductDialog';

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
  /** Just added this board (Add a product): ask "What do you want to tell them?". */
  firstPost?: boolean;
  /** Offer "Is this your product? Claim it" (the adder's email is on the product's domain). */
  onClaim?: () => void;
  /** Staff: open on "From a source" (a seeded post with a link back, no author). */
  seed?: boolean;
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
        opts && typeof opts === 'object' && !('nativeEvent' in opts)
          ? { board: opts.board, hub: opts.hub, title: opts.title, firstPost: opts.firstPost, onClaim: opts.onClaim, seed: opts.seed }
          : {};
      recordEvent('composer_open');
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
  { value: 'friction', desc: 'It works, but it’s harder than it should be' },
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
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [title, setTitle] = useState(opts.title ?? '');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<PostErrors & { board?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  // Staff only: post as yourself, or seed one from a public source (0028).
  const isAdmin = useIsPlatformAdmin(viewer?.id ?? null).data === true;
  const [mode, setMode] = useState<'me' | 'source'>(opts.seed ? 'source' : 'me');
  const seeding = isAdmin && mode === 'source';
  const [sourceUrl, setSourceUrl] = useState('');
  const [postedOn, setPostedOn] = useState('');
  // Who first raised it: filled from an X link until staff type their own (0032).
  const [typedWho, setTypedWho] = useState<string | null>(null);
  const sourceAuthor = typedWho ?? sourceAuthorFromUrl(sourceUrl) ?? '';
  const [sourceError, setSourceError] = useState<string | undefined>();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const productRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const titleId = useId();
  const detailsId = useId();
  const titleErrorId = useId();

  const viewerId = viewer?.id ?? null;
  const postable = useMemo(
    () => (boards.data ?? []).filter((b) => (seeding ? isLive(b) || b.status === 'pending' : isPostable(b, viewerId))),
    [boards.data, viewerId, seeding],
  );
  const board = postable.find((b) => b.slug === boardSlug) ?? null;
  const pendingBoard = board?.status === 'pending';
  const hub = opts.hub ? (hubs.data?.find((h) => h.slug === opts.hub) ?? null) : null;

  // Similar posts look on the chosen board, or across the hub before one is chosen.
  const similarBoards = board ? [board.id] : hub ? hub.boards.map((b) => b.id) : [];
  const [debounced, setDebounced] = useState(title);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(title), 180);
    return () => clearTimeout(t);
  }, [title]);
  const similar = useSimilarPosts(debounced, similarBoards, viewer?.id ?? null);

  // Why Post is disabled, said next to it (#171). One reason at a time, in form order.
  const titleLength = title.trim().length;
  const titleTooLong = titleLength > TITLE_MAX;
  const blocker = !board
    ? 'Choose a product to post.'
    : !type
      ? 'Choose a type to post.'
      : !titleLength
        ? 'Add a title to post.'
        : titleLength < TITLE_MIN
          ? TITLE_TOO_SHORT
          : titleTooLong
            ? TITLE_TOO_LONG
            : seeding && !sourceUrl.trim()
              ? 'Paste the source link to post.'
              : null;
  const valid = !blocker;
  const blockerId = useId();
  // Over the limit is said at the field the moment it happens; the paste is kept so it can be shortened.
  const titleError = titleTooLong ? TITLE_TOO_LONG : errors.title;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (create.isPending) return;
    const found: PostErrors & { board?: string } = validatePost({ type: type ?? ('' as PostType), title, body });
    if (!board) found.board = 'Choose the product this is about.';
    if (!type) found.type = 'Choose a type.';
    setErrors(found);
    const badSource = seeding && !isSourceUrl(sourceUrl) ? 'Paste the full https link to the original post.' : undefined;
    setSourceError(badSource);
    if (Object.keys(found).length || badSource || !board || !type) return;
    setFailure(null);
    create.mutate(
      seeding ? { boardId: board.id, type, title, body, platform, sourceUrl, postedOn: postedOn || null, sourceAuthor: sourceAuthor || null }
        : { boardId: board.id, type, title, body, platform },
      {
        onSuccess: (post) => {
          onClose();
          toast(seeding ? `Added to ${board.name} from ${sourceLabel(sourceUrl)}` : `Posted to ${board.name}`);
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

  const initialFocus = board ? titleRef : productRef;
  const footNote = seeding
    ? `Shows as the board’s post, from ${isSourceUrl(sourceUrl) ? sourceLabel(sourceUrl) : 'the source'}, with no author`
    : 'You’ll follow this post automatically';

  return (
    <Dialog
      open
      onClose={onClose}
      title={seeding ? 'Add feedback from a source' : opts.firstPost ? 'What do you want to tell them?' : 'Post feedback'}
      {...(pendingBoard && board
        ? { description: `${board.name} is waiting for review. Until it’s approved, only you can see it and what you post on it.` }
        : {})}
      size="lg"
      initialFocus={initialFocus}
      dismissable={!create.isPending && !(title.trim().length > 0 || body.trim().length > 0)}
      footer={
        <div className="flex w-full items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
          {blocker ? (
            <span id={blockerId} role="status" className="mr-auto text-sm text-ink-muted max-sm:mr-0 max-sm:text-center">
              {blocker}
            </span>
          ) : (
            <span className="mr-auto text-sm text-ink-muted max-sm:hidden">{footNote}</span>
          )}
          <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:*:flex-1">
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={!valid} aria-describedby={blocker ? blockerId : undefined} loading={create.isPending}>
              {seeding ? 'Add post' : 'Post'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={submit} onKeyDown={onSubmitKey} className="flex flex-col gap-3">
        {opts.onClaim && board ? (
          <p className="m-0 flex flex-wrap items-center gap-x-2 rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink-secondary">
            Is this your product?
            <button
              type="button"
              onClick={() => {
                onClose();
                opts.onClaim?.();
              }}
              className="border-0 bg-transparent p-0 font-semibold text-brand underline-offset-3 hover:underline"
            >
              Claim it
            </button>
            <span className="text-ink-muted">to reply as its verified team.</span>
          </p>
        ) : null}
        {isAdmin ? (
          <div role="group" aria-label="Post as" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">Post as</span>
            {(
              [
                ['me', 'You'],
                ['source', 'From a source'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setFailure(null);
                }}
                className={cx(
                  'inline-flex h-7 items-center rounded-pill border px-3 text-sm font-medium transition-colors duration-120',
                  mode === m ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-subtle',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {board ? (
          <SelectedBoard board={board} onChange={() => setBoardSlug(null)} />
        ) : (
          <Field label="Product" error={errors.board}>
            {boardSlug && boards.isPending ? (
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
                      requestAnimationFrame(() => titleRef.current?.focus());
                    }}
                  />
                ) : null}
                <BoardCombobox
                  ref={productRef}
                  boards={postable}
                  onAdd={onClose}
                  loading={boards.isPending}
                  onPick={(b) => {
                    setBoardSlug(b.slug);
                    setErrors((x) => ({ ...x, board: undefined }));
                    requestAnimationFrame(() => titleRef.current?.focus());
                  }}
                />
              </>
            )}
          </Field>
        )}

        {seeding ? (
          <div className="flex flex-col gap-5 sm:flex-row">
            <Field label="Source link" error={sourceError} className="min-w-0 flex-1">
              <Input
                type="url"
                inputMode="url"
                value={sourceUrl}
                placeholder="https://github.com/org/repo/issues/123"
                autoComplete="off"
                onChange={(e) => {
                  setSourceUrl(e.target.value);
                  setSourceError(undefined);
                }}
              />
            </Field>
            <Field label="Originally posted" optional>
              <Input type="date" value={postedOn} max={today} onChange={(e) => setPostedOn(e.target.value)} />
            </Field>
          </div>
        ) : null}
        {seeding ? (
          <Field label="Original poster" optional hint="Credited on the card as “@name on X”, linking to the original.">
              <Input
                value={sourceAuthor}
                placeholder="@handle or u/name"
                maxLength={80}
                autoComplete="off"
                onChange={(e) => setTypedWho(e.target.value)}
              />
          </Field>
        ) : null}

        <div
          className={cx(
            'overflow-hidden rounded-md border bg-card transition-colors duration-120 focus-within:border-ink-muted',
            titleError ? 'border-danger focus-within:border-danger' : 'border-line-strong',
          )}
        >
          <div className="flex items-center justify-between pr-3">
            <input
              id={titleId}
              ref={titleRef}
              value={title}
              aria-label="Title"
              aria-invalid={titleTooLong || Boolean(errors.title) || undefined}
              aria-describedby={titleError ? titleErrorId : undefined}
              placeholder="Sum it up in one line"
              autoComplete="off"
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((x) => ({ ...x, title: undefined }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  bodyRef.current?.focus();
                }
              }}
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-base font-semibold text-ink placeholder:font-normal placeholder:text-ink-muted outline-none focus:outline-none"
            />
            <span className="shrink-0 text-xs text-ink-muted tabular-nums">
              {titleLength}/{TITLE_MAX}
            </span>
          </div>
          {titleError ? (
            <p id={titleErrorId} role="alert" className="m-0 px-3 pb-2 text-sm text-danger">
              {titleError}
            </p>
          ) : null}

          <div className="h-px w-full bg-line" />

          <textarea
            id={detailsId}
            ref={bodyRef}
            rows={3}
            value={body}
            maxLength={BODY_MAX}
            aria-label="Details"
            placeholder="What happened, what you expected, and any workaround. Markdown works."
            onChange={(e) => setBody(e.target.value)}
            className="w-full resize-y border-0 bg-transparent px-3 py-2 text-base text-ink placeholder:text-ink-muted outline-none focus:outline-none"
          />
          {errors.body ? (
            <p role="alert" className="m-0 px-3 pb-2 text-sm text-danger">
              {errors.body}
            </p>
          ) : null}
        </div>

        <Similar posts={debounced.trim().length >= 8 ? (similar.data ?? []) : []} onOpen={onClose} />

        <TypeField
          triggerRef={typeRef}
          value={type}
          error={errors.type}
          onChange={(t) => {
            setType(t);
            setErrors((x) => ({ ...x, type: undefined }));
          }}
        />

        <PlatformField value={platform} onChange={setPlatform} inline />

        <p className="m-0 hidden text-center text-sm text-ink-muted max-sm:block">{footNote}</p>
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
    <div className="flex h-8 items-center justify-between gap-3 rounded-md border border-line bg-subtle pr-1 pl-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xs font-semibold uppercase text-ink-muted">Product</span>
        <BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="xs" decorative />
        <span className="truncate text-sm font-semibold text-ink">{board.name}</span>
      </div>
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
  onAdd,
}: {
  ref: Ref<HTMLInputElement>;
  boards: Board[];
  loading: boolean;
  onPick: (b: Board) => void;
  /** Called before "Add a product" opens its own dialog (the composer closes). */
  onAdd: () => void;
}) {
  const addProduct = useAddProduct();
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
          {addProduct ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                onAdd();
                addProduct.openAddProduct({ prefill: term });
              }}
              className="flex w-full items-center gap-3 border-0 border-t border-solid border-line bg-transparent px-3 py-2 text-left text-sm font-semibold text-brand hover:bg-subtle"
            >
              <span className="grid size-7 shrink-0 place-items-center">
                <Icon name="plus" size={15} />
              </span>
              {items.length ? 'Not listed? Add a product' : `Add “${term}” as a product`}
            </button>
          ) : null}
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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span id={labelId} className="shrink-0 mr-1 text-xs font-semibold uppercase text-ink-muted">
          Type
        </span>
        <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {TYPES.map((t, i) => {
            const selected = value === t.value;
            return (
              <button
                key={t.value}
                ref={i === 0 ? triggerRef : undefined}
                type="button"
                role="radio"
                aria-checked={selected}
                title={t.desc}
                onClick={() => onChange(t.value)}
                className={cx(
                  'inline-flex h-7 items-center gap-2 rounded-pill border px-3 text-sm font-medium transition-colors duration-120 cursor-pointer',
                  selected
                    ? 'border-ink bg-subtle text-ink font-semibold'
                    : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink hover:bg-subtle',
                )}
              >
                <TypeDot type={t.value} />
                <span>{TYPE_META[t.value].label}</span>
              </button>
            );
          })}
        </div>
      </div>
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
    <section aria-live="polite" aria-label="Similar posts" className="-mt-3 animate-fade-in rounded-md border border-line bg-elevated px-3 py-2">
      <p className="mt-0 mb-1 text-sm font-semibold text-ink">
        Already posted? <span className="font-normal text-ink-muted">Upvote to add your voice, it counts the same.</span>
      </p>
      <ul className="m-0 max-h-list list-none overflow-y-auto p-0">
        {posts.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
            <Link to={`/post/${p.id}`} onClick={() => { recordEvent('similar_post_click', { boardId: p.board_id }); onOpen(); }} className="flex min-w-0 flex-1 flex-col text-ink no-underline hover:underline">
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

