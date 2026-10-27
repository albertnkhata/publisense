import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useViewer } from '../lib/viewer';
import { AuthDialog, type AuthCloseReason, type AuthMode } from './AuthDialog';

/**
 * Opens the AuthDialog from anywhere inside the shell: the sign-in buttons now,
 * and every gated action later through `useRequireAuth()`.
 */
export interface OpenAuthOptions {
  /**
   * Called when the visitor backs out (Esc, Close, outside click) before signing
   * in or finishing sign-up. Not called once a sign-up has sent its confirmation
   * email, and not called on a successful sign-in.
   */
  onCancel?: () => void;
}

interface AuthCtx {
  authOpen: boolean;
  openAuth: (mode?: AuthMode, reason?: string, opts?: OpenAuthOptions) => void;
  closeAuth: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: AuthMode; reason?: string; key: number }>({
    open: false,
    mode: 'signin',
    key: 0,
  });
  const onCancel = useRef<(() => void) | null>(null);
  const openAuth = useCallback((mode: AuthMode = 'signin', reason?: string, opts?: OpenAuthOptions) => {
    onCancel.current = opts?.onCancel ?? null;
    setState((s) => ({ open: true, mode, reason, key: s.key + 1 }));
  }, []);
  const closeAuth = useCallback(() => {
    onCancel.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);
  const onDialogClose = useCallback(
    (how: AuthCloseReason = 'done') => {
      const cancel = how === 'cancel' ? onCancel.current : null;
      closeAuth();
      cancel?.();
    },
    [closeAuth],
  );
  const value = useMemo(() => ({ authOpen: state.open, openAuth, closeAuth }), [state.open, openAuth, closeAuth]);
  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog key={state.key} open={state.open} initialMode={state.mode} reason={state.reason} onClose={onDialogClose} />
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
