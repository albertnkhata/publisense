import type { ReactNode } from 'react';

/**
 * BoardHeader / HubHeader layout (FOUNDATION §5): logo, name, description,
 * meta line (site, hub, who added it), stats line, and actions (Manage when permitted, Follow, Post feedback).
 * Stacks at md with the actions spanning the width, as in the mockup.
 */
export function ScopeHeader({
  logo,
  title,
  tag,
  description,
  meta,
  stats,
  actions,
}: {
  logo: ReactNode;
  title: string;
  tag?: ReactNode;
  description?: ReactNode;
  /** Quiet links under the description; items wrap as whole units on narrow screens. */
  meta?: ReactNode;
  stats?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4 pb-4 max-md:flex-wrap max-md:gap-3">
      {logo}
      <div className="min-w-0 flex-1">
        <h1 id="page-title" className="mt-0 mb-1 flex flex-wrap items-center gap-2 text-xl font-bold text-ink">
          {title}
          {tag}
        </h1>
        {description ? <p className="mt-0 mb-2 text-base text-ink-secondary">{description}</p> : null}
        {meta ? (
          <div data-scope-meta className="mb-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            {meta}
          </div>
        ) : null}
        {stats ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">{stats}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2 max-md:w-full max-md:*:flex-1">{actions}</div> : null}
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
