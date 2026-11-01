import { useId } from 'react';
import { PLATFORMS, type Platform } from '../api';
import { cx } from '../lib/cx';

/**
 * Optional platform a post is about (0033): iOS, Android, Web or Desktop. One choice at
 * most; choosing it again clears it.
 */
export function PlatformField({ value, onChange }: { value: Platform | null; onChange: (p: Platform | null) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-semibold text-ink">
        Platform <span className="font-normal text-ink-muted">(optional)</span>
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
