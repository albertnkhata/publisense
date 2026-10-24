import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  plural,
  useBoard,
  useHub,
  useMergeCandidates,
  useMergePost,
  useScopeRole,
  useSimilarPosts,
  useUnmergePost,
  type Post,
} from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { Button, Dialog, Field, Input, STATUS_META, useToast } from '../ui';

interface Row {
  id: string;
  board_id: string;
  title: string;
  status: Post['status'];
  vote_count: number;
  reply_count: number;
  similar: boolean;
}

/**
 * "Merge duplicate" (mockup openMerge): the post being merged, a search, similar
 * posts first, then the most upvoted. A hub team picks from every board in the hub.
 * Votes and followers move to the post picked; the duplicate closes and points to
 * it. The toast offers Undo, which calls unmerge_post (10 minutes, FOUNDATION §7).
 */
export function MergeDialog({ post, open, onClose, onMerged }: { post: Post; open: boolean; onClose: () => void; onMerged?: (targetId: string) => void }) {
  const { viewer } = useViewer();
  const { toast } = useToast();
  const navigate = useNavigate();
  const merge = useMergePost();
  const unmerge = useUnmergePost();
  const board = useBoard(post.board?.slug);
  const hubRef = board.data?.hub ?? null;
  const hubRole = useScopeRole('hub', hubRef?.id, viewer?.id ?? null);
  const hub = useHub(hubRole.data ? hubRef?.slug : undefined);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pool = useMemo(() => (hub.data && hubRole.data ? hub.data.boards.map((b) => b.id) : [post.board_id]), [hub.data, hubRole.data, post.board_id]);
  const names = useMemo(() => Object.fromEntries((hub.data?.boards ?? []).map((b) => [b.id, b.name])), [hub.data]);
  const similar = useSimilarPosts(`${post.title}`, pool, viewer?.id ?? null);
  const candidates = useMergeCandidates(pool, q, post.id, open);

  const rows: Row[] = useMemo(() => {
    const sim = (similar.data ?? []).filter((p) => p.id !== post.id && p.status !== 'merged').slice(0, 4);
    if (!q.trim() && sim.length) return sim.map((p) => ({ ...p, similar: true }));
    return (candidates.data ?? []).map((p) => ({ ...p, similar: false }));
  }, [similar.data, candidates.data, q, post.id]);

  const go = () => {
    if (!pick) return;
    setError(null);
    merge.mutate(
      { sourceId: post.id, targetId: pick },
      {
        onSuccess: ({ moved }) => {
          onClose();
          toast({
            message: `Merged · ${plural(moved, 'vote', 'votes')} moved, voters notified`,
            onUndo: () =>
              unmerge.mutate(
                { sourceId: post.id, targetId: pick },
                {
                  onSuccess: () => toast('Merge undone'),
                  onError: (e) => toast(e instanceof Error ? e.message : 'We couldn’t undo the merge.'),
                },
              ),
          });
          if (onMerged) onMerged(pick);
          else void navigate(`/post/${pick}`);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'We couldn’t merge these posts. Try again.'),
      },
    );
  };

  const loading = candidates.isPending && !q && !(similar.data ?? []).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Merge duplicate"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={merge.isPending}>
            Cancel
          </Button>
          <Button onClick={go} disabled={!pick} loading={merge.isPending}>
            Merge
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-subtle px-3 py-2">
        <b className="block text-base font-semibold text-ink">{post.title}</b>
        <span className="text-sm text-ink-muted">
          {plural(post.vote_count, 'vote', 'votes')} · {plural(post.reply_count, 'reply', 'replies')}
        </span>
      </div>
      <Field label="Merge into">
        <Input
          type="search"
          placeholder="Search posts"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPick(null);
          }}
        />
      </Field>
      <div role="radiogroup" aria-label="Posts to merge into" className="mt-2 flex max-h-list flex-col gap-1 overflow-y-auto">
        {loading ? (
          <p className="m-0 py-3 text-sm text-ink-muted">Loading posts…</p>
        ) : rows.length === 0 ? (
          <p className="m-0 py-3 text-sm text-ink-muted">No posts match.</p>
        ) : (
          rows.map((r) => {
            const on = pick === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPick(r.id)}
                className={cx(
                  'flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-120',
                  on ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:bg-subtle',
                )}
              >
                <span className="flex w-9 shrink-0 flex-col items-center font-mono text-base font-semibold text-ink tabular-nums">
                  {r.vote_count}
                  <small className="font-sans text-xs font-normal text-ink-muted">votes</small>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base text-ink">
                    {r.title}
                    {r.similar ? <span className="ml-2 rounded-pill bg-subtle px-2 text-xs font-medium text-ink-secondary">Similar</span> : null}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {r.status !== 'open' ? `${STATUS_META[r.status].label} · ` : ''}
                    {pool.length > 1 && names[r.board_id] ? `${names[r.board_id]} · ` : ''}
                    {plural(r.reply_count, 'reply', 'replies')}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
      <p className="mt-3 mb-0 text-sm text-ink-muted">Votes and followers move to the post you pick. This post closes and points to it.</p>
      {error ? (
        <p role="alert" className="mt-2 mb-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
