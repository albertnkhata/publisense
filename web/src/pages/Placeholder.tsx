import type { ReactNode } from 'react';
import { usePageTitle } from '../lib/usePageTitle';
import { EmptyState, type IconName } from '../ui';

/**
 * Scaffold placeholder for a route whose screen is built in a later step.
 * Title + EmptyState only; no data is fetched.
 */
export interface PlaceholderProps {
  title: string;
  icon?: IconName;
  /** Which build step delivers the real screen (docs/v2/BUILD.md). */
  step: number;
  children?: ReactNode;
}

export function Placeholder({ title, icon = 'hub', step, children }: PlaceholderProps) {
  usePageTitle(title);
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="mt-0 mb-2 text-2xl font-bold text-ink">
        {title}
      </h1>
      {children ? <div className="mb-4 text-base text-ink-secondary">{children}</div> : null}
      <div className="rounded-md border border-line bg-card">
        <EmptyState icon={icon} title="Nothing here yet">
          This screen is built in step {step} of the v2 rebuild.
        </EmptyState>
      </div>
    </section>
  );
}
