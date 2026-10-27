import { useState, type KeyboardEvent } from 'react';
import { STATUS_NOTE_MAX, useSetPostStatus, type Post, type PostStatus } from '../api';
import { cx } from '../lib/cx';
import { Button, Dialog, Field, Icon, STATUS_META, Textarea, useToast } from '../ui';

/**
 * "Update status" for the board's team (mockup us-modal): pick a status and add an
 * optional note. One call to set_post_status (0044) records the change and the note
 * together on the post's status timeline and sends followers ONE notification that
 * carries the note (voters follow automatically), so there is no "don't notify"
 * switch. The note is not a reply: a team reply is written in the reply box
 * on the post ("Reply as {board} team"), deliberately separate from this dialog.
 */
export const TEAM_STATUSES: PostStatus[] = ['open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed'];

export const STATUS_HINT: Record<PostStatus, string> = {
  open: 'No status',
  under_review: 'Looking into it',
  planned: 'On the roadmap',
  in_progress: 'Being built',
  shipped: 'Live for everyone',
  closed: 'Won’t do',
  merged: 'Merged into another post',
};

/** Example notes per status, shown as placeholders. */
const EXAMPLE: Partial<Record<PostStatus, string>> = {
  under_review: 'We’re looking into this and will update the post when we know more.',
  planned: 'This is on the roadmap. We’ll post here when work starts.',
  in_progress: 'We’re building this now.',
  shipped: 'This is live for everyone. Thanks for the request!',
  closed: 'Closing this one for now. It doesn’t fit where the product is headed, but thanks for taking the time to write it up.',
};

export function statusToast(to: PostStatus): string {
  return to === 'open' ? 'Status cleared' : `Marked ${STATUS_META[to].label} · followers notified`;
}

export function StatusDialog({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const setStatus = useSetPostStatus();
  const [sel, setSel] = useState<PostStatus>(post.status === 'merged' ? 'open' : post.status);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = setStatus.isPending;
  const changed = sel !== post.status;
  // A note belongs to a status change; a message on its own is a team reply on the post.
  const canSave = changed;
  const team = post.board ? `${post.board.name} team` : 'the team';

  const save = async () => {
    if (!canSave || busy) return;
    setError(null);
    try {
      await setStatus.mutateAsync({ postId: post.id, to: sel, ...(note.trim() ? { note } : {}) });
      toast(statusToast(sel));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t update the status. Try again.');
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = TEAM_STATUSES.indexOf(sel);
    const next = TEAM_STATUSES[(i + (e.key === 'ArrowDown' ? 1 : -1) + TEAM_STATUSES.length) % TEAM_STATUSES.length] ?? 'open';
    setSel(next);
    (e.currentTarget.querySelector(`[data-status="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Update status"
      footer={
        <Button onClick={() => void save()} loading={busy} disabled={!canSave}>
          Update status
        </Button>
      }
    >
      <p className="mt-0 mb-3 text-base font-semibold text-ink">{post.title}</p>
      <div role="radiogroup" aria-label="Status" className="mb-4 flex flex-col gap-1" onKeyDown={onKeyDown}>
        {TEAM_STATUSES.map((s) => {
          const on = s === sel;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-status={s}
              onClick={() => setSel(s)}
              className={cx(
                'flex items-center gap-3 rounded-md border px-3 py-2 text-left text-base text-ink transition-colors duration-120',
                on ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:bg-subtle',
              )}
            >
              <span className={s === 'shipped' ? 'text-success' : 'text-ink-muted'}>
                <Icon name={STATUS_META[s].icon} size={16} strokeWidth={2.2} />
              </span>
              <span className="font-semibold">{STATUS_META[s].label}</span>
              <span className="text-sm text-ink-muted">{STATUS_HINT[s]}</span>
              {on ? (
                <span className="ml-auto text-brand">
                  <Icon name="check" size={14} strokeWidth={2.4} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <Field
        label="Note (shown on the timeline)"
        optional
        hint={
          !changed && note.trim()
            ? 'Pick a new status to save a note with it.'
            : `Saved with this change on the post’s status timeline. For a team reply, reply on the post as ${team}.`
        }
        error={error}
      >
        <Textarea
          rows={3}
          maxLength={STATUS_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={EXAMPLE[sel] ? `e.g. ${EXAMPLE[sel]}` : 'What this change means for people following it'}
        />
      </Field>
      <p className="mt-3 mb-0 flex items-center gap-2 text-sm text-ink-muted">
        <Icon name="bell" size={14} />
        Followers and upvoters get one notification with the new status and your note.
      </p>
    </Dialog>
  );
}
