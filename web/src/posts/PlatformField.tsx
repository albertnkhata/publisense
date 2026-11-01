import { useId } from 'react';
import { PLATFORMS, type Platform } from '../api';
import { cx } from '../lib/cx';

/**
 * Optional device a post is about (0033): iOS, Android, Web or Desktop. One choice at
 * most; choosing it again clears it.
 */
export function PlatformField({
  value,
  onChange,
  inline = false,
}: {
  value: Platform | null;
  onChange: (p: Platform | null) => void;
  inline?: boolean;
}) {
  const labelId = useId();
  return (
    <div className={cx(inline ? 'flex flex-wrap items-center gap-2' : 'flex flex-col gap-2')}>
      <span id={labelId} className={cx(inline ? 'shrink-0 mr-1 text-xs font-semibold uppercase text-ink-muted' : 'text-sm font-semibold text-ink')}>
        Device <span className={cx('font-normal text-ink-muted', inline && 'hidden')}>(optional)</span>
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const on = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : p.value)}
              className={cx(
                'h-7 rounded-full border px-3 text-sm transition-colors duration-120',
                on ? 'border-ink bg-ink text-card' : 'border-line-strong bg-card text-ink-secondary hover:text-ink',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
