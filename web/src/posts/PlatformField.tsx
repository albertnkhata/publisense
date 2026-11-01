import { useId } from 'react';
import { PLATFORMS, type Platform } from '../api';
import { cx } from '../lib/cx';

/** The selectable pill shared by the composer's Type and Platform rows, so both read the same when chosen. */
export function pillClass(on: boolean, extra?: string) {
  return cx(
    'inline-flex h-7 items-center rounded-pill border px-3 text-sm transition-colors duration-120',
    on ? 'border-ink bg-ink font-semibold text-card' : 'border-line-strong bg-card text-ink-secondary hover:bg-subtle hover:text-ink',
    extra,
  );
}

/**
 * Optional platform a post is about (0033): iOS, Android, Web or Desktop. One choice at
 * most; choosing it again clears it. Pass `labelledBy` when the caller draws its own label
 * (the composer's section gutter); otherwise the field labels itself.
 */
export function PlatformField({
  value,
  onChange,
  labelledBy,
}: {
  value: Platform | null;
  onChange: (p: Platform | null) => void;
  labelledBy?: string;
}) {
  const ownId = useId();
  const labelId = labelledBy ?? ownId;
  const pills = (
    <div role="group" aria-labelledby={labelId} className="flex min-h-8 flex-wrap items-center gap-2">
      {PLATFORMS.map((p) => {
        const on = value === p.value;
        return (
          <button key={p.value} type="button" aria-pressed={on} onClick={() => onChange(on ? null : p.value)} className={pillClass(on)}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
  if (labelledBy) return pills;
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-semibold text-ink">
        Platform <span className="font-normal text-ink-muted">(optional)</span>
      </span>
      {pills}
    </div>
  );
}
