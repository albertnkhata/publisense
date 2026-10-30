import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';

/**
 * Underline tabs (feed scope, board tabs, notification tabs). WAI-ARIA tabs
 * with automatic activation: arrows move and select, Home/End jump. Only the
 * selected tab is in the tab order.
 */
export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Prefix for tab/panel ids so a TabPanel can point back at its tab. */
  idBase?: string;
  className?: string;
  /** Draw the full-width underline (default). Off when a parent row draws it. */
  bordered?: boolean;
}

export function tabId(base: string, value: string) {
  return `${base}-tab-${value}`;
}
export function panelId(base: string, value: string) {
  return `${base}-panel-${value}`;
}

export function Tabs<T extends string>({ items, value, onChange, label, idBase, className, bordered = true }: TabsProps<T>) {
  const fallback = useId();
  const base = idBase ?? fallback;
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    document.getElementById(tabId(base, target.value))?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx('scrollbar-none flex gap-6 overflow-x-auto overflow-y-hidden', bordered && 'border-b border-line', className)}
    >
      {items.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            id={tabId(base, t.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(base, t.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cx(
              '-mb-px inline-flex items-center gap-2 border-0 border-b-2 border-transparent bg-transparent py-3 text-base font-medium whitespace-nowrap text-ink-muted',
              'transition-colors duration-120 hover:text-ink aria-selected:border-ink aria-selected:font-semibold aria-selected:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="font-mono text-xs text-ink-muted tabular-nums">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idBase, value, children, className }: { idBase: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={panelId(idBase, value)} aria-labelledby={tabId(idBase, value)} tabIndex={0} className={cx('outline-none', className)}>
      {children}
    </div>
  );
}
