/**
 * Auth capability discovery.
 *
 * Why this exists: `AuthModal` used to render Google, GitHub and Magic Link
 * controls unconditionally. None of the three were usable in production —
 * `/auth/v1/settings` reported `google: false`, `github: false`, and no SMTP
 * was configured — so every visitor was shown three sign-in paths that could
 * only fail. A visible control that cannot work is worse than an absent one:
 * it reads as a broken product rather than a smaller feature set.
 *
 * The fix is to ask the project what it can actually do, at runtime, and render
 * only that. Supabase exposes the enabled external providers on
 * `GET /auth/v1/settings` (public, anon-key authenticated). Enabling Google in
 * the project therefore makes the Google button appear with no deploy.
 *
 * Magic link is the exception: GoTrue does not report SMTP configuration
 * publicly, so there is no honest runtime signal for "can this project send
 * mail". It is gated on an explicit build flag instead, flipped only after a
 * real email has been delivered — see docs/deferred.md D-005.
 */

export type AuthCapabilities = {
  /** Email + password sign-in. Enabled by default on every Supabase project. */
  email: boolean;
  /** Google OAuth — true only when the provider is enabled in the project. */
  google: boolean;
  /** GitHub OAuth — true only when the provider is enabled in the project. */
  github: boolean;
  /** Magic link / OTP — true only when the build flag says mail delivery works. */
  magicLink: boolean;
  /** True when the capabilities above came from the live project rather than the fallback. */
  resolved: boolean;
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Set VITE_AUTH_MAGIC_LINK="true" only after a real sign-in email has been received.
 * Exposed as a pure function so the flag's meaning can be tested directly rather
 * than inferred from whatever mode the test runner happens to boot in.
 */
export function magicLinkEnabled(flag: string | undefined): boolean {
  return (flag ?? 'false').toLowerCase() === 'true';
}

export const MAGIC_LINK_ENABLED = magicLinkEnabled(
  import.meta.env.VITE_AUTH_MAGIC_LINK as string | undefined
);

/**
 * Demo persona switcher signs the UI in as a seeded profile without any
 * Supabase session. Fine in local development, indefensible in production
 * (it renders an admin view for anyone who clicks it), so it is opt-in.
 */
export function demoPersonasEnabled(flag: string | undefined, dev: boolean): boolean {
  return (flag ?? '').toLowerCase() === 'true' || dev;
}

export const DEMO_PERSONAS_ENABLED = demoPersonasEnabled(
  import.meta.env.VITE_SHOW_DEMO_PERSONAS as string | undefined,
  Boolean(import.meta.env.DEV)
);

/**
 * Fail closed: if the settings call cannot be made or fails, advertise only
 * what always works (email + password) and nothing that might 404 the user
 * into a dead OAuth round-trip.
 */
const FALLBACK: AuthCapabilities = {
  email: true,
  google: false,
  github: false,
  magicLink: MAGIC_LINK_ENABLED,
  resolved: false,
};

export type AuthMethod = 'google' | 'github' | 'magic' | 'email';

/**
 * The single source of truth for what the modal renders, in display order.
 *
 * Kept as a pure function so the "don't ship options that cannot work" rule can
 * be tested without mounting React: a capability that is false must never
 * appear here, and email/password must always appear.
 */
export function visibleAuthMethods(caps: AuthCapabilities): AuthMethod[] {
  const methods: AuthMethod[] = [];
  if (caps.github) methods.push('github');
  if (caps.google) methods.push('google');
  if (caps.magicLink) methods.push('magic');
  if (caps.email) methods.push('email');
  return methods;
}


let cached: AuthCapabilities | null = null;
let inflight: Promise<AuthCapabilities> | null = null;

export async function loadAuthCapabilities(force = false): Promise<AuthCapabilities> {
  if (!force) {
    if (cached) return cached;
    if (inflight) return inflight;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    cached = FALLBACK;
    return cached;
  }

  inflight = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      if (!res.ok) throw new Error(`auth settings ${res.status}`);
      const body = (await res.json()) as { external?: Record<string, boolean | undefined> };
      const external = body.external ?? {};
      cached = {
        // `external.email` is true on every project with password auth; treat a
        // missing field as enabled rather than silently hiding the only path.
        email: external.email !== false,
        google: external.google === true,
        github: external.github === true,
        magicLink: MAGIC_LINK_ENABLED,
        resolved: true,
      };
    } catch {
      cached = FALLBACK;
    } finally {
      inflight = null;
    }
    return cached!;
  })();

  return inflight;
}
