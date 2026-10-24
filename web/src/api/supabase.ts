import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The one place v2 talks to Supabase (FOUNDATION §2: components never call
 * Supabase directly; screens go through api/ hooks cached by TanStack Query).
 *
 * Only the public anon key is read. RLS is the guard. The service_role key
 * must never appear here or in any VITE_ variable; CI greps dist for it.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseConfig = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** Lazily created so the shell renders (and tests run) without env vars. */
export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see web/.env.example).');
  }
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
