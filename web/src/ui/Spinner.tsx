import { cx } from '../lib/cx';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block size-4 shrink-0 animate-spin rounded-pill border-2 border-current border-t-transparent opacity-70', className)}
    />
  );
}
