import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Who is looking at the app. Auth lands in step 4; until then the viewer is a
 * PREVIEW stub so the shell can be built and reviewed in both states.
 * The /dev/kit page flips it. Nothing here talks to Supabase.
 */
export interface Viewer {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
}

interface ViewerContextValue {
  viewer: Viewer | null;
  /** Dev preview only. Removed when real auth arrives. */
  setPreviewSignedIn: (signedIn: boolean) => void;
}

const PREVIEW_KEY = 'publisense:preview-auth';
export const PREVIEW_VIEWER: Viewer = { id: 'preview', name: 'Alex Drake', handle: 'alex' };

const ViewerContext = createContext<ViewerContextValue | null>(null);

function readPreview(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_KEY) !== 'out';
  } catch {
    return true;
  }
}

export function ViewerProvider({ children, initial }: { children: ReactNode; initial?: Viewer | null }) {
  const [signedIn, setSignedIn] = useState<boolean>(() => (initial === undefined ? readPreview() : initial !== null));
  const setPreviewSignedIn = (next: boolean) => {
    try {
      window.localStorage.setItem(PREVIEW_KEY, next ? 'in' : 'out');
    } catch {
      /* ignore */
    }
    setSignedIn(next);
  };
  const viewer = signedIn ? (initial ?? PREVIEW_VIEWER) : null;
  return <ViewerContext.Provider value={{ viewer, setPreviewSignedIn }}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error('useViewer must be used inside <ViewerProvider>');
  return ctx;
}
