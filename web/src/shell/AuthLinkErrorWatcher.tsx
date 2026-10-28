import { useEffect, useRef } from 'react';
import { recordEvent } from '../api/analytics';
import { initialAuthLinkError, parseAuthLinkError, withoutAuthLinkError, type AuthLinkError } from '../api/authLinkError';
import { useToast } from '../ui';
import { useAuthDialog } from './auth';

/** Has its own expired-link screen, so the shell only tidies the URL there. */
const OWN_ERROR_SCREEN = /^\/auth\/reset\/?$/;

/**
 * Opened an expired or already-used email link (#137)? Say so and offer a new
 * link, instead of silently showing the home feed. The error params (error,
 * error_code, error_description) are removed from the address bar with
 * history.replaceState, so a reload, a copied link or a shared URL doesn't carry
 * them. Also handles a link opened in a tab that already has the app loaded,
 * where only the hash changes and the page doesn't reload.
 */
export function AuthLinkErrorWatcher({ initial = initialAuthLinkError }: { initial?: AuthLinkError | null }) {
  const { openAuth } = useAuthDialog();
  const { toast } = useToast();
  const done = useRef(false);
  const latest = useRef({ openAuth, toast });
  latest.current = { openAuth, toast };

  useEffect(() => {
    const handle = (err: AuthLinkError | null) => {
      if (!err) return;
      window.history.replaceState(window.history.state, '', withoutAuthLinkError(window.location.href));
      if (OWN_ERROR_SCREEN.test(window.location.pathname)) return;
      if (err.expired) {
        recordEvent('auth_link_expired');
        latest.current.openAuth('expired');
      } else {
        latest.current.toast('That sign-in link didn’t work. Sign in, or ask for a new link.');
        latest.current.openAuth('signin');
      }
    };
    if (!done.current) {
      done.current = true;
      handle(initial ?? parseAuthLinkError(window.location.hash, window.location.search));
    }
    const onHashChange = () => handle(parseAuthLinkError(window.location.hash, ''));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [initial]);
  return null;
}
