import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';

/** Icon, one line, one action (FOUNDATION §4). */
export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  /** Optional supporting line under the title. */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-4 py-9 text-center', className)}>
      {icon ? (
        <span className="mb-3 grid size-9 place-items-center rounded-pill bg-subtle text-ink-muted">
          <Icon name={icon} size={20} strokeWidth={1.8} />
        </span>
      ) : null}
      <p className="m-0 text-md font-semibold text-ink">{title}</p>
      {children ? <p className="mx-0 mt-1 mb-0 max-w-content text-base text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
