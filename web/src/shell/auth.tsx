import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useViewer } from '../lib/viewer';
import { AuthDialog, type AuthMode } from './AuthDialog';

/**
 * Opens the AuthDialog from anywhere inside the shell: the sign-in buttons now,
 * and every gated action later through `useRequireAuth()`.
 */
interface AuthCtx {
  authOpen: boolean;
  openAuth: (mode?: AuthMode, reason?: string) => void;
  closeAuth: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: AuthMode; reason?: string; key: number }>({
    open: false,
    mode: 'signin',
    key: 0,
  });
  const openAuth = useCallback((mode: AuthMode = 'signin', reason?: string) => {
    setState((s) => ({ open: true, mode, reason, key: s.key + 1 }));
  }, []);
  const closeAuth = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ authOpen: state.open, openAuth, closeAuth }), [state.open, openAuth, closeAuth]);
  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog key={state.key} open={state.open} initialMode={state.mode} reason={state.reason} onClose={closeAuth} />
    </AuthContext.Provider>
  );
}

export function useAuthDialog(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthDialog must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Gate an action on being signed in. Returns `require(reason)`: true when the
 * viewer may go ahead, otherwise it opens sign-in ("Sign in to {reason}…") and
 * returns false. The UI mirrors permissions; RLS is still the guard.
 */
export function useRequireAuth(): (reason?: string) => boolean {
  const { viewer } = useViewer();
  const { openAuth } = useAuthDialog();
  return useCallback(
    (reason?: string) => {
      if (viewer) return true;
      openAuth('signin', reason);
      return false;
    },
    [viewer, openAuth],
  );
}
