/**
 * The password-recovery signal.
 *
 * A mailed reset link lands on `/#access_token=…&type=recovery`. `supabase-js`
 * consumes that fragment while the client initialises and clears
 * `window.location.hash` itself once it has fetched the user, so by the time
 * any React effect reads `window.location` there is nothing left to classify —
 * which is why the two previous attempts at this bug (reading the URL at
 * module scope, and above `createClient`) were inert in production.
 *
 * The one durable signal is supabase's own `PASSWORD_RECOVERY` event, plus the
 * redirect params that initialisation hands to `detectSessionInUrl` *before* it
 * clears them. Both call `mark()` here, as early as module evaluation allows;
 * the app reads the flag when it mounts and subscribes for later marks.
 *
 * Kept dependency-free (no supabase import) so the rules can be tested without
 * a browser or a live project.
 */

export type RecoverySignal = {
  /** Record that a recovery redirect is in flight, and notify listeners. */
  mark(): void;
  /** Is a recovery step pending right now? */
  peek(): boolean;
  /** Handled (or dismissed): stop asking for a new password. */
  clear(): void;
  /** Called on every `mark()`. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
};

export function createRecoverySignal(): RecoverySignal {
  let pending = false;
  const listeners = new Set<() => void>();

  return {
    mark() {
      pending = true;
      // Copy first: a listener may subscribe or unsubscribe while we notify.
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          // A broken listener must not stop the others, and must never throw
          // back into supabase's initialisation.
        }
      }
    },
    peek() {
      return pending;
    },
    clear() {
      pending = false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The app-wide signal, shared by the client setup and the store. */
export const recoverySignal = createRecoverySignal();

/**
 * Do these redirect params mean "the user clicked a password-reset link"?
 *
 * `type=recovery` alone is not enough — GoTrue also echoes it on non-recovery
 * redirects — so require a credential alongside it.
 */
export function isRecoveryRedirect(params: Record<string, string | undefined>): boolean {
  if ((params.type || '') !== 'recovery') return false;
  return Boolean(params.access_token || params.token_hash || params.code);
}

/**
 * Exactly the predicate `supabase-js` would have used on its own
 * (`_isImplicitGrantCallback` in auth-js). Reproduced here because we install a
 * function in its place to observe the redirect, and the hook must not change
 * which URLs the client consumes.
 */
export function shouldDetectSessionInUrl(params: Record<string, string | undefined>): boolean {
  return Boolean(
    params.access_token || params.error || params.error_description || params.error_code
  );
}

/**
 * Should this auth event be allowed to dismiss the auth modal?
 *
 * Two things must not: the recovery itself, and the password being set. And —
 * the case that made this bug look intermittent — neither must any *other*
 * session event while a recovery step is still pending. Auth events arrive in
 * whatever order initialisation and storage produce, so `INITIAL_SESSION` (an
 * ordinary restore) can land after `PASSWORD_RECOVERY`; on that ordering a
 * name-only check closes the modal the recovery just opened, and nothing
 * re-opens it.
 */
export function shouldCloseAuthModalOnAuthEvent(event: string, recoveryPending: boolean): boolean {
  if (recoveryPending) return false;
  return event !== 'PASSWORD_RECOVERY' && event !== 'USER_UPDATED';
}
