import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { getFocusable, trapTab } from '../lib/focus';
import { IconButton } from './IconButton';

/**
 * Modal dialog (FOUNDATION §4): focus trap, Escape closes, focus returns to
 * whatever opened it, aria-labelledby the title, page scroll locked.
 * At sm (≤520px) the same dialog renders as a bottom sheet.
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Visually hide the title (it still labels the dialog). */
  hideTitle?: boolean;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  /** Element to focus on open; defaults to the first focusable inside. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Close when the backdrop is clicked (default true). */
  dismissable?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  hideTitle,
  description,
  children,
  footer,
  size = 'md',
  initialFocus,
  dismissable = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Remember the opener and inherit its theme scope (the portal leaves the subtree).
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnTo.current = active;
    const scoped = active?.closest('[data-theme]');
    setTheme(scoped && scoped !== document.documentElement ? (scoped.getAttribute('data-theme') ?? undefined) : undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target = initialFocus?.current ?? getFocusable(panel).find((el) => !el.dataset.dialogClose) ?? getFocusable(panel)[0] ?? panel;
    target.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      trapTab(e, panel);
    };
    document.addEventListener('keydown', onKeyDown, true);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      const back = returnTo.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open, initialFocus]);

  if (!open) return null;

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-10 pb-4 max-sm:items-end max-sm:p-0">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-overlay"
        onClick={dismissable ? () => onCloseRef.current() : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-full w-full animate-rise-in flex-col rounded-lg border border-line bg-card text-ink shadow-overlay outline-none',
          size === 'lg' ? 'max-w-dialog-lg' : 'max-w-dialog',
          'max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-4',
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2 hidden h-1 w-8 rounded-pill bg-line-strong max-sm:block" />
        <header className={cx('flex items-center gap-2 py-3 pr-3 pl-5', !hideTitle && 'border-b border-line')}>
          <h2 id={titleId} className={cx('m-0 flex-1 text-md font-semibold text-ink', hideTitle && 'sr-only')}>
            {title}
          </h2>
          <IconButton icon="close" label="Close" onClick={() => onCloseRef.current()} data-dialog-close="true" />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {description ? (
            <p id={descId} className="mt-0 mb-4 text-base text-ink-secondary">
              {description}
            </p>
          ) : null}
          {children}
        </div>
        {footer ? <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
