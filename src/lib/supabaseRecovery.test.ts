import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { attachRecoveryListener, authClientOptions } from './supabase';
import { recoverySignal } from './recoverySignal';

/**
 * Integration coverage for the *mechanism*, against the real @supabase/auth-js
 * the app ships — not a mock of it.
 *
 * Issue #61: a mailed reset link signed the user in and never offered a new
 * password. Two fixes read `window.location` and were inert in production,
 * because auth-js consumes the redirect fragment during initialisation and then
 * clears it itself. What these tests pin down:
 *
 *   1. the fragment really is cleared by the client (so any later URL read is
 *      too late — the reason the earlier attempts failed);
 *   2. our `detectSessionInUrl` hook sees the params *before* that happens, and
 *      marks the recovery signal;
 *   3. a listener attached the moment the client exists catches
 *      `PASSWORD_RECOVERY`, so the app never has to win a race with React mount;
 *   4. none of this changes whether the client consumes the session, or fires
 *      on visits that are not a recovery.
 *
 * The real client is built with our exported `authClientOptions` and a stub
 * transport, under a minimal `window`/`document`/`localStorage` so auth-js
 * takes its browser path.
 */

const SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
const SUPABASE_ANON_KEY = 'test-anon-key-long-enough-to-be-plausible-0123456789';
const USER_ID = '00000000-0000-4000-8000-000000000001';

function userJson() {
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'reset-probe@publisense.invalid',
    email_confirmed_at: '2026-10-22T00:00:00.000Z',
    created_at: '2026-10-22T00:00:00.000Z',
    updated_at: '2026-10-22T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
  };
}

type Browser = {
  store: Map<string, string>;
  location: { href: string; hash: string; search: string };
  restore(): void;
};

/**
 * Enough of a browser for auth-js to take its `isBrowser` path: it reads
 * `window.location`, clears `window.location.hash`, and persists the session to
 * `localStorage`.
 */
function installBrowser(redirectHash: string): Browser {
  const origin = 'https://publisense.app';
  const store = new Map<string, string>();
  let href = redirectHash ? `${origin}/${redirectHash}` : `${origin}/`;

  const location = {
    get href() {
      return href;
    },
    set href(next: string) {
      href = next;
    },
    get hash() {
      const i = href.indexOf('#');
      return i === -1 ? '' : href.slice(i);
    },
    set hash(next: string) {
      const base = href.split('#')[0];
      href = next ? `${base}${next.startsWith('#') ? next : `#${next}`}` : base;
    },
    search: '',
    pathname: '/',
    origin,
  };

  const g = globalThis as unknown as Record<string, unknown>;
  const previous = {
    window: g.window,
    document: g.document,
    localStorage: g.localStorage,
  };

  g.window = {
    location,
    history: { replaceState: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  g.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible',
  };
  g.localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };

  return {
    store,
    location,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete g[key];
        else g[key] = value;
      }
    },
  };
}

/** Only `/auth/v1/user` matters: that is the call made before the hash is cleared. */
function stubTransport(calls: string[]) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return new Response(JSON.stringify(userJson()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/** A session hash shaped like the one supabase's `/auth/v1/verify` 303s to. */
function sessionHash(type: string, accessToken: string, refreshToken: string) {
  const expiresAt = Math.round(Date.now() / 1000) + 3600;
  return `#access_token=${accessToken}&expires_in=3600&expires_at=${expiresAt}&refresh_token=${refreshToken}&token_type=bearer&type=${type}`;
}

const RECOVERY_HASH = sessionHash('recovery', 'recovery-access-token', 'recovery-refresh-token');

let browser: Browser | null = null;

beforeEach(() => {
  recoverySignal.clear();
});

afterEach(() => {
  browser?.restore();
  browser = null;
  recoverySignal.clear();
});

/**
 * Build the client exactly as `lib/supabase.ts` does, attach the listener in the
 * same order (client first, then subscribe — both before anything awaits), and
 * drive initialisation to completion.
 */
async function initialise(hash: string): Promise<{ client: SupabaseClient; calls: string[] }> {
  browser = installBrowser(hash);
  const calls: string[] = [];
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...authClientOptions,
    global: { fetch: stubTransport(calls) as unknown as typeof fetch },
  });
  attachRecoveryListener(client);
  await client.auth.getSession();
  // auth-js emits PASSWORD_RECOVERY from a zero-delay timer *after*
  // initialisation resolves; let that land.
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { client, calls };
}

describe('recovery redirect detection (against real auth-js)', () => {
  it('leaves the user signed in, but the fragment is gone by then', async () => {
    const { client } = await initialise(RECOVERY_HASH);

    const { data } = await client.auth.getSession();
    expect(data.session?.access_token).toBe('recovery-access-token');

    // The whole reason URL-reading fixes could never work: the client has
    // already cleared the fragment.
    expect(browser!.location.hash).toBe('');
    expect(browser!.location.href).toBe('https://publisense.app/');
  });

  it('marks the recovery signal from the redirect params, before they are cleared', async () => {
    await initialise(RECOVERY_HASH);
    expect(recoverySignal.peek()).toBe(true);
  });

  it('marks it from PASSWORD_RECOVERY, caught by a listener attached at client creation', async () => {
    // Same run, but with the params hook removed: only the event can mark it.
    browser = installBrowser(RECOVERY_HASH);
    recoverySignal.clear();
    const calls: string[] = [];
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { fetch: stubTransport(calls) as unknown as typeof fetch },
    });
    attachRecoveryListener(client);
    await client.auth.getSession();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(recoverySignal.peek()).toBe(true);
  });

  it('does not mark an ordinary visit', async () => {
    const { client } = await initialise('');
    expect(recoverySignal.peek()).toBe(false);
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
  });

  it('does not treat a magic-link redirect as a password recovery', async () => {
    await initialise(sessionHash('magiclink', 'magic-access-token', 'magic-refresh-token'));
    expect(recoverySignal.peek()).toBe(false);
  });

  it('still consumes a redirect that carries an error, so the app can explain it', async () => {
    const { client, calls } = await initialise(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    // The client must not have treated it as a session…
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
    // …and our hook must not have turned it into a recovery prompt.
    expect(recoverySignal.peek()).toBe(false);
    expect(calls).toEqual([]);
  });
});
