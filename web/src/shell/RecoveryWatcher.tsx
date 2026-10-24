import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { recoverySignal } from '../api';

/**
 * A reset link normally lands on /auth/reset (we ask for that redirect). If the
 * project falls back to its Site URL instead, the recovery is still recognised
 * (api/recovery.ts) and the user is taken to the page that sets a new password,
 * rather than being silently signed in (docs/deferred.md D-014).
 */
export function RecoveryWatcher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    const go = () => {
      if (recoverySignal.peek() && window.location.pathname !== '/auth/reset') navigate('/auth/reset', { replace: true });
    };
    go();
    return recoverySignal.subscribe(go);
  }, [navigate, pathname]);
  return null;
}
