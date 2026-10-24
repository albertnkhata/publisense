/**
 * The password-recovery signal (ported from v1 `src/lib/recoverySignal.ts`, see
 * docs/deferred.md D-014 for why it exists).
 *
 * A mailed reset link 303s back with `#access_token=…&type=recovery`.
 * supabase-js consumes that fragment while the client initialises and clears it,
 * so by the time React reads `window.location` there is nothing left to classify.
 * The durable signals are the params auth-js hands `detectSessionInUrl` before it
 * clears them, and its own `PASSWORD_RECOVERY` event. Both call `mark()` here; the
 * app subscribes and routes to /auth/reset.
 *
 * Dependency-free so the rules are testable without a browser or a project.
 */
export interface RecoverySignal {
  mark(): void;
  peek(): boolean;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function createRecoverySignal(): RecoverySignal {
  let pending = false;
  const listeners = new Set<() => void>();
  return {
    mark() {
      pending = true;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          // A broken listener must never throw back into auth-js initialisation.
        }
      }
    },
    peek: () => pending,
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

export const recoverySignal = createRecoverySignal();

/** `type=recovery` alone is not enough (GoTrue echoes it); require a credential too. */
export function isRecoveryRedirect(params: Record<string, string | undefined>): boolean {
  if ((params.type ?? '') !== 'recovery') return false;
  return Boolean(params.access_token || params.token_hash || params.code);
}

/**
 * Exactly auth-js's own `_isImplicitGrantCallback` predicate. Reproduced because we
 * install a function in its place to observe the redirect, and the hook must not
 * change which URLs the client consumes.
 */
export function shouldDetectSessionInUrl(params: Record<string, string | undefined>): boolean {
  return Boolean(params.access_token || params.error || params.error_description || params.error_code);
}
