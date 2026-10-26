import { useEffect, useRef } from 'react';
import { initialAuthLinkError, parseAuthLinkError, withoutAuthLinkError, type AuthLinkError } from '../api/authLinkError';
import { useToast } from '../ui';
import { useAuthDialog } from './auth';

/**
 * Opened an expired or already-used email link (#137)? Say so and offer a new
 * link, instead of silently showing the home feed. The error params are removed
 * from the address bar so a reload doesn't show it again.
 */
export function AuthLinkErrorWatcher({ initial = initialAuthLinkError }: { initial?: AuthLinkError | null }) {
  const { openAuth } = useAuthDialog();
  const { toast } = useToast();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const err = initial ?? parseAuthLinkError(window.location.hash, window.location.search);
    if (!err) return;
    window.history.replaceState(window.history.state, '', withoutAuthLinkError(window.location.href));
    if (err.expired) openAuth('expired');
    else {
      toast('That sign-in link didn’t work. Sign in, or ask for a new link.');
      openAuth('signin');
    }
  }, [initial, openAuth, toast]);
  return null;
}
