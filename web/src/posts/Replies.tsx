import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  avatarSrc,
  boardLogoSrc,
  buildThreads,
  REPLY_MAX,
  shortAge,
  useCreateReply,
  useDeleteReply,
  useIsBoardTeam,
  useReplies,
  useUpdateReply,
  validateReply,
  type FeedSort,
  type Post,
  type Reply,
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
  TeamPill,
  Textarea,
  UserAvatar,
  useToast,
} from '../ui';
import { ConfirmDialog } from './dialogs';

/**
 * The reply thread on a post page (FOUNDATION §5 PostPage: replies one level
 * deep). Official replies are pinned. Replies have no votes in v2 (no table for
 * them), so the mockup's reply upvote is left out and "Top" means most discussed.
 */
const REPLY_SORTS: Array<{ value: FeedSort; label: string; hint: string }> = [
  { value: 'top', label: 'Top', hint: 'Most discussed' },
  { value: 'new', label: 'New', hint: 'Most recent first' },
];

const actClass =
  'inline-flex h-6 items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-sm font-medium text-ink-secondary ' +
  'transition-colors duration-120 ease-out hover:bg-subtle hover:text-ink';

export function ReplySection({ post }: { post: Post }) {
  const replies = useReplies(post.id);
  const [sort, setSort] = useState<FeedSort>('top');
  const { pinned, threads } = useMemo(() => buildThreads(replies.data ?? [], sort), [replies.data, sort]);
  const current = REPLY_SORTS.find((s) => s.value === sort) ?? REPLY_SORTS[0];
  const closed = post.status === 'merged' || Boolean(post.hidden_at);

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

      {closed ? null : (
        <div className="mt-3">
          <ReplyComposer post={post} parentId={null} />
        </div>
      )}

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
      ) : pinned.length + threads.length === 0 ? (
        <p className="mt-4 mb-1 text-sm text-ink-muted">No replies yet. Add what you know, a workaround or a +1 with your use case.</p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col p-0">
          {[...pinned, ...threads].map((t) => (
            <li key={t.reply.id} className="border-t border-line py-4 first:border-t-0">
              <ReplyItem post={post} reply={t.reply} pinned={t.reply.is_official} childCount={t.children.length} />
              {t.children.length ? (
                <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0 pl-gutter">
                  {t.children.map((c) => (
                    <li key={c.id}>
                      <ReplyItem post={post} reply={c} nested rootId={t.reply.id} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
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
  pinned,
  nested,
  rootId,
  childCount = 0,
}: {
  post: Post;
  reply: Reply;
  pinned?: boolean;
  nested?: boolean;
  rootId?: string;
  childCount?: number;
}) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'view' | 'edit' | 'reply'>('view');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = useDeleteReply(post.id);
  const isAuthor = Boolean(viewer && reply.author_id === viewer.id);
  const closed = post.status === 'merged' || Boolean(post.hidden_at);

  let who: ReactNode;
  if (reply.is_official && post.board) {
    who = (
      <>
        <b className="font-semibold text-ink">{post.board.name}</b>
        <TeamPill />
      </>
    );
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
    <article aria-label={`Reply by ${reply.author ? '@' + reply.author.handle : 'deleted user'}`} className="relative pl-gutter">
      <span className="absolute top-0 left-0">
        <ReplyAuthor post={post} reply={reply} {...(nested ? { nested } : {})} />
      </span>
      {pinned ? (
        <p className="m-0 mb-1 inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
          <Icon name="pin" size={12} />
          Pinned
        </p>
      ) : null}
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
        <p className="mt-1 mb-0 text-md text-ink whitespace-pre-line wrap-break-word">{reply.body}</p>
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
              <button type="button" className={actClass} onClick={() => setMode('edit')}>
                Edit
              </button>
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
        </div>
      ) : null}

      {mode === 'reply' ? (
        <div className="mt-3">
          <ReplyComposer
            post={post}
            parentId={rootId ?? reply.id}
            initial={nested && reply.author ? `@${reply.author.handle} ` : ''}
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
  // Team members can reply as the board on a new thread (mockup "Reply as"); the DB checks it.
  const team = useIsBoardTeam(parentId ? undefined : post.board_id, viewer?.id ?? null);
  const [asTeam, setAsTeam] = useState(false);
  const [body, setBody] = useState(initial);
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const reset = () => {
    setBody('');
    setError(null);
    setOpen(false);
    setAsTeam(false);
    onDone?.();
  };

  const send = () => {
    if (!requireAuth('reply')) return;
    const problem = validateReply(body);
    if (problem) return setError(problem);
    setError(null);
    create.mutate(
      { body, parentId, official: Boolean(team.data && asTeam) },
      {
        onSuccess: () => {
          toast(team.data && asTeam ? 'Official reply posted' : 'Reply posted');
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
        <UserAvatar src={viewer?.avatarUrl ?? null} size={parentId ? 'sm' : 'md'} />
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
                onChange={(e) => setAsTeam(e.target.value === 'team')}
               
                aria-label="Reply as"
              >
                <option value="me">{viewer ? `@${viewer.handle}` : 'You'}</option>
                <option value="team">{post.board.name} team</option>
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
