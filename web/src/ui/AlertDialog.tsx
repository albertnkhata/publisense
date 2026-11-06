import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getFocusable, trapTab } from '../lib/focus';

/**
 * A small centred prompt, on top of a Dialog (the composer's "Save post?").
 * Escape or a tap outside cancels it; the actions decide everything else.
 * Pass `paused` to the Dialog underneath while this is open.
 */
export interface AlertDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  /** The buttons, right-aligned. The one marked autoFocus gets focus. */
  actions: ReactNode;
  onCancel: () => void;
}

export function AlertDialog({ open, title, description, actions, onCancel }: AlertDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const titleId = useId();
  const descId = useId();
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

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
    const auto = panel.querySelector<HTMLElement>('[data-autofocus="true"]');
    (auto ?? getFocusable(panel)[0] ?? panel).focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      trapTab(e, panel);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const back = returnTo.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-overlay" onClick={() => onCancelRef.current()} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-alert animate-rise-in rounded-lg border border-line bg-card px-5 pt-5 pb-3 text-ink shadow-overlay outline-none"
      >
        <h2 id={titleId} className="m-0 text-md font-semibold text-ink">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mt-2 mb-0 text-base text-ink-secondary">
            {description}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-1">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
