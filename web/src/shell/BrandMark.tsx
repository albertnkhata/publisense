import { BrandGlyph } from '../ui';
import { cx } from '../lib/cx';

export function BrandSymbol({ className }: { className?: string }) {
  return (
    <span className={cx('grid size-7 shrink-0 place-items-center rounded-md bg-brand text-on-brand', className)}>
      <BrandGlyph size={15} />
    </span>
  );
}
