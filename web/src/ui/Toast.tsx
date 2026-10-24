import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * One toast queue for the app. Toasts confirm something that REALLY happened
 * ("Link copied", "Post merged") with an optional Undo. They never stand in
 * for unbuilt features (FOUNDATION §4, §10).
 */
export interface ToastInput {
  message: ReactNode;
  /** Optional undo; the toast stays up longer when present. */
  onUndo?: () => void;
  undoLabel?: string;
}

interface ToastEntry extends ToastInput {
  id: number;
}

interface ToastCtx {
  toast: (t: ToastInput | string) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export const TOAST_MS = 4000;
export const TOAST_UNDO_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const current = queue[0];

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const toast = useCallback((t: ToastInput | string) => {
    const entry = typeof t === 'string' ? { message: t } : t;
    setQueue((q) => [...q, { ...entry, id: nextId.current++ }]);
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(dismiss, current.onUndo ? TOAST_UNDO_MS : TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [current, dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="pointer-events-none fixed inset-x-0 bottom-6 z-60 flex justify-center px-4 max-sm:bottom-10"
            >
              {current ? (
                <div
                  key={current.id}
                  className="pointer-events-auto flex animate-rise-in items-center gap-3 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-card shadow-overlay"
                >
                  <span>{current.message}</span>
                  {current.onUndo ? (
                    <button
                      type="button"
                      className="-my-1 rounded-sm border-0 bg-transparent px-2 py-1 text-sm font-semibold text-card underline underline-offset-2 hover:opacity-80"
                      onClick={() => {
                        current.onUndo?.();
                        dismiss();
                      }}
                    >
                      {current.undoLabel ?? 'Undo'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
