import type { Post, StatusEvent } from '../api';
import { formatDate } from '../api';
import { cx } from '../lib/cx';
import { STATUS_META } from '../ui';

/**
 * StatusTimeline (FOUNDATION §5): "Posted", then every status change in order,
 * from status_event. The current step is filled; Shipped is the only green.
 */
export function StatusTimeline({ post, events }: { post: Post; events: StatusEvent[] }) {
  const team = post.board ? `${post.board.name} team` : 'Team';
  const steps = [
    { key: 'posted', label: 'Posted', at: post.created_at, by: null as string | null, note: null as string | null, status: null as Post['status'] | null },
    ...events.map((e) => ({ key: e.id, label: STATUS_META[e.to].label, at: e.at, by: e.actor_id ? team : null, note: e.note, status: e.to })),
  ];
  const last = steps.length - 1;
  return (
    <section aria-labelledby={`status-${post.id}`} className="rounded-md border border-line bg-card px-5 py-4 max-sm:p-4">
      <h2 id={`status-${post.id}`} className="mt-0 mb-3 text-xs font-semibold text-ink-muted uppercase">
        Status
      </h2>
      <ol className="m-0 flex list-none flex-col p-0">
        {steps.map((s, i) => {
          const now = i === last;
          return (
            <li key={s.key} aria-current={now ? 'step' : undefined} className="flex gap-3">
              <span aria-hidden="true" className="flex flex-col items-center">
                <span
                  className={cx(
                    'mt-1 size-3 shrink-0 rounded-pill border-2',
                    now ? (s.status === 'shipped' ? 'border-success bg-success' : 'border-brand bg-brand') : 'border-line-strong bg-card',
                  )}
                />
                {i < last ? <span className="mt-1 w-px flex-1 bg-line-strong" /> : null}
              </span>
              <div className="min-w-0 pb-3">
                <p className="m-0 text-sm text-ink-muted">
                  <b className="font-semibold text-ink">{s.label}</b>{' '}
                  <time dateTime={s.at}>{formatDate(s.at, new Date(), true)}</time>
                  {s.by ? ` · ${s.by}` : ''}
                </p>
                {s.note ? <p className="mt-1 mb-0 text-sm text-ink-secondary whitespace-pre-line">{s.note}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
