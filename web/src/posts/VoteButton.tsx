import { useRef } from 'react';
import { useVote, type Post } from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { useRequireAuth } from '../shell/auth';
import { Icon, useToast } from '../ui';

/**
 * Upvote (FOUNDATION §5 PostCard footer). Optimistic: the count and state flip at
 * once and roll back with a toast if the write is refused. Signed out, it opens
 * sign-in. The first upvote on a post you don't follow says you'll get updates,
 * because voting follows the post.
 */
export function VoteButton({ post, size = 'md' }: { post: Post; size?: 'sm' | 'md' }) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const vote = useVote(viewer?.id ?? null);
  const busy = useRef(false);

  const onClick = () => {
    if (!requireAuth('upvote')) return;
    if (busy.current) return;
    busy.current = true;
    const on = !post.voted;
    const wasFollowing = post.following;
    vote.mutate(
      { post, on },
      {
        onSuccess: () => {
          if (on && !wasFollowing) toast('Upvoted · you’ll get updates on this post');
        },
        onError: (e) => toast(e instanceof Error ? e.message : 'We couldn’t save your upvote. Try again.'),
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  const closed = post.status === 'merged' || Boolean(post.hidden_at);
  return (
    <button
      type="button"
      aria-pressed={post.voted}
      aria-label={`Upvote, ${post.vote_count} ${post.vote_count === 1 ? 'vote' : 'votes'}`}
      title={closed ? 'Closed to votes' : 'Upvote'}
      disabled={closed}
      onClick={onClick}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-sm border font-semibold transition-colors duration-120 ease-out',
        'disabled:cursor-default disabled:opacity-45',
        size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 pr-3 pl-2 text-sm',
        post.voted
          ? 'border-brand bg-brand text-on-brand enabled:hover:border-brand-hover enabled:hover:bg-brand-hover'
          : 'border-line bg-card text-ink-secondary enabled:hover:border-brand enabled:hover:bg-brand-soft enabled:hover:text-brand',
      )}
    >
      <Icon name="arrow-up" size={size === 'sm' ? 14 : 16} strokeWidth={1.8} />
      {/* No "0" at zero (#156): an unvoted post shows the action, not an empty counter. */}
      {post.vote_count > 0 ? <span className="font-mono tabular-nums">{post.vote_count}</span> : size === 'md' ? <span>Upvote</span> : null}
    </button>
  );
}
