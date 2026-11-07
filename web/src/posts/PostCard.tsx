import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ago, avatarSrc, boardLogoSrc, platformLabel, postKind, sourceCredit, useFollowPost, type Post } from '../api';
import { cx } from '../lib/cx';
import { sharePost } from '../lib/share';
import { useViewer } from '../lib/viewer';
import { useRequireAuth } from '../shell/auth';
import { BoardAvatar, Icon, StatusPill, TypePill, UserAvatar, useToast } from '../ui';
import { PostImages } from './PostImages';
import { PostMenu } from './PostMenu';
import { TeamByline } from './TeamByline';
import { VoteButton } from './VoteButton';

/**
 * PostCard (FOUNDATION §5): community and seeded variants, footer with
 * VoteButton, replies and share, status on the right, ⋯ menu top right.
 * `variant="page"` is the same card at the top of a post page: the title is the
 * page heading, the body is shown in full and a Follow toggle joins the footer.
 */
export interface PostCardProps {
  post: Post;
  variant?: 'feed' | 'page';
  /** Called after the author deletes it (the post page navigates away). */
  onDeleted?: () => void;
  /** On a board page the board is already named, so the crumb is left out (mockup). */
  hideBoard?: boolean;
}

const linkClass = 'text-inherit no-underline hover:underline hover:underline-offset-2';

export function PostCard({ post, variant = 'feed', onDeleted, hideBoard = false }: PostCardProps) {
  const navigate = useNavigate();
  const page = variant === 'page';
  const href = `/post/${post.id}`;

  // Tap anywhere on a feed card except its controls, unless selecting text (mockup).
  const onCardClick = (e: MouseEvent<HTMLElement>) => {
    if (page) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, select, label, [role="menu"], [role="dialog"]')) return;
    if (String(window.getSelection?.() ?? '').trim()) return;
    void navigate(href);
  };

  const titleClass = cx('m-0 font-semibold text-ink wrap-break-word', page ? 'text-xl font-bold' : 'text-md');

  return (
    <article
      aria-labelledby={`post-title-${post.id}`}
      onClick={onCardClick}
      className={cx(
        // Borderless (#205): in a feed the list draws a hairline between posts (FEED_LIST);
        // on its own page a hairline under the post separates it from what follows.
        // Feed cards reserve an avatar gutter; the page variant keeps the post text flush with its icon.
        'pt-4 pb-5',
        page ? 'border-b border-line' : 'cursor-pointer',
      )}
    >
      <div className={cx('relative min-w-0', !page && 'pl-gutter')}>
        <PostHead post={post} hideBoard={hideBoard} page={page} />
        <div className="absolute -top-1 -right-2">
          <PostMenu post={post} {...(onDeleted ? { onDeleted } : {})} />
        </div>

        {page ? (
          <h1 id={`post-title-${post.id}`} className={cx(titleClass, 'mt-2')}>
            {post.title}
          </h1>
        ) : (
          <h2 id={`post-title-${post.id}`} className={cx(titleClass, 'mt-2')}>
            <Link to={href} className="text-inherit no-underline focus-visible:underline">
              {post.title}
            </Link>
          </h2>
        )}

        {post.body ? (
          <p className={cx('mt-1 mb-0 text-base text-ink-secondary wrap-break-word', page ? 'whitespace-pre-line' : 'line-clamp-3')}>
            {post.body}
          </p>
        ) : null}

        <PostImages paths={post.images} title={post.title} page={page} />

        {!page && post.official ? <OfficialQuote post={post} /> : null}

        <PostFooter post={post} page={page} />
      </div>
    </article>
  );
}

/**
 * One header for every post in a feed. The product leads: its logo
 * beside row 1, which carries the product, type, platform and age. Row 2
 * credits who it came from: the author's handle, or the source a seeded post
 * was found on. On a board page the board is already named, so a community
 * post leads with its author instead and a seeded post leads with its source.
 */
function PostHead({ post, hideBoard, page }: { post: Post; hideBoard: boolean; page: boolean }) {
  if (page) return <PagePostHead post={post} />;

  const kind = postKind(post);
  const board = post.board;
  const author = post.author;
  const time = (
    <Dot>
      <time dateTime={post.created_at}>{ago(post.created_at)}</time>
    </Dot>
  );
  const platform = post.platform ? (
    <Dot>
      <span className="text-ink-muted">{platformLabel(post.platform)}</span>
    </Dot>
  ) : null;
  const edited = post.edited_at ? <Dot>edited</Dot> : null;
  const handle = author ? (
    <Link to={`/u/${author.handle}`} className={cx(linkClass, 'font-medium text-ink-secondary')}>
      @{author.handle}
    </Link>
  ) : (
    <span className="font-medium text-ink-muted italic">deleted user</span>
  );
  const row = 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted';

  if (hideBoard) {
    if (kind === 'seeded') {
      const credit = post.source_url ? (
        <a
          href={post.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(linkClass, 'inline-flex items-center gap-1 font-medium text-ink-secondary hover:text-ink')}
        >
          {sourceCredit(post)}
          <Icon name="arrow-up-right" size={11} />
        </a>
      ) : (
        <span className="font-medium text-ink-secondary">{sourceCredit(post)}</span>
      );
      return (
        <>
          <span className="absolute top-0 left-0 inline-grid size-7 shrink-0 place-items-center rounded-pill border border-line bg-subtle text-ink-muted" aria-hidden="true">
            <Icon name="globe" size={14} />
          </span>
          <div className={cx(row, 'min-h-4')}>
            {credit}
            {time}
            {edited}
          </div>
          <div className={cx(row, 'mt-1')}>
            <TypePill type={post.type} />
            {platform}
          </div>
        </>
      );
    }

    return (
      <>
        <span className="absolute top-0 left-0">
          {author ? (
            <Link to={`/u/${author.handle}`} tabIndex={-1} aria-hidden="true">
              <UserAvatar src={avatarSrc(author)} size="md" />
            </Link>
          ) : (
            <UserAvatar size="md" />
          )}
        </span>
        <div className={cx(row, 'min-h-4')}>
          {handle}
          {time}
          {edited}
        </div>
        <div className={cx(row, 'mt-1')}>
          <TypePill type={post.type} />
          {platform}
        </div>
      </>
    );
  }

  const boardName = board?.name ?? 'Unknown board';
  const credit =
    kind === 'seeded' ? (
      post.source_url ? (
        <a href={post.source_url} target="_blank" rel="noopener noreferrer" className={cx(linkClass, 'inline-flex items-center gap-1 text-ink-muted hover:text-ink')}>
          {sourceCredit(post)}
          <Icon name="arrow-up-right" size={11} />
        </a>
      ) : null
    ) : (
      handle
    );

  return (
    <>
      <span className="absolute top-0 left-0">
        {board ? (
          <Link to={`/b/${board.slug}`} tabIndex={-1} aria-hidden="true">
            <BoardAvatar name={boardName} color={board.color} logoSrc={boardLogoSrc(board)} size="md" decorative />
          </Link>
        ) : (
          <BoardAvatar name={boardName} size="md" decorative />
        )}
      </span>
      <div className={cx(row, 'min-h-4')}>
        {board ? (
          <Link to={`/b/${board.slug}`} className={cx(linkClass, 'font-semibold text-ink')}>
            {boardName}
          </Link>
        ) : (
          <span className="font-semibold text-ink">{boardName}</span>
        )}
        <Dot>
          <TypePill type={post.type} />
        </Dot>
        {platform}
        {time}
        {edited}
      </div>
      {credit ? <div className={cx(row, 'mt-1')}>{credit}</div> : null}
    </>
  );
}

/** The detail-page header has no avatar rail: its product icon and post text share the same left edge. */
function PagePostHead({ post }: { post: Post }) {
  const board = post.board;
  const boardName = board?.name ?? 'Unknown board';
  const kind = postKind(post);
  const time = (
    <Dot>
      <time dateTime={post.created_at}>{ago(post.created_at)}</time>
    </Dot>
  );
  const platform = post.platform ? (
    <Dot>
      <span className="text-ink-muted">{platformLabel(post.platform)}</span>
    </Dot>
  ) : null;
  const edited = post.edited_at ? <Dot>edited</Dot> : null;
  const handle = post.author ? (
    <Link to={`/u/${post.author.handle}`} className={cx(linkClass, 'font-medium text-ink-secondary')}>
      @{post.author.handle}
    </Link>
  ) : (
    <span className="font-medium text-ink-muted italic">deleted user</span>
  );
  const credit =
    kind === 'seeded' ? (
      post.source_url ? (
        <a href={post.source_url} target="_blank" rel="noopener noreferrer" className={cx(linkClass, 'inline-flex items-center gap-1 text-ink-muted hover:text-ink')}>
          {sourceCredit(post)}
          <Icon name="arrow-up-right" size={11} />
        </a>
      ) : null
    ) : (
      handle
    );
  const row = 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted';

  return (
    <div className="flex min-w-0 items-start gap-3">
      <BoardAvatar name={boardName} color={board?.color} logoSrc={boardLogoSrc(board)} size="md" decorative />
      <div className="min-w-0">
        <div className={cx(row, 'min-h-4')}>
          {board ? (
            <Link to={`/b/${board.slug}`} className={cx(linkClass, 'font-semibold text-ink')}>
              {boardName}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{boardName}</span>
          )}
          <Dot>
            <TypePill type={post.type} />
          </Dot>
          {platform}
          {time}
          {edited}
        </div>
        {credit ? <div className={cx(row, 'mt-1')}>{credit}</div> : null}
      </div>
    </div>
  );
}

function Dot({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="text-ink-muted">
        ·
      </span>
      {children}
    </span>
  );
}

/** The latest official reply, quoted on the card (mockup maintainer box). */
function OfficialQuote({ post }: { post: Post }) {
  const o = post.official;
  if (!o) return null;
  return (
    <div className="mt-3 rounded-sm border-0 border-l-2 border-solid border-brand bg-brand-soft px-3 py-2">
      {/* The team speaks as the board (#160 follow-up): logo, name and Team badge, never the teammate's handle. */}
      <p className="m-0 flex items-center gap-2 text-sm">
        {post.board ? (
          <BoardAvatar name={post.board.name} color={post.board.color} logoSrc={boardLogoSrc(post.board)} size="xs" decorative />
        ) : null}
        <TeamByline name={post.board?.name ?? 'Board'} />
      </p>
      <p className="mt-1 mb-0 line-clamp-3 text-base text-ink">{o.body}</p>
    </div>
  );
}

const actClass =
  'inline-flex h-7 max-sm:h-8 shrink-0 items-center gap-1 rounded-sm border-0 bg-transparent px-2 max-sm:px-3 text-sm font-medium text-ink-secondary no-underline ' +
  'transition-colors duration-120 ease-out hover:bg-subtle hover:text-ink aria-pressed:text-brand';

function PostFooter({ post, page }: { post: Post; page: boolean }) {
  const { toast } = useToast();
  const replies = `${post.reply_count} ${post.reply_count === 1 ? 'reply' : 'replies'}`;
  return (
    <div className={cx('flex flex-wrap items-center gap-1', page ? 'mt-3' : '-ml-2 mt-2')}>
      <VoteButton post={post} />
      <Link to={page ? '#replies' : `/post/${post.id}#replies`} className={actClass} aria-label={replies} title="Replies">
        <Icon name="reply" size={16} strokeWidth={1.8} />
        {/* No "0" at zero (#156): the action reads "Reply" until there are replies. */}
        {post.reply_count > 0 ? <span className="tabular-nums">{post.reply_count}</span> : <span className="max-sm:hidden">Reply</span>}
      </Link>
      <button
        type="button"
        className={actClass}
        title="Share"
        aria-label="Share"
        onClick={() => {
          void sharePost(post.id, post.title).then((msg) => msg && toast(msg));
        }}
      >
        <Icon name="share" size={16} strokeWidth={1.8} />
        <span className="max-sm:hidden">Share</span>
      </button>
      {page ? <FollowButton post={post} className={actClass} /> : null}
      <span className="flex-1" />
      {post.status !== 'open' ? <StatusPill status={post.status} /> : null}
    </div>
  );
}

function FollowButton({ post, className }: { post: Post; className: string }) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const follow = useFollowPost(viewer?.id ?? null);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={post.following}
      onClick={() => {
        if (!requireAuth('follow posts')) return;
        const on = !post.following;
        follow.mutate(
          { post, on },
          {
            onSuccess: () => toast(on ? 'Following this post' : 'Unfollowed this post'),
            onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
          },
        );
      }}
    >
      <Icon name="bell" size={16} strokeWidth={1.8} />
      <span className="max-sm:sr-only">{post.following ? 'Following' : 'Follow'}</span>
    </button>
  );
}
