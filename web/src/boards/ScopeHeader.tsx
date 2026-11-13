import type { ReactNode } from 'react';
import { compactCount } from '../api/boards';
import { cx } from '../lib/cx';

/**
 * BoardHeader / HubHeader layout (FOUNDATION §5): logo, name, description,
 * meta line (site, hub, who added it), stats line, and actions (Manage when permitted, Follow, Post feedback).
 * Wraps cleanly at md without squeezing action buttons onto one cramped row.
 */
export function ScopeHeader({
  logo,
  title,
  tag,
  description,
  meta,
  stats,
  actions,
  bordered = false,
}: {
  logo: ReactNode;
  title: string;
  tag?: ReactNode;
  description?: ReactNode;
  /** Quiet links under the description; items wrap as whole units on narrow screens. */
  meta?: ReactNode;
  stats?: ReactNode;
  actions?: ReactNode;
  /** Draw a hairline below the header to anchor filter bars that follow directly. */
  bordered?: boolean;
}) {
  return (
    <header className={cx('flex items-start gap-4 pb-4 max-md:gap-3', bordered && 'border-b border-line')}>
      {logo}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 id="page-title" className="m-0 flex flex-wrap items-center gap-2 text-2xl font-bold text-ink">
            {title}
            {tag}
          </h1>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full">{actions}</div> : null}
        </div>
        {description ? <p className="mt-0 mb-2 text-base text-ink-secondary">{description}</p> : null}
        {meta ? (
          <div data-scope-meta className="mb-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            {meta}
          </div>
        ) : null}
        {stats ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">{stats}</div> : null}
      </div>
    </header>
  );
}

/** One item on the meta line: a muted link with a leading icon, as the mockup's hub link. */
export const metaLink =
  'inline-flex max-w-full min-w-0 items-center gap-1 text-ink-secondary no-underline hover:text-ink hover:underline hover:underline-offset-2';

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span>
      <b className="font-semibold text-ink">{value}</b> {label}
    </span>
  );
}

/**
 * Follower count on a board or hub header. Hidden while it is zero, as on the
 * board and hub cards (#156), so a new scope does not lead with "0 followers";
 * from 1 up it reads "1 follower" / "N followers". The stats line is a gapped
 * flex row with no separators, so leaving it out leaves nothing dangling.
 */
export function FollowerStat({ count }: { count: number }) {
  if (!(count > 0)) return null;
  return <Stat value={compactCount(count)} label={count === 1 ? 'follower' : 'followers'} />;
}
