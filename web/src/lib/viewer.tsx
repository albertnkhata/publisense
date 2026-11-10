import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { avatarUrl, hasSupabaseConfig, profileKey, signOut as apiSignOut, useProfile, useSession, type ProfileRow } from '../api';

/**
 * Purge private queries on identity changes (sign out, user switch).
 * Both removes inactive queries and resets active observers so guest views
 * immediately re-evaluate without lingering creator-only metadata (BUG-002).
 */
export function purgeUserQueryCache(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
  void qc.resetQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
}

/**
 * Who is looking at the app: the Supabase session plus the v2 `profile` row.
 *
 * Tests and /dev/kit render either state without Supabase through the `initial`
 * prop. In a dev build with no Supabase env vars, /dev/kit can still flip a local
 * preview; that branch is compiled out of production builds (import.meta.env.DEV).
 */
export interface Viewer {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  bio?: string;
  email?: string | null;
  /** Has an email + password identity (Google-only accounts do not). */
  hasPassword?: boolean;
  /** OAuth identities, e.g. [{ provider: 'google', email }]. */
  connected?: Array<{ provider: string; email: string | null }>;
  /** The handle asked for at sign-up, until the user keeps or changes the one they got. */
  requestedHandle?: string | null;
  /** A new account that hasn't been through first-run onboarding (follow a few boards). */
  onboard?: boolean;
}

interface ViewerContextValue {
  viewer: Viewer | null;
  /** False until a stored session has been restored (or ruled out). */
  ready: boolean;
  signOut: () => Promise<void>;
  /** Re-read the profile after an edit. */
  refresh: () => void;
  /** Dev-only local preview (no Supabase configured). Undefined in production. */
  preview?: { signedIn: boolean; set: (signedIn: boolean) => void };
}

export const PREVIEW_VIEWER: Viewer = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Alex Drake',
  handle: 'alex',
  bio: '',
  email: 'alex@drake.dev',
  hasPassword: true,
  connected: [],
};

const PREVIEW_KEY = 'publisense:preview-auth';
const PREVIEW_ENABLED = import.meta.env.DEV && !hasSupabaseConfig && import.meta.env.MODE !== 'test';

const ViewerContext = createContext<ViewerContextValue | null>(null);

/** Created in the last week: accounts from before onboarding existed are never asked. */
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;
function isNewAccount(createdAt: string | undefined): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && Date.now() - t < NEW_ACCOUNT_MS;
}

export function viewerFrom(user: User, profile: ProfileRow | null | undefined): Viewer {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const identities = user.identities ?? [];
  return {
    id: user.id,
    name: profile?.name || String(meta.full_name ?? meta.name ?? '') || (user.email ?? '').split('@')[0] || 'You',
    handle: profile?.handle ?? '',
    avatarPath: profile?.avatar_path ?? null,
    avatarUrl: avatarUrl(profile?.avatar_path),
    bio: profile?.bio ?? '',
    email: user.email ?? null,
    hasPassword: identities.length === 0 ? true : identities.some((i) => i.provider === 'email'),
    connected: identities
      .filter((i) => i.provider !== 'email')
      .map((i) => ({ provider: i.provider, email: (i.identity_data?.email as string | undefined) ?? null })),
    requestedHandle: typeof meta.requested_handle === 'string' && meta.requested_handle ? meta.requested_handle : null,
    onboard: meta.onboarded !== true && isNewAccount(user.created_at),
  };
}

export function ViewerProvider({ children, initial }: { children: ReactNode; initial?: Viewer | null }) {
  if (initial !== undefined) return <StaticViewerProvider initial={initial}>{children}</StaticViewerProvider>;
  if (PREVIEW_ENABLED) return <PreviewViewerProvider>{children}</PreviewViewerProvider>;
  if (!hasSupabaseConfig) return <StaticViewerProvider initial={null}>{children}</StaticViewerProvider>;
  return <SessionViewerProvider>{children}</SessionViewerProvider>;
}

/** A fixed viewer for tests and the kit. Sign out clears it. */
export function StaticViewerProvider({ children, initial }: { children: ReactNode; initial: Viewer | null }) {
  const qc = useQueryClient();
  const [viewer, setViewer] = useState<Viewer | null>(initial);
  const value = useMemo<ViewerContextValue>(
    () => ({
      viewer,
      ready: true,
      signOut: async () => {
        setViewer(null);
        purgeUserQueryCache(qc);
      },
      refresh: () => {},
    }),
    [viewer, qc],
  );
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

function readPreview(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_KEY) !== 'out';
  } catch {
    return true;
  }
}

function PreviewViewerProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(readPreview);
  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(PREVIEW_KEY, next ? 'in' : 'out');
    } catch {
      /* ignore */
    }
    setSignedIn(next);
  }, []);
  const value = useMemo<ViewerContextValue>(
    () => ({
      viewer: signedIn ? PREVIEW_VIEWER : null,
      ready: true,
      signOut: async () => {
        set(false);
        purgeUserQueryCache(qc);
      },
      refresh: () => {},
      preview: { signedIn, set },
    }),
    [signedIn, set, qc],
  );
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

function SessionViewerProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { session, ready: sessionReady } = useSession();
  const user = session?.user ?? null;
  const profile = useProfile(user?.id);
  const ready = sessionReady && (!user || !profile.isPending);
  const viewer = useMemo(() => (user && !profile.isPending ? viewerFrom(user, profile.data) : null), [user, profile.isPending, profile.data]);

  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevUserIdRef.current;
    const current = user?.id ?? null;
    if (prev && prev !== current) {
      purgeUserQueryCache(qc);
    }
    prevUserIdRef.current = current;
  }, [user?.id, qc]);

  const signOut = useCallback(async () => {
    purgeUserQueryCache(qc);
    await apiSignOut();
    purgeUserQueryCache(qc);
  }, [qc]);
  const refresh = useCallback(() => {
    if (user) void qc.invalidateQueries({ queryKey: profileKey(user.id) });
  }, [qc, user]);
  const value = useMemo<ViewerContextValue>(() => ({ viewer, ready, signOut, refresh }), [viewer, ready, signOut, refresh]);
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error('useViewer must be used inside <ViewerProvider>');
  return ctx;
}
