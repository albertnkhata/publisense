import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * These tests exist because of a specific production defect: the sign-in modal
 * rendered Google, GitHub and Magic Link on a project where none of the three
 * could complete. Every visitor was offered three dead paths.
 *
 * The rule they protect: the modal advertises only what the project can do, and
 * when it cannot find out, it advertises only the one thing that always works.
 */

const SETTINGS_URL = 'https://example.supabase.co/auth/v1/settings';

/** Load the module fresh so its import-time env reads pick up the stubs. */
async function loadModule(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  return import('./authCapabilities');
}

const BASE_ENV = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  VITE_AUTH_MAGIC_LINK: 'false',
  VITE_SHOW_DEMO_PERSONAS: 'false',
};

function mockFetchOnce(impl: () => Promise<unknown> | unknown) {
  const fetchMock = vi.fn(impl as never);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('loadAuthCapabilities', () => {
  it('hides OAuth providers the project has disabled', async () => {
    const fetchMock = mockFetchOnce(() => ({
      ok: true,
      json: async () => ({ external: { email: true, google: false, github: false } }),
    }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule(BASE_ENV);

    const caps = await loadAuthCapabilities();

    expect(fetchMock).toHaveBeenCalledWith(SETTINGS_URL, { headers: { apikey: 'anon-key' } });
    expect(caps).toMatchObject({ google: false, github: false, email: true, resolved: true });
    expect(visibleAuthMethods(caps)).toEqual(['email']);
  });

  it('shows a provider the moment it is enabled, with no rebuild', async () => {
    mockFetchOnce(() => ({
      ok: true,
      json: async () => ({ external: { email: true, google: true, github: false } }),
    }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule(BASE_ENV);

    const caps = await loadAuthCapabilities();

    expect(visibleAuthMethods(caps)).toEqual(['google', 'email']);
  });

  it('orders OAuth before magic link before email', async () => {
    mockFetchOnce(() => ({
      ok: true,
      json: async () => ({ external: { email: true, google: true, github: true } }),
    }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule({
      ...BASE_ENV,
      VITE_AUTH_MAGIC_LINK: 'true',
    });

    const caps = await loadAuthCapabilities();

    expect(visibleAuthMethods(caps)).toEqual(['github', 'google', 'magic', 'email']);
  });

  it('keeps magic link off unless the build flag says mail delivery works', async () => {
    mockFetchOnce(() => ({
      ok: true,
      json: async () => ({ external: { email: true } }),
    }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule(BASE_ENV);

    const caps = await loadAuthCapabilities();

    expect(caps.magicLink).toBe(false);
    expect(visibleAuthMethods(caps)).not.toContain('magic');
  });

  it('enables magic link when the flag is set', async () => {
    mockFetchOnce(() => ({ ok: true, json: async () => ({ external: { email: true } }) }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule({
      ...BASE_ENV,
      VITE_AUTH_MAGIC_LINK: 'true',
    });

    const caps = await loadAuthCapabilities();

    expect(visibleAuthMethods(caps)).toContain('magic');
  });

  it('fails closed when the settings endpoint errors', async () => {
    mockFetchOnce(() => ({ ok: false, status: 500, json: async () => ({}) }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule(BASE_ENV);

    const caps = await loadAuthCapabilities();

    expect(caps).toMatchObject({ email: true, google: false, github: false, resolved: false });
    expect(visibleAuthMethods(caps)).toEqual(['email']);
  });

  it('fails closed when the network throws', async () => {
    mockFetchOnce(() => {
      throw new Error('offline');
    });
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule(BASE_ENV);

    const caps = await loadAuthCapabilities();

    expect(caps.google).toBe(false);
    expect(caps.resolved).toBe(false);
    expect(visibleAuthMethods(caps)).toEqual(['email']);
  });

  it('never hides email/password even if the project omits the field', async () => {
    mockFetchOnce(() => ({ ok: true, json: async () => ({ external: {} }) }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule(BASE_ENV);

    const caps = await loadAuthCapabilities();

    expect(visibleAuthMethods(caps)).toContain('email');
  });

  it('does not call the network without a configured project', async () => {
    const fetchMock = mockFetchOnce(() => ({ ok: true, json: async () => ({ external: {} }) }));
    const { loadAuthCapabilities, visibleAuthMethods } = await loadModule({
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    });

    const caps = await loadAuthCapabilities();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(visibleAuthMethods(caps)).toEqual(['email']);
  });

  it('caches the result instead of asking on every modal open', async () => {
    const fetchMock = mockFetchOnce(() => ({
      ok: true,
      json: async () => ({ external: { email: true } }),
    }));
    const { loadAuthCapabilities } = await loadModule(BASE_ENV);

    await loadAuthCapabilities();
    await loadAuthCapabilities();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches when explicitly forced', async () => {
    const fetchMock = mockFetchOnce(() => ({
      ok: true,
      json: async () => ({ external: { email: true } }),
    }));
    const { loadAuthCapabilities } = await loadModule(BASE_ENV);

    await loadAuthCapabilities();
    await loadAuthCapabilities(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('demo persona switcher', () => {
  it('is off in a production build with no flag', async () => {
    const { demoPersonasEnabled } = await loadModule(BASE_ENV);
    expect(demoPersonasEnabled(undefined, false)).toBe(false);
    expect(demoPersonasEnabled('false', false)).toBe(false);
  });

  it('is on in dev builds, so the personas stay usable locally', async () => {
    const { demoPersonasEnabled } = await loadModule(BASE_ENV);
    expect(demoPersonasEnabled(undefined, true)).toBe(true);
  });

  it('can be switched on explicitly in production', async () => {
    const { demoPersonasEnabled } = await loadModule(BASE_ENV);
    expect(demoPersonasEnabled('true', false)).toBe(true);
  });
});

describe('magic link flag', () => {
  it('treats anything but an explicit true as off', async () => {
    const { magicLinkEnabled } = await loadModule(BASE_ENV);
    expect(magicLinkEnabled(undefined)).toBe(false);
    expect(magicLinkEnabled('')).toBe(false);
    expect(magicLinkEnabled('yes')).toBe(false);
    expect(magicLinkEnabled('TRUE')).toBe(true);
  });
});
