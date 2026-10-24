import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';

/**
 * Pills (FOUNDATION §4):
 *  - StatusPill: outlined and neutral; only Shipped carries colour (green icon).
 *  - TypePill: quiet text with a dot (Bug / Feature request).
 *  - VerifiedPill: "Verified team" marker on boards and hubs.
 *  - TeamPill: the small "Team" badge next to an official reply.
 */
export type PostStatus = 'open' | 'under_review' | 'planned' | 'in_progress' | 'shipped' | 'closed' | 'merged';

export const STATUS_META: Record<PostStatus, { label: string; icon: IconName }> = {
  open: { label: 'Open', icon: 'status-open' },
  under_review: { label: 'Under review', icon: 'status-review' },
  planned: { label: 'Planned', icon: 'status-planned' },
  in_progress: { label: 'In progress', icon: 'status-progress' },
  shipped: { label: 'Shipped', icon: 'check' },
  closed: { label: 'Closed', icon: 'status-closed' },
  merged: { label: 'Merged', icon: 'status-merged' },
};

export function StatusPill({ status, detail }: { status: PostStatus; detail?: string }) {
  const meta = STATUS_META[status];
  const shipped = status === 'shipped';
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1 rounded-pill border border-line bg-transparent px-2 text-xs font-medium whitespace-nowrap',
        status === 'closed' || status === 'merged' ? 'text-ink-muted' : 'text-ink-secondary',
      )}
    >
      <span className={shipped ? 'text-success' : 'text-ink-muted'}>
        <Icon name={meta.icon} size={12} strokeWidth={2.2} />
      </span>
      {meta.label}
      {detail ? <span className="text-ink-muted">· {detail}</span> : null}
    </span>
  );
}

export type PostType = 'bug' | 'feature';

export const TYPE_META: Record<PostType, { label: string; dot: string }> = {
  bug: { label: 'Bug', dot: 'text-danger' },
  feature: { label: 'Feature request', dot: 'text-warning' },
};

export function TypePill({ type }: { type: PostType }) {
  const meta = TYPE_META[type];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true" className={meta.dot}>
        <circle cx="3" cy="3" r="3" fill="currentColor" />
      </svg>
      {meta.label}
    </span>
  );
}

export function VerifiedPill({ children = 'Verified team' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-ink-secondary">
      <span className="text-brand">
        <Icon name="shield" size={13} />
      </span>
      {children}
    </span>
  );
}

export function TeamPill({ children = 'Team' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex h-4 items-center rounded-pill border border-current px-1 text-xs leading-none font-semibold text-brand">
      {children}
    </span>
  );
}
