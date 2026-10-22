import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * The page URL exactly as the browser first delivered it, captured before
 * anything can modify it.
 *
 * This has to be read *here*, above `createClient` below, and that placement is
 * the entire point: creating the client strips `#access_token=...` off the URL
 * as part of its own initialisation. Any later read - a component effect, or
 * even another statement later in this module - sees a URL with the fragment
 * already gone. A recovery link then looks like an ordinary visit, and the
 * "choose a new password" step never opens, which is how a reset link ended up
 * signing people in and leaving them with the password they had forgotten.
 *
 * Module scope, evaluated top to bottom, is the only point early enough.
 */
export const initialUrl: string =
  typeof window === 'undefined' ? '' : window.location.href;

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    supabaseAnonKey.length > 20
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
