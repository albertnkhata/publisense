import { Link, useNavigate, useParams } from 'react-router';
import { canUnmerge, isPostId, useIsBoardTeam, usePost, usePostTitle, useRelated, useStatusEvents, useUnmergePost, type Post, type StatusEvent } from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { PostCard } from '../posts/PostCard';
import { FEED_LIST } from '../posts/PostList';
import { ReplySection } from '../posts/Replies';
import { StatusTimeline } from '../posts/StatusTimeline';
import { BackLink } from '../boards/parts';
import { Button, EmptyState, Icon, Skeleton, useToast } from '../ui';

/**
 * PostPage (FOUNDATION §5): the post, its status timeline, the reply thread
 * and "More on {board}". The board's team updates the
 * status, merges and hides from the ⋯ menu and can reply as the team; for 10
 * minutes after a merge the team can undo it from the merged notice.
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
  const { viewer } = useViewer();
  const showTimeline = post.status !== 'open';
  const events = useStatusEvents(post.id, showTimeline);
  return (
    <>
      {post.status === 'merged' && post.merged_into ? <MergedNotice post={post} targetId={post.merged_into} events={events.data} /> : null}
      {post.board?.status === 'pending' ? <PendingBoardNotice post={post} own={Boolean(viewer && viewer.id === post.author_id)} /> : null}
      {post.hidden_at ? (
        <p className="m-0 flex items-center gap-2 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">
          <Icon name="eye-off" size={16} />
          Hidden. Only its author, the {post.board?.name ?? 'board'} team and Publisense moderators can see it.
        </p>
      ) : null}
      <PostCard post={post} variant="page" onDeleted={() => void navigate('/', { replace: true })} />
      {showTimeline && events.data && events.data.length > 0 ? <StatusTimeline post={post} events={events.data} /> : null}
      <ReplySection post={post} />
      <Related post={post} viewerId={viewer?.id ?? null} />
    </>
  );
}

/**
 * The post's board is still waiting for review (0024): only its submitter and
 * Publisense staff can read the board and its posts. Same wording as the composer.
 */
function PendingBoardNotice({ post, own }: { post: Post; own: boolean }) {
  const name = post.board?.name ?? 'This product';
  return (
    <div role="status" className="flex items-start gap-2 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">
      <Icon name="status-review" size={16} className="shrink-0" />
      <p className="m-0">
        <span className="font-semibold text-ink">Pending review.</span>{' '}
        {own
          ? `${name} is waiting for review. Until it’s approved, only you can see it and what you post on it.`
          : `${name} is waiting for review. Until it’s approved, only the person who added it and the Publisense team can see it.`}
      </p>
    </div>
  );
}

function MergedNotice({ post, targetId, events }: { post: Post; targetId: string; events: StatusEvent[] | undefined }) {
  const { viewer } = useViewer();
  const { toast } = useToast();
  const target = usePostTitle(targetId);
  const team = useIsBoardTeam(post.board_id, viewer?.id ?? null);
  const unmerge = useUnmergePost();
  const mergedAt = [...(events ?? [])].reverse().find((e) => e.to === 'merged')?.at ?? null;
  const undoable = Boolean(team.data) && canUnmerge(mergedAt);
  return (
    <div className="m-0 flex items-center gap-2 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary max-sm:flex-wrap">
      <Icon name="status-merged" size={16} />
      <span className="min-w-0 flex-1">
        Merged into{' '}
        <Link to={`/post/${targetId}`} className="font-semibold text-ink underline underline-offset-2">
          {target.data?.title ?? 'another post'}
        </Link>
        . Votes and followers moved there.
      </span>
      {undoable ? (
        <Button
          size="sm"
          variant="secondary"
          loading={unmerge.isPending}
          onClick={() =>
            unmerge.mutate(
              { sourceId: post.id, targetId },
              {
                onSuccess: () => toast('Merge undone'),
                onError: (e) => toast(e instanceof Error ? e.message : 'We couldn’t undo the merge.'),
              },
            )
          }
        >
          Undo merge
        </Button>
      ) : null}
    </div>
  );
}

function Related({ post, viewerId }: { post: Post; viewerId: string | null }) {
  const related = useRelated(post.board_id, post.id, viewerId);
  const items = related.data ?? [];
  if (!post.board || items.length === 0) return null;
  return (
    <section aria-labelledby={`related-${post.id}`}>
      <h2 id={`related-${post.id}`} className="mt-0 mb-2 pl-gutter text-xs font-semibold text-ink-muted uppercase">
        More on {post.board.name}
      </h2>
      <ul className={FEED_LIST}>
        {items.map((item) => (
          <li key={item.id}>
            <PostCard post={item} hideBoard />
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
