import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { isRecoveryRedirect, recoverySignal, shouldDetectSessionInUrl } from './recovery';

/**
 * The one place v2 talks to Supabase (FOUNDATION §2: components never call
 * Supabase directly; screens go through api/ hooks cached by TanStack Query).
 *
 * Only the public anon key is read. RLS is the guard. The service-role key
 * must never appear here or in any VITE_ variable; CI greps dist for it.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, '');
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const hasSupabaseConfig = Boolean(url && anonKey);
export const SUPABASE_URL = url ?? '';
export const SUPABASE_ANON_KEY = anonKey ?? '';

/**
 * Exported so a test can build a client with the real hooks. `detectSessionInUrl`
 * is a function only to OBSERVE a recovery redirect while its params still exist
 * (D-014); it returns auth-js's own rule unchanged.
 */
export const authClientOptions: SupabaseClientOptions<'public'> = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: (_url: URL, params: Record<string, string>) => {
      if (isRecoveryRedirect(params)) recoverySignal.mark();
      return shouldDetectSessionInUrl(params);
    },
  },
};

let client: SupabaseClient | null = null;

/** Lazily created so the shell renders (and tests run) without env vars. */
export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see web/.env.example).');
  }
  if (!client) {
    client = createClient(url, anonKey, authClientOptions);
    // Subscribe the moment the client exists so an early PASSWORD_RECOVERY is never missed.
    client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') recoverySignal.mark();
    });
  }
  return client;
}

/** Public URL for an object path in a public bucket (rows store paths, not URLs). */
export function publicStorageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path || !url) return null;
  return `${url}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
