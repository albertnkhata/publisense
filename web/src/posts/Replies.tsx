import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  avatarSrc,
  boardLogoSrc,
  buildThreads,
  REPLY_MAX,
  replyEditLockReason,
  replyPath,
  shortAge,
  useCreateReply,
  useDeleteReply,
  useHideReply,
  useIsBoardTeam,
  useIsPlatformAdmin,
  useReplies,
  useUpdateReply,
  validateReply,
  type FeedSort,
  type Post,
  type Reply,
  type ReplyThread,
} from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { useRequireAuth } from '../shell/auth';
import {
  BoardAvatar,
  Button,
  Icon,
  Menu,
  MenuItemRadio,
  MenuLabel,
  Select,
  SkeletonBlock,
  Textarea,
  UserAvatar,
  useToast,
} from '../ui';
import { ConfirmDialog } from './dialogs';
import { ReportDialog } from './ReportDialog';
import { TeamByline, teamLabel } from './TeamByline';

/**
 * The reply thread on a post page. Replies nest at any depth, Twitter/X-style
 * (0050; Albert, 2026-10-27): the tree is indented up to MAX_DEPTH levels, and a
 * deeper branch opens on its own ("Continue this thread", ?thread=<reply id>), so
 * phones stay readable. Official replies are not pinned. Replies have no votes in
 * v2, so "Top" means most discussed. #reply-<id> in the URL (notification links)
 * scrolls to that reply and highlights it.
 */
const MAX_DEPTH = 3;
const REPLY_HASH = /^#reply-([0-9a-f-]{36})$/i;
const REPLY_SORTS: Array<{ value: FeedSort; label: string; hint: string }> = [
  { value: 'top', label: 'Top', hint: 'Most discussed' },
  { value: 'new', label: 'New', hint: 'Most recent first' },
];

const actClass =
  'inline-flex h-6 max-sm:h-7 items-center gap-1 rounded-sm border-0 bg-transparent px-2 max-sm:px-3 text-sm font-medium text-ink-secondary ' +
  'transition-colors duration-120 ease-out hover:bg-subtle hover:text-ink';
/** An action the rules don't allow right now (reply Edit after the window, 0051): it
 *  stays focusable and says why, but looks and acts disabled. */
const lockedActClass =
  'inline-flex h-6 max-sm:h-7 items-center gap-1 rounded-sm border-0 bg-transparent px-2 max-sm:px-3 text-sm font-medium text-ink-secondary ' +
  'cursor-default opacity-45';

export function ReplySection({ post }: { post: Post }) {
  const replies = useReplies(post.id);
  const [sort, setSort] = useState<FeedSort>('top');
  const threads = useMemo(() => buildThreads(replies.data ?? [], sort), [replies.data, sort]);
  const current = REPLY_SORTS.find((s) => s.value === sort) ?? REPLY_SORTS[0];
  const closed = post.status === 'merged' || Boolean(post.hidden_at);
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusId = params.get('thread');
  const focusPath = useMemo(() => (focusId ? replyPath(threads, focusId) : []), [threads, focusId]);
  const focused = focusPath.length ? focusPath[focusPath.length - 1] : null;
  const shown = focused ? [focused] : threads;
  const target = REPLY_HASH.exec(location.hash)?.[1]?.toLowerCase() ?? null;
  const [highlight, setHighlight] = useState<string | null>(null);

  // A notification link (#reply-<id>): open the branch it sits in if it's deeper
  // than the page shows, then scroll to it and highlight it for a moment.
  useEffect(() => {
    if (!target || !replies.data) return;
    const path = replyPath(shown, target);
    if (path.length === 0) {
      const full = replyPath(threads, target);
      if (full.length === 0) return;
      const depth = full.length - 1;
      const branch = full[Math.max(0, depth - MAX_DEPTH)];
      if (depth > MAX_DEPTH && branch) {
        void navigate({ search: `?thread=${branch.reply.id}`, hash: location.hash }, { replace: true });
      } else if (focused) {
        void navigate({ search: '', hash: location.hash }, { replace: true });
      }
      return;
    }
    if (path.length - 1 > MAX_DEPTH) {
      const branch = path[path.length - 1 - MAX_DEPTH];
      if (branch) void navigate({ search: `?thread=${branch.reply.id}`, hash: location.hash }, { replace: true });
      return;
    }
    const el = document.getElementById(`reply-${target}`);
    if (!el) return;
    el.scrollIntoView?.({ block: 'center' });
    setHighlight(target);
    const t = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, replies.data, focusId]);

  return (
    <section id="replies" aria-label="Replies" className="scroll-mt-6 rounded-md border border-line bg-card px-5 py-4 max-sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-sm font-semibold text-ink-muted uppercase">
          {post.reply_count} {post.reply_count === 1 ? 'reply' : 'replies'}
        </h2>
        <Menu
          align="end"
          label="Sort replies"
          trigger={(p) => (
            <button
              type="button"
              {...p}
              aria-label={`Sort replies: ${current?.label}`}
              className="inline-flex items-center gap-1 rounded-sm border-0 bg-transparent py-1 pr-1 pl-2 text-sm font-semibold text-ink-secondary hover:bg-subtle hover:text-ink aria-expanded:bg-subtle"
            >
              {current?.label}
              <Icon name="chevron-down" size={14} />
            </button>
          )}
        >
          <MenuLabel>Sort by</MenuLabel>
          {REPLY_SORTS.map((s) => (
            <MenuItemRadio key={s.value} checked={s.value === sort} description={s.hint} onSelect={() => setSort(s.value)}>
              {s.label}
            </MenuItemRadio>
          ))}
        </Menu>
      </div>

      {closed || focused ? null : (
        <div className="mt-3">
          <ReplyComposer post={post} parentId={null} />
        </div>
      )}

      {focused ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Link to={{ search: '', hash: '#replies' }} className="inline-flex items-center gap-1 font-medium text-ink-secondary no-underline hover:text-ink">
            <Icon name="arrow-left" size={14} />
            All replies
          </Link>
          {focusPath.length > 1 ? (
            <span className="text-ink-muted">
              Part of a longer thread.{' '}
              <Link
                to={{ search: focusPath.length > 2 ? `?thread=${focusPath[Math.max(0, focusPath.length - 1 - MAX_DEPTH)]?.reply.id ?? ''}` : '', hash: `#reply-${focused.reply.id}` }}
                className="font-medium text-ink-secondary hover:text-ink"
              >
                Show earlier replies
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}

      {replies.isPending ? (
        <div role="status" aria-label="Loading replies" className="mt-4 flex flex-col gap-3">
          <SkeletonBlock className="h-3 w-1/3" />
          <SkeletonBlock className="h-3 w-3/4" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>
      ) : replies.isError ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-ink-muted">
          <span>We couldn’t load the replies.</span>
          <Button variant="secondary" size="sm" onClick={() => void replies.refetch()}>
            Try again
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-4 mb-1 text-sm text-ink-muted">
          {focusId ? 'This reply isn’t here any more.' : 'No replies yet. Add what you know, a workaround or a +1 with your use case.'}
        </p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col p-0">
          {shown.map((t) => (
            <li key={t.reply.id} className="border-t border-line py-4 first:border-t-0">
              <ThreadNode post={post} node={t} depth={0} highlight={highlight} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One reply and, up to MAX_DEPTH, the replies to it; deeper branches open on their own. */
function ThreadNode({ post, node, depth, highlight }: { post: Post; node: ReplyThread; depth: number; highlight: string | null }) {
  return (
    <>
      <ReplyItem post={post} reply={node.reply} nested={depth > 0} childCount={node.total} highlighted={highlight === node.reply.id} />
      {node.children.length ? (
        depth < MAX_DEPTH ? (
          <ul aria-label={`Replies to this reply`} className="m-0 mt-3 ml-3 flex list-none flex-col gap-3 border-0 border-l border-solid border-line p-0 pl-3 sm:ml-4 sm:pl-4">
            {node.children.map((c) => (
              <li key={c.reply.id}>
                <ThreadNode post={post} node={c} depth={depth + 1} highlight={highlight} />
              </li>
            ))}
          </ul>
        ) : (
          <Link
            to={{ search: `?thread=${node.reply.id}`, hash: `#reply-${node.children[0]?.reply.id ?? node.reply.id}` }}
            className="mt-2 ml-gutter inline-flex items-center gap-1 text-sm font-medium text-brand no-underline hover:underline"
          >
            Continue this thread ({node.total} {node.total === 1 ? 'reply' : 'replies'})
            <Icon name="chevron-right" size={14} />
          </Link>
        )
      ) : null}
    </>
  );
}

/**
 * Reply text with @mentions as links: the board's slug goes to the board (its
 * team is notified), any other @handle to that person's profile.
 */
function ReplyBody({ post, body }: { post: Post; body: string }) {
  const parts: ReactNode[] = [];
  const re = /(^|[^A-Za-z0-9_@./-])@([A-Za-z0-9_]{1,40})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const start = m.index + (m[1]?.length ?? 0);
    const handle = (m[2] ?? '').toLowerCase();
    parts.push(body.slice(last, start));
    const toBoard = post.board && handle === post.board.slug;
    parts.push(
      <Link
        key={start}
        to={toBoard ? `/b/${handle}` : `/u/${handle}`}
        className="font-medium text-brand no-underline hover:underline hover:underline-offset-2"
      >
        @{m[2]}
      </Link>,
    );
    last = start + 1 + (m[2]?.length ?? 0);
  }
  parts.push(body.slice(last));
  return (
    <p className="mt-1 mb-0 text-md text-ink whitespace-pre-line wrap-break-word">
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </p>
  );
}

function ReplyAuthor({ post, reply, nested }: { post: Post; reply: Reply; nested?: boolean }) {
  const size = nested ? 'sm' : 'md';
  if (reply.is_official && post.board) {
    return <BoardAvatar name={post.board.name} color={post.board.color} logoSrc={boardLogoSrc(post.board)} size={size} decorative />;
  }
  return reply.author ? (
    <Link to={`/u/${reply.author.handle}`} tabIndex={-1} aria-hidden="true">
      <UserAvatar src={avatarSrc(reply.author)} size={size} />
    </Link>
  ) : (
    <UserAvatar size={size} />
  );
}

function ReplyItem({
  post,
  reply,
  nested,
  childCount = 0,
  highlighted,
}: {
  post: Post;
  reply: Reply;
  nested?: boolean;
  childCount?: number;
  highlighted?: boolean;
}) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'view' | 'edit' | 'reply'>('view');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = useDeleteReply(post.id);
  const hide = useHideReply(post.id);
  const team = useIsBoardTeam(post.board_id, viewer?.id ?? null);
  const staff = useIsPlatformAdmin(viewer?.id ?? null);
  const [reporting, setReporting] = useState(false);
  const isAuthor = Boolean(viewer && reply.author_id === viewer.id);
  // Authors edit within the rules of 0051 (#181) and 0053 (official replies only while
  // still on the team; unknown until the team check answers); the DB enforces them too.
  const editLock = isAuthor
    ? replyEditLockReason(reply, post, undefined, team.isSuccess ? Boolean(team.data) : undefined)
    : null;
  const lockId = useId();
  const closed = post.status === 'merged' || Boolean(post.hidden_at);
  const canHide = Boolean(team.data || staff.data);
  const toggleHidden = () => {
    const hidden = !reply.hidden_at;
    hide.mutate(
      { replyId: reply.id, hidden },
      {
        onSuccess: () => toast(hidden ? 'Reply hidden' : 'Reply visible again'),
        onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };

  let who: ReactNode;
  if (reply.is_official && post.board) {
    who = <TeamByline name={post.board.name} />;
  } else if (reply.author) {
    who = (
      <Link to={`/u/${reply.author.handle}`} className="font-semibold text-ink no-underline hover:underline hover:underline-offset-2">
        @{reply.author.handle}
      </Link>
    );
  } else {
    who = <span className="font-medium text-ink-muted italic">deleted user</span>;
  }

  return (
    <article
      id={`reply-${reply.id}`}
      aria-label={`Reply by ${reply.is_official && post.board ? teamLabel(post.board.name) : reply.author ? '@' + reply.author.handle : 'deleted user'}`}
      aria-current={highlighted ? 'true' : undefined}
      className={cx(
        'relative scroll-mt-24 rounded-sm pl-gutter transition-colors duration-500 ease-out',
        highlighted && 'bg-brand-soft',
      )}
    >
      <span className="absolute top-0 left-0">
        <ReplyAuthor post={post} reply={reply} {...(nested ? { nested } : {})} />
      </span>
      <div className="flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        {who}
        <span aria-hidden="true">·</span>
        <time dateTime={reply.created_at}>{shortAge(reply.created_at)}</time>
        {reply.edited_at ? (
          <>
            <span aria-hidden="true">·</span>
            <span>edited</span>
          </>
        ) : null}
        {reply.hidden_at ? (
          <>
            <span aria-hidden="true">·</span>
            <span>Hidden by the team</span>
          </>
        ) : null}
      </div>

      {mode === 'edit' ? (
        <EditReply postId={post.id} reply={reply} onDone={() => setMode('view')} />
      ) : (
        <ReplyBody post={post} body={reply.body} />
      )}

      {mode !== 'edit' ? (
        <div className="mt-1 -ml-2 flex flex-wrap items-center gap-1">
          {closed ? null : (
            <button
              type="button"
              className={actClass}
              aria-expanded={mode === 'reply'}
              onClick={() => {
                if (!requireAuth('reply')) return;
                setMode(mode === 'reply' ? 'view' : 'reply');
              }}
            >
              Reply
            </button>
          )}
          {isAuthor ? (
            <>
              {editLock ? (
                // 0051: still focusable so the reason reaches keyboard and screen-reader users.
                <>
                  <button
                    type="button"
                    className={lockedActClass}
                    aria-disabled="true"
                    aria-describedby={lockId}
                    title={editLock}
                    onClick={() => toast(editLock)}
                  >
                    Edit
                  </button>
                  <span id={lockId} className="sr-only">
                    {editLock}
                  </span>
                </>
              ) : (
                <button type="button" className={actClass} onClick={() => setMode('edit')}>
                  Edit
                </button>
              )}
              <button
                type="button"
                className={cx(actClass, 'hover:text-danger')}
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
              >
                Delete
              </button>
            </>
          ) : null}
          {canHide ? (
            <button type="button" className={actClass} onClick={toggleHidden} disabled={hide.isPending}>
              {reply.hidden_at ? 'Unhide' : 'Hide'}
            </button>
          ) : null}
          {!isAuthor && !reply.is_official ? (
            <button
              type="button"
              className={cx(actClass, 'hover:text-danger')}
              onClick={() => {
                if (!requireAuth('report replies')) return;
                setReporting(true);
              }}
            >
              Report
            </button>
          ) : null}
        </div>
      ) : null}
      {reporting ? <ReportDialog target="reply" id={reply.id} subject={reply.body} open onClose={() => setReporting(false)} /> : null}

      {mode === 'reply' ? (
        <div className="mt-3">
          <ReplyComposer
            post={post}
            parentId={reply.id}
            autoFocus
            onDone={() => setMode('view')}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Delete this reply?"
        confirmLabel="Delete reply"
        busy={del.isPending}
        error={error}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          del.mutate(reply.id, {
            onSuccess: () => {
              setConfirming(false);
              toast('Reply deleted');
            },
            onError: (e) => setError(e instanceof Error ? e.message : 'We couldn’t delete this reply. Try again.'),
          })
        }
      >
        {childCount > 0
          ? `The ${childCount === 1 ? 'reply' : `${childCount} replies`} to it will be deleted too. You can’t undo this.`
          : 'You can’t undo this.'}
      </ConfirmDialog>
    </article>
  );
}

function EditReply({ postId, reply, onDone }: { postId: string; reply: Reply; onDone: () => void }) {
  const { toast } = useToast();
  const update = useUpdateReply(postId);
  const [body, setBody] = useState(reply.body);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const save = () => {
    const problem = validateReply(body);
    if (problem) return setError(problem);
    if (body.trim() === reply.body) return onDone();
    setError(null);
    update.mutate(
      { id: reply.id, body },
      {
        onSuccess: () => {
          toast('Reply updated');
          onDone();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'We couldn’t save your reply. Try again.'),
      },
    );
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        Edit reply
      </label>
      <Textarea
        id={id}
        rows={3}
        value={body}
        maxLength={REPLY_MAX}
        autoFocus
        aria-invalid={error ? true : undefined}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
      />
      {error ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} loading={update.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}

/**
 * "Add a reply…": collapsed until focused (signed out, focusing opens sign-in).
 * ⌘/Ctrl+Enter sends. A reply follows the post, as in the mockup.
 */
export function ReplyComposer({
  post,
  parentId,
  initial = '',
  autoFocus,
  onDone,
}: {
  post: Post;
  parentId: string | null;
  initial?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const create = useCreateReply(post, viewer?.id ?? null);
  // Team members choose who they reply as, at every level (mockup "Reply as"); the DB checks it.
  const team = useIsBoardTeam(post.board_id, viewer?.id ?? null);
  // Their own handle unless they pick the team: nothing posts as the team by default
  // (Albert, 2026-10-27: no automatic team voice).
  const [choice, setChoice] = useState<'team' | 'me'>('me');
  const asTeam = Boolean(team.data) && choice === 'team';
  const [body, setBody] = useState(initial);
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const reset = () => {
    setBody('');
    setError(null);
    setOpen(false);
    setChoice('me');
    onDone?.();
  };

  const send = () => {
    if (!requireAuth('reply')) return;
    const problem = validateReply(body);
    if (problem) return setError(problem);
    setError(null);
    create.mutate(
      { body, parentId, official: asTeam },
      {
        onSuccess: () => {
          toast(asTeam ? 'Official reply posted' : 'Reply posted');
          reset();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'We couldn’t post your reply. Try again.'),
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && onDone) {
      e.stopPropagation();
      reset();
    }
  };

  return (
    <div className="relative pl-gutter">
      <span className="absolute top-1 left-0">
        {asTeam && post.board ? (
          <BoardAvatar name={post.board.name} color={post.board.color} logoSrc={boardLogoSrc(post.board)} size={parentId ? 'sm' : 'md'} decorative />
        ) : (
          <UserAvatar src={viewer?.avatarUrl ?? null} size={parentId ? 'sm' : 'md'} />
        )}
      </span>
      <label htmlFor={id} className="sr-only">
        {parentId ? 'Reply to this thread' : 'Add a reply'}
      </label>
      <Textarea
        ref={ref}
        id={id}
        rows={open ? 3 : 1}
        value={body}
        maxLength={REPLY_MAX}
        placeholder="Add a reply…"
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        onFocus={() => {
          if (!requireAuth('reply')) {
            ref.current?.blur();
            return;
          }
          setOpen(true);
        }}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {error ? (
        <p role="alert" className="mt-2 mb-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {open ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          {team.data && post.board ? (
            <label className="mr-auto flex items-center gap-2 text-sm text-ink-muted">
              Reply as
              <Select
                value={asTeam ? 'team' : 'me'}
                onChange={(e) => setChoice(e.target.value === 'team' ? 'team' : 'me')}
               
                aria-label="Reply as"
              >
                <option value="me">{viewer ? `@${viewer.handle}` : 'You'}</option>
                <option value="team">{teamLabel(post.board.name)}</option>
              </Select>
            </label>
          ) : null}
          <Button variant="ghost" size="sm" onClick={reset} disabled={create.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={send} loading={create.isPending} disabled={!body.trim()}>
            Reply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
