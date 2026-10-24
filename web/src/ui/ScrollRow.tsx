import { useCallback, useEffect, useRef, useState, type FocusEvent, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';

/**
 * A single row of chips that scrolls sideways (Explore categories). The
 * scrollbar is hidden; swipe, trackpad and shift+wheel still scroll it. A
 * chevron button over a short fade into the page background appears on each
 * end that has more content, and none when everything fits. On touch screens
 * (coarse pointer) the chevrons are dropped and only the fades stay: people
 * swipe, and a 28px button would sit on top of the chips they are tapping.
 */

/** Overflow past either end, from the scroller's metrics. 1px slack absorbs sub-pixel rounding. */
export function scrollEdges(el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>) {
  const max = el.scrollWidth - el.clientWidth;
  return { start: el.scrollLeft > 1, end: max > 1 && el.scrollLeft < max - 1 };
}

/** Width the fade (and its chevron) covers at each edge; keeps a focused chip out from under it. */
const EDGE_PX = 40;
/** A chevron click moves this share of the visible width. */
const STEP = 0.75;

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface ScrollRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  /** Accessible name of the row (e.g. "Categories"). */
  label: string;
  /** Names the chevrons: "Scroll {noun} left/right". */
  noun?: string;
  /** Classes for the outer wrapper (margins). The row itself is a gapped flex row. */
  className?: string;
}

export function ScrollRow({ children, label, noun = 'categories', className, role = 'toolbar', ...rest }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = scrollEdges(el);
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // The row and each chip: catches viewport changes and late web-font swaps that change chip widths.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (ro) {
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
    }
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [update, children]);

  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * STEP), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  // Keyboard focus on a chip that is clipped or under a fade brings it fully into view.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const el = ref.current;
    const target = e.target;
    if (!el || target === el || !(target instanceof HTMLElement)) return;
    const box = el.getBoundingClientRect();
    const chip = target.getBoundingClientRect();
    const edge = Math.min(EDGE_PX, box.width / 4);
    let delta = 0;
    if (chip.left < box.left + (el.scrollLeft > 1 ? edge : 0)) delta = chip.left - box.left - edge;
    else if (chip.right > box.right - edge && scrollEdges(el).end) delta = chip.right - box.right + edge;
    if (delta !== 0) el.scrollBy({ left: delta, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <div className={cx('relative -mx-1', className)}>
      <div
        ref={ref}
        role={role}
        aria-label={label}
        onFocus={onFocus}
        className="scrollbar-none flex gap-2 overflow-x-auto overscroll-x-contain p-1"
        {...rest}
      >
        {children}
      </div>
      <Edge side="start" show={edges.start} label={`Scroll ${noun} left`} onClick={() => scrollBy(-1)} />
      <Edge side="end" show={edges.end} label={`Scroll ${noun} right`} onClick={() => scrollBy(1)} />
    </div>
  );
}

function Edge({ side, show, label, onClick }: { side: 'start' | 'end'; show: boolean; label: string; onClick: () => void }) {
  if (!show) return null;
  const start = side === 'start';
  return (
    <div
      data-edge={side}
      className={cx(
        'pointer-events-none absolute inset-y-0 flex w-9 items-center from-page from-40% to-transparent',
        start ? 'left-0 justify-start bg-linear-to-r pl-1' : 'right-0 justify-end bg-linear-to-l pr-1',
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={onClick}
        className={cx(
          'pointer-events-auto inline-grid size-7 shrink-0 place-items-center rounded-pill border border-line-strong bg-card text-ink-secondary',
          'transition-colors duration-120 ease-out hover:text-ink pointer-coarse:hidden',
        )}
      >
        <Icon name={start ? 'chevron-left' : 'chevron-right'} size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
