import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip on hover and focus (FOUNDATION §4). It describes; it is never the
 * only label, so the child must already have an accessible name.
 * Positioned in a portal so it escapes overflow clipping (the collapsed nav);
 * coordinates travel as custom properties, the only inline style allowed.
 */
export interface TooltipProps {
  content: ReactNode;
  kbd?: string;
  side?: 'right' | 'top' | 'bottom';
  /** Render nothing (e.g. nav labels are visible, so no tip is needed). */
  disabled?: boolean;
  children: ReactElement<Record<string, unknown>>;
}

const GAP = 8;

export function Tooltip({ content, kbd, side = 'top', disabled, children }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const id = useId();
  const timer = useRef<number | undefined>(undefined);

  const show = (el: HTMLElement, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (side === 'right') setPos({ x: r.right + GAP, y: r.top + r.height / 2 });
      else if (side === 'bottom') setPos({ x: r.left + r.width / 2, y: r.bottom + GAP });
      else setPos({ x: r.left + r.width / 2, y: r.top - GAP });
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  if (disabled) return children;

  const childProps = children.props as Record<string, ((e: unknown) => void) | undefined>;
  const trigger = cloneElement(children, {
    'aria-describedby': pos ? id : undefined,
    onPointerEnter: (e: { currentTarget: HTMLElement }) => {
      childProps.onPointerEnter?.(e);
      show(e.currentTarget, 250);
    },
    onPointerLeave: (e: unknown) => {
      childProps.onPointerLeave?.(e);
      hide();
    },
    onFocus: (e: { currentTarget: HTMLElement }) => {
      childProps.onFocus?.(e);
      show(e.currentTarget, 0);
    },
    onBlur: (e: unknown) => {
      childProps.onBlur?.(e);
      hide();
    },
    onKeyDown: (e: { key: string }) => {
      childProps.onKeyDown?.(e);
      if (e.key === 'Escape') hide();
    },
  });

  const placement =
    side === 'right' ? '-translate-y-1/2' : side === 'bottom' ? '-translate-x-1/2' : '-translate-x-1/2 -translate-y-full';

  return (
    <>
      {trigger}
      {pos
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              style={{ '--tip-x': `${pos.x}px`, '--tip-y': `${pos.y}px` }}
              className={`pointer-events-none fixed top-(--tip-y) left-(--tip-x) z-70 animate-fade-in rounded-sm bg-ink px-2 py-1 text-sm font-semibold whitespace-nowrap text-card shadow-overlay ${placement}`}
            >
              {content}
              {kbd ? <kbd className="ml-2 font-mono text-xs opacity-60">{kbd}</kbd> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
