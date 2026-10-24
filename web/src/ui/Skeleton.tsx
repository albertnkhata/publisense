import { cx } from '../lib/cx';

/** Loading placeholders for a card, a row and a page header. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-sm bg-subtle', className)} />;
}

export function Skeleton({ variant = 'card', className }: { variant?: 'card' | 'row' | 'header'; className?: string }) {
  if (variant === 'row') {
    return (
      <div role="status" aria-label="Loading" className={cx('flex items-center gap-3 py-2', className)}>
        <SkeletonBlock className="size-6 rounded-sm" />
        <SkeletonBlock className="h-3 flex-1" />
        <SkeletonBlock className="h-3 w-6" />
      </div>
    );
  }
  if (variant === 'header') {
    return (
      <div role="status" aria-label="Loading" className={cx('flex items-start gap-4 pb-5', className)}>
        <SkeletonBlock className="size-10 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <SkeletonBlock className="h-5 w-1/3" />
          <SkeletonBlock className="h-3 w-2/3" />
          <SkeletonBlock className="h-3 w-1/4" />
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading" className={cx('rounded-md border border-line bg-card px-5 py-4', className)}>
      <div className="flex">
        <div className="w-gutter shrink-0">
          <SkeletonBlock className="size-7 rounded-pill" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <SkeletonBlock className="h-3 w-1/3" />
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-2/3" />
          <div className="mt-2 flex gap-2 border-t border-line pt-3">
            <SkeletonBlock className="h-7 w-10" />
            <SkeletonBlock className="h-7 w-9" />
          </div>
        </div>
      </div>
    </div>
  );
}
