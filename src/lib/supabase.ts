import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  isRecoveryRedirect,
  recoverySignal,
  shouldDetectSessionInUrl,
} from './recoverySignal';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    supabaseAnonKey.length > 20
);

/**
 * Options handed to `createClient`. Exported so a test can build a client with
 * the real hooks and a stub transport.
 */
export const authClientOptions = {
  auth: {
    /**
     * Called by supabase during initialisation — while the redirect fragment is
     * still in the URL, i.e. before the client clears it. This is the earliest
     * point the app can learn *why* the user arrived, and for a reset link the
     * answer must be recorded or it is lost for good.
     *
     * The return value is supabase's own rule, unchanged: our hook only
     * observes.
     */
    detectSessionInUrl: (url: URL, params: Record<string, string>) => {
      void url;
      if (isRecoveryRedirect(params)) recoverySignal.mark();
      return shouldDetectSessionInUrl(params);
    },
  },
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, authClientOptions)
  : null;

/**
 * Subscribe to the one recovery signal that survives the fragment being
 * consumed. Call this the moment a client exists — before React mounts — so a
 * `PASSWORD_RECOVERY` emitted shortly after initialisation cannot be missed.
 * Returns an unsubscribe.
 */
export function attachRecoveryListener(client: SupabaseClient): () => void {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recoverySignal.mark();
  });
  return () => subscription.unsubscribe();
}

if (supabase) {
  attachRecoveryListener(supabase);
}
