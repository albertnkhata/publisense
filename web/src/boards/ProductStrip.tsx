import { Link } from 'react-router';
import { boardLogoSrc, compactCount, useBoard, type Post } from '../api';
import { useViewer } from '../lib/viewer';
import { BoardAvatar, Icon } from '../ui';
import { FollowScopeButton } from './parts';

/**
 * The product a post is about, stated once at the top of its page.
 *
 * A post page used to name its product only as a crumb on the card, so nothing
 * on the page said whether the team behind the product is here, how busy its
 * board is, or how to keep track of it without leaving for the board. One
 * compact strip answers all three without pushing the post itself down: the
 * card below it then leads with the author, because the product is right here.
 *
 * Counts come from the board record and move with the follow button (the scope
 * follow bump updates every `board` query), so Following 4100 -> 4101 is honest
 * without a refetch.
 */
export function ProductStrip({ post }: { post: Post }) {
  const { viewer } = useViewer();
  const board = post.board;
  const detail = useBoard(board?.slug, viewer?.id ?? null);
  if (!board) return null;

  const b = detail.data;
  const claimed = Boolean(b?.claimed_at || b?.hub?.claimed_at);
  const facts = b
    ? [
        b.tagline,
        b.post_count > 0 ? `${compactCount(b.post_count)} ${b.post_count === 1 ? 'post' : 'posts'}` : null,
        b.follower_count > 0 ? `${compactCount(b.follower_count)} ${b.follower_count === 1 ? 'follower' : 'followers'}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <section aria-label="Product" className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-card px-4 py-3">
      <Link to={`/b/${board.slug}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <BoardAvatar name={board.name} color={board.color} logoSrc={boardLogoSrc(board)} size="xl" decorative />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="m-0 flex min-w-0 flex-wrap items-center gap-2 text-md font-semibold text-ink">
          <Link to={`/b/${board.slug}`} className="truncate text-inherit no-underline hover:underline">
            {board.name}
          </Link>
          {/* 0026: same wording as the board page, so "verified team" means one thing app-wide. */}
          {claimed ? (
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-pill border border-line px-2 text-xs font-medium text-ink-secondary">
              <span className="text-success">
                <Icon name="check" size={12} strokeWidth={2.2} />
              </span>
              Verified team
            </span>
          ) : b ? (
            <span className="inline-flex h-6 shrink-0 items-center rounded-pill border border-line px-2 text-xs font-medium text-ink-muted">
              No verified team
            </span>
          ) : null}
        </p>
        {/* Blank beats a spinner: the name and logo are already here, the counts land a moment later. */}
        {facts ? (
          <p className="mt-1 mb-0 truncate text-sm text-ink-muted">{facts}</p>
        ) : null}
      </div>
      {b ? <FollowScopeButton target="board" id={b.id} name={b.name} size="sm" /> : null}
    </section>
  );
}
