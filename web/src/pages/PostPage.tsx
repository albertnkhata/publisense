import { Link, useNavigate, useParams } from 'react-router';
import { isPostId, usePost, usePostTitle, useRelated, useStatusEvents, type Post } from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { PostCard } from '../posts/PostCard';
import { ReplySection } from '../posts/Replies';
import { StatusTimeline } from '../posts/StatusTimeline';
import { Button, EmptyState, Icon, Skeleton, STATUS_META, TYPE_META } from '../ui';

/**
 * PostPage (FOUNDATION §5): the post, its status timeline, the reply thread
 * (official replies pinned) and "More on {board}". Team controls (status, merge,
 * official replies) arrive with Manage in step 7.
 */
export function PostPage() {
  const { id } = useParams();
  const { viewer } = useViewer();
  const valid = isPostId(id);
  const post = usePost(valid ? id : undefined, viewer?.id ?? null);
  usePageTitle(post.data?.title ?? (valid && post.isPending ? null : 'Post not found'));

  if (!valid || (post.isSuccess && !post.data)) return <NotFoundPost />;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      {post.isPending ? (
        <Skeleton />
      ) : post.isError ? (
        <div className="rounded-md border border-line bg-card">
          <EmptyState
            icon="flag"
            title="We couldn’t load this post"
            action={
              <Button variant="secondary" onClick={() => void post.refetch()} loading={post.isRefetching}>
                Try again
              </Button>
            }
          >
            Check your connection, then try again.
          </EmptyState>
        </div>
      ) : post.data ? (
        <PostBody post={post.data} />
      ) : null}
    </div>
  );
}

function PostBody({ post }: { post: Post }) {
  const navigate = useNavigate();
  const showTimeline = post.status !== 'open';
  const events = useStatusEvents(post.id, showTimeline);
  return (
    <>
      {post.status === 'merged' && post.merged_into ? <MergedNotice targetId={post.merged_into} /> : null}
      {post.hidden_at ? (
        <p className="m-0 flex items-center gap-2 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">
          <Icon name="eye-off" size={16} />
          Hidden by the {post.board?.name ?? 'board'} team. Only you and the team can see it.
        </p>
      ) : null}
      <PostCard post={post} variant="page" onDeleted={() => void navigate('/', { replace: true })} />
      {showTimeline && events.data && events.data.length > 0 ? <StatusTimeline post={post} events={events.data} /> : null}
      <ReplySection post={post} />
      <Related post={post} />
    </>
  );
}

function BackLink() {
  const navigate = useNavigate();
  const canGoBack = typeof window !== 'undefined' && Number((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  return (
    <Link
      to="/"
      onClick={(e) => {
        if (!canGoBack) return;
        e.preventDefault();
        void navigate(-1);
      }}
      className="inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-ink-muted no-underline hover:text-ink"
    >
      <Icon name="arrow-left" size={16} />
      Back
    </Link>
  );
}

function MergedNotice({ targetId }: { targetId: string }) {
  const target = usePostTitle(targetId);
  return (
    <p className="m-0 flex items-center gap-2 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">
      <Icon name="status-merged" size={16} />
      <span>
        Merged into{' '}
        <Link to={`/post/${targetId}`} className="font-semibold text-ink underline underline-offset-2">
          {target.data?.title ?? 'another post'}
        </Link>
        . Votes and followers moved there.
      </span>
    </p>
  );
}

function Related({ post }: { post: Post }) {
  const related = useRelated(post.board_id, post.id);
  const items = related.data ?? [];
  if (!post.board || items.length === 0) return null;
  return (
    <section aria-labelledby={`related-${post.id}`} className="rounded-md border border-line bg-card px-5 py-4 max-sm:p-4">
      <h2 id={`related-${post.id}`} className="mt-0 mb-2 text-xs font-semibold text-ink-muted uppercase">
        More on {post.board.name}
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((r) => (
          <li key={r.id} className="border-t border-line first:border-t-0">
            <Link to={`/post/${r.id}`} className="flex items-start gap-3 rounded-sm py-3 text-ink no-underline hover:bg-subtle">
              <span
                aria-label={`${r.vote_count} upvotes`}
                className="inline-flex min-w-8 shrink-0 flex-col items-center rounded-sm border border-line px-1 py-1 font-mono text-xs font-semibold text-ink-secondary"
              >
                <Icon name="arrow-up" size={12} />
                {r.vote_count}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-base text-ink">{r.title}</span>
                <span className="text-xs text-ink-muted">
                  {TYPE_META[r.type].label}
                  {r.status !== 'open' ? ` · ${STATUS_META[r.status].label}` : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotFoundPost() {
  const navigate = useNavigate();
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <BackLink />
      <div className="rounded-md border border-line bg-card">
        <h1 id="page-title" className="sr-only">
          Post not found
        </h1>
        <EmptyState icon="search" title="Post not found" action={
            <Button variant="secondary" onClick={() => void navigate('/')}>
              Go home
            </Button>
          }>
          It may have been deleted, or the link is wrong.
        </EmptyState>
      </div>
    </section>
  );
}
