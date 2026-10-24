import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Dialog, EmptyState } from '../ui';

/**
 * Opens the post composer from anywhere (nav CTA, tab bar, "C").
 * PLACEHOLDER: the real Composer is built in step 6; this dialog only proves
 * the wiring and the dialog/sheet behaviour.
 */
const ComposerContext = createContext<{ openComposer: () => void } | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openComposer = useCallback(() => setOpen(true), []);
  return (
    <ComposerContext.Provider value={{ openComposer }}>
      {children}
      <Dialog open={open} onClose={() => setOpen(false)} title="Post feedback" size="lg">
        <EmptyState icon="plus" title="Composer placeholder">
          Board picker, type, title with similar posts, and details are built in step 6.
        </EmptyState>
      </Dialog>
    </ComposerContext.Provider>
  );
}

export function useComposer() {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error('useComposer must be used inside <ComposerProvider>');
  return ctx;
}
