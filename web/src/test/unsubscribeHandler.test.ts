import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/unsubscribe';

/* RFC 8058 one-click unsubscribe endpoint named in List-Unsubscribe (#138). */
const TOKEN = '3f2b6c1e-9a4d-4e8b-8f00-1234567890ab';

function call(method: string, token?: string, kind?: string) {
  const out = { status: 0, body: '', headers: {} as Record<string, string> };
  const res = {
    status(code: number) { out.status = code; return res; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
    send(body: string) { out.body = body; },
  };
  const query: Record<string, string> = {};
  if (token !== undefined) query.token = token;
  if (kind !== undefined) query.kind = kind;
  return handler({ method, query }, res).then(() => out);
}

let fetchMock: ReturnType<typeof vi.fn>;
function mockFetch(answer: 'true' | 'false' | 'error' | 'throw') {
  fetchMock = vi.fn(async () => {
    if (answer === 'throw') throw new TypeError('fetch failed');
    if (answer === 'error') return new Response('down', { status: 503 });
    return new Response(answer, { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('one-click unsubscribe endpoint', () => {
  it('POST calls the unsubscribe RPC with the token and answers 200', async () => {
    mockFetch('true');
    const r = await call('POST', TOKEN);
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/unsubscribe');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ p_token: TOKEN });
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('POST passes p_kind when a valid kind is provided', async () => {
    mockFetch('true');
    const r = await call('POST', TOKEN, 'status_change');
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ p_token: TOKEN, p_kind: 'status_change' });
  });

  it('POST answers 200 without calling the database for an unrecognized kind', async () => {
    mockFetch('true');
    expect((await call('POST', TOKEN, 'bogus')).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 200 for an unknown token too (never reveals which tokens exist)', async () => {
    mockFetch('false');
    expect((await call('POST', TOKEN)).status).toBe(200);
  });

  it('answers 200 without calling the database for a malformed token', async () => {
    mockFetch('true');
    expect((await call('POST', 'not-a-token')).status).toBe(200);
    expect((await call('POST')).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 when the database cannot be reached, so the provider may retry', async () => {
    mockFetch('error');
    expect((await call('POST', TOKEN)).status).toBe(503);
    mockFetch('throw');
    expect((await call('POST', TOKEN)).status).toBe(503);
  });

  it('GET redirects to the visible unsubscribe page, preserving kind when present', async () => {
    mockFetch('true');
    const r = await call('GET', TOKEN);
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe(`/unsubscribe?token=${TOKEN}`);
    const rKind = await call('GET', TOKEN, 'reply');
    expect(rKind.status).toBe(303);
    expect(rKind.headers.location).toBe(`/unsubscribe?token=${TOKEN}&kind=reply`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses other methods', async () => {
    mockFetch('true');
    const r = await call('DELETE', TOKEN);
    expect(r.status).toBe(405);
    expect(r.headers.allow).toContain('POST');
  });
});
