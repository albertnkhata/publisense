import { Link } from 'react-router';
import { formatDate, plural, type ChangelogEntry, type PostSummary, type Roadmap as RoadmapData, type RoadmapStatus } from '../api';
import { cx } from '../lib/cx';
import { Icon, TYPE_META, type IconName } from '../ui';
import { VoteCount } from './parts';

/**
 * Roadmap (FOUNDATION §5): Planned, In progress and Shipped columns, most
 * upvoted first. On a hub each item names its board.
 */
const COLUMNS: Array<{ key: RoadmapStatus; title: string; icon: IconName }> = [
  { key: 'planned', title: 'Planned', icon: 'status-planned' },
  { key: 'in_progress', title: 'In progress', icon: 'status-progress' },
  { key: 'shipped', title: 'Shipped', icon: 'check' },
];

export function Roadmap({ data, showBoard = false, perColumn }: { data: RoadmapData; showBoard?: boolean; perColumn?: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
      {COLUMNS.map((c) => {
        const items = perColumn ? data[c.key].slice(0, perColumn) : data[c.key];
        const headingId = `roadmap-${c.key}`;
        return (
          <section key={c.key} aria-labelledby={headingId} className="min-w-0 rounded-md border border-line bg-card p-3">
            <h3 id={headingId} className="mx-1 mt-0 mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <span className={c.key === 'shipped' ? 'text-success' : 'text-ink-muted'}>
                <Icon name={c.icon} size={13} strokeWidth={2.2} />
              </span>
              {c.title}
              <span className="ml-auto text-xs font-medium text-ink-muted">{data[c.key].length}</span>
            </h3>
            {items.length ? (
              <ul className="m-0 list-none p-0">
                {items.map((p) => (
                  <li key={p.id} className="border-t border-line first:border-t-0">
                    <RoadmapItem post={p} showBoard={showBoard} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 px-1 py-4 text-center text-sm text-ink-muted">Nothing here yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RoadmapItem({ post, showBoard }: { post: PostSummary; showBoard: boolean }) {
  return (
    <Link to={`/post/${post.id}`} className="flex items-start gap-3 rounded-sm px-1 py-2 text-ink no-underline hover:bg-subtle">
      <VoteCount count={post.vote_count} />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium wrap-break-word">{post.title}</span>
        {showBoard && post.board ? (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted">
            <span style={{ '--board-color': post.board.color }} aria-hidden="true" className="size-2 rounded-pill bg-board" />
            {post.board.name}
          </span>
        ) : (
          <span className="mt-1 text-xs text-ink-muted">{TYPE_META[post.type].label}</span>
        )}
      </span>
    </Link>
  );
}

/**
 * Changelog: what shipped, grouped by the day it shipped. v2 has no release
 * notes yet, so each entry lists the requests closed that day.
 */
export function Changelog({ entries }: { entries: ChangelogEntry[] }) {
  const now = new Date();
  return (
    <ol className="m-0 flex list-none flex-col p-0" aria-label="Changelog">
      {entries.map((e) => (
        <li key={e.day} className="flex gap-5 border-t border-line py-4 first:border-t-0 first:pt-1 max-md:flex-col max-md:gap-2">
          <div className="w-date shrink-0 pt-1 text-sm text-ink-muted max-md:w-auto">
            <time dateTime={e.day}>{formatDate(e.at, now, true)}</time>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="mt-0 mb-2 text-md font-semibold text-ink">{plural(e.posts.length, 'request')} shipped</h3>
            <p className="mt-0 mb-2 text-xs font-semibold text-ink-muted uppercase">Requests closed</p>
            <ul className="m-0 list-none p-0">
              {e.posts.map((p) => (
                <li key={p.id}>
                  <Link to={`/post/${p.id}`} className={cx('group flex items-center gap-2 py-1 text-sm font-medium text-ink no-underline')}>
                    <span className="shrink-0 text-success">
                      <Icon name="check-circle" size={14} />
                    </span>
                    <span className="min-w-0 flex-1 group-hover:underline group-hover:underline-offset-2">{p.title}</span>
                    {p.board && e.posts.some((x) => x.board_id !== p.board_id) ? (
                      <span className="shrink-0 text-xs text-ink-muted max-sm:hidden">{p.board.name}</span>
                    ) : null}
                    <small className="shrink-0 text-xs whitespace-nowrap text-ink-muted">{plural(p.vote_count, 'upvote')}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}

