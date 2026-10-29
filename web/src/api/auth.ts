import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthError, Session } from '@supabase/supabase-js';
import { getSupabase, hasSupabaseConfig, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

/*
 * Auth calls. Every function returns `{ error }` with copy that is safe to show:
 * nothing here ever tells a visitor whether an email has an account
 * (FOUNDATION §7). The copy mirrors the reference mockup.
 */

export type AuthResult = { error: string | null };

export const AUTH_COPY = {
  invalidEmail: 'Enter a valid email address.',
  needName: 'Add your name.',
  shortPassword: 'Use at least 8 characters.',
  needPassword: 'Enter your password.',
  badCredentials: 'That email and password don’t match. Try again or reset your password.',
  unconfirmed: 'Confirm your email first. Open the link we sent when you signed up.',
  rateLimited: 'Too many tries. Wait a minute, then try again.',
  network: 'We couldn’t reach Publisense. Check your connection and try again.',
  generic: 'Something went wrong. Try again.',
  signupFailed: 'We couldn’t create that account. If you already have one, sign in or reset your password.',
  resendRateLimited: 'We just sent one. Wait a minute, then try again.',
  resendFailed: 'We couldn’t resend the email. Try again in a moment.',
  needHandle: 'Choose a handle.',
  badHandle: 'Handles are 3 to 24 characters: lowercase letters, numbers and underscores.',
  handleTaken: 'That handle is taken. Try another.',
} as const;

/** Seconds between confirmation-email resends (Supabase's own limit is 60s per address). */
export const RESEND_COOLDOWN_S = 60;

export const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());

/**
 * Handles chosen at sign-up. The sign-up trigger (v2_handle_base) keeps
 * [a-z0-9_] and cuts at 24, so the form holds to the same rule rather than let
 * the server quietly change what was typed.
 */
export const SIGNUP_HANDLE_RE = /^[a-z0-9_]{3,24}$/;

/** Keep only what a handle allows, lowercased; used as you type and to suggest one. */
export const cleanHandle = (v: string) => v.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]+/g, '').slice(0, 24);

/**
 * Is this handle already someone's? Profiles are public (handle, name and avatar
 * are on /u/<handle>), so this reveals nothing new and needs no extra database
 * function. Resolves null when the check itself fails, so the form never blocks
 * sign-up on a network error; the server still picks a free handle.
 */
export async function isHandleTaken(handle: string): Promise<boolean | null> {
  const { data, error } = await getSupabase().from('profile').select('id').eq('handle', handle).limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

/** The handle sign-up suggests from an email address, the same way the server would. */
export const suggestHandle = (email: string) => cleanHandle(email.trim().split('@')[0] ?? '');

function code(err: AuthError | Error | null | undefined): string {
  if (!err) return '';
  const c = (err as AuthError).code ?? '';
  return `${c} ${err.message ?? ''}`.toLowerCase();
}

/** Map a provider error to safe copy. Exported for tests. */
export function explainAuthError(err: AuthError | Error | null | undefined, context: 'signin' | 'signup' | 'other' = 'other'): string {
  const c = code(err);
  if (!c.trim()) return AUTH_COPY.generic;
  if (c.includes('rate') || c.includes('too many') || c.includes('only request this after')) return AUTH_COPY.rateLimited;
  if (c.includes('fetch') || c.includes('network')) return AUTH_COPY.network;
  if (context === 'signin') {
    if (c.includes('not_confirmed') || c.includes('not confirmed')) return AUTH_COPY.unconfirmed;
    return AUTH_COPY.badCredentials;
  }
  if (c.includes('weak_password') || c.includes('password should')) return err?.message || AUTH_COPY.shortPassword;
  if (context === 'signup') return AUTH_COPY.signupFailed;
  return AUTH_COPY.generic;
}

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  return { error: error ? explainAuthError(error, 'signin') : null };
}

/** `needsConfirmation` is true when the project mails a confirm link (no session yet). */
export async function signUp(
  name: string,
  email: string,
  password: string,
  handle: string,
): Promise<AuthResult & { needsConfirmation: boolean }> {
  // user_name is what the sign-up trigger builds the handle from. requested_handle
  // remembers what was asked for: if someone takes it before this account is
  // created, the trigger adds a number and the app offers a change (HandleTakenNotice).
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: name.trim(), user_name: handle, requested_handle: handle }, emailRedirectTo: origin() },
  });
  if (error) return { error: explainAuthError(error, 'signup'), needsConfirmation: false };
  return { error: null, needsConfirmation: !data.session };
}

/**
 * Send the sign-up confirmation email again. Like the rest of this file it never
 * says whether the address has an account; only throttling and network trouble
 * come back as errors.
 */
export async function resendSignupConfirmation(email: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: origin() } });
  if (!error) return { error: null };
  const msg = explainAuthError(error);
  if (msg === AUTH_COPY.rateLimited) return { error: AUTH_COPY.resendRateLimited };
  if (msg === AUTH_COPY.network) return { error: msg };
  return { error: AUTH_COPY.resendFailed };
}

/**
 * Always resolves like a success unless the request itself was throttled or never
 * left the browser, so the answer is the same whether or not the address exists.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin()}/auth/reset` });
  if (!error) return { error: null };
  const msg = explainAuthError(error);
  return { error: msg === AUTH_COPY.rateLimited || msg === AUTH_COPY.network ? msg : null };
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: typeof window === 'undefined' ? undefined : window.location.href },
  });
  return { error: error ? explainAuthError(error) : null };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

/** Set a new password for the signed-in (or recovery) session. */
export async function setNewPassword(password: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.updateUser({ password });
  return { error: error ? explainAuthError(error) : null };
}

/**
 * Finish a forgot-password reset from the emailed link: set the new password, then
 * sign out every other session. A reset is often how someone takes an account back,
 * so a device that held the old password must not stay signed in. This browser
 * stays signed in: opening the link already proved the mailbox.
 */
export async function completePasswordReset(password: string): Promise<AuthResult> {
  const sb = getSupabase();
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: explainAuthError(error) };
  await sb.auth.signOut({ scope: 'others' });
  return { error: null };
}

/**
 * Change password from Settings: prove the current one first, then set the new
 * one and sign out every other session (mockup: "You'll stay signed in here and be
 * signed out everywhere else").
 */
export async function changePassword(email: string, current: string, next: string): Promise<AuthResult> {
  const sb = getSupabase();
  const check = await sb.auth.signInWithPassword({ email, password: current });
  if (check.error) {
    const msg = explainAuthError(check.error, 'signin');
    return { error: msg === AUTH_COPY.badCredentials ? 'That isn’t your current password.' : msg };
  }
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return { error: explainAuthError(error) };
  await sb.auth.signOut({ scope: 'others' });
  return { error: null };
}

/** Supabase mails a confirmation link to the new address; nothing changes until it is opened. */
export async function changeEmail(email: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.updateUser({ email: email.trim() }, { emailRedirectTo: `${origin()}/settings` });
  return { error: error ? explainAuthError(error) : null };
}

// ------------------------------------------------------------------ session

export interface SessionState {
  session: Session | null;
  /** False until the client has restored (or failed to restore) a session. */
  ready: boolean;
}

/** Live Supabase session. Without config there is never a session. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, ready: !hasSupabaseConfig });
  useEffect(() => {
    if (!hasSupabaseConfig) return;
    const sb = getSupabase();
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (alive) setState({ session: data.session, ready: true });
    });
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ session, ready: true });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return state;
}

// ------------------------------------------------------------------ capabilities

export interface AuthCapabilities {
  google: boolean;
  /** True when sign-up must be confirmed from a mailed link. */
  confirmEmail: boolean;
}

/** Fail closed: show only what always works (email + password). */
export const FALLBACK_CAPABILITIES: AuthCapabilities = { google: false, confirmEmail: true };

/**
 * Render only the sign-in methods the project has enabled (FOUNDATION §1,
 * authCapabilities). `/auth/v1/settings` is public with the anon key.
 */
export async function fetchAuthCapabilities(): Promise<AuthCapabilities> {
  if (!hasSupabaseConfig) return FALLBACK_CAPABILITIES;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) return FALLBACK_CAPABILITIES;
    const body = (await res.json()) as { external?: Record<string, boolean>; mailer_autoconfirm?: boolean };
    return { google: body.external?.google === true, confirmEmail: body.mailer_autoconfirm !== true };
  } catch {
    return FALLBACK_CAPABILITIES;
  }
}

export function useAuthCapabilities(enabled = true): AuthCapabilities {
  const q = useQuery({ queryKey: ['auth', 'capabilities'], queryFn: fetchAuthCapabilities, staleTime: Infinity, enabled });
  return q.data ?? FALLBACK_CAPABILITIES;
}

/** Forget the handle asked for at sign-up, once the user has kept or changed what they got. */
export async function clearRequestedHandle(): Promise<void> {
  await getSupabase().auth.updateUser({ data: { requested_handle: null } });
}
