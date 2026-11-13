import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/keepalive';

function call(options: { method?: string; headers?: Record<string, string | string[] | undefined> } = {}) {
  const out = { status: 0, body: '', headers: {} as Record<string, string> };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v;
    },
    send(body: string) {
      out.body = body;
    },
  };
  return handler(options, res).then(() => out);
}

let fetchMock: ReturnType<typeof vi.fn>;
function mockFetch(answer: 'ok' | 'error' | 'throw') {
  fetchMock = vi.fn(async () => {
    if (answer === 'throw') throw new TypeError('fetch failed');
    if (answer === 'error') return new Response('error', { status: 500 });
    return new Response(JSON.stringify([{ id: 'b1' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-123');
  vi.stubEnv('CRON_SECRET', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('/api/keepalive cron endpoint', () => {
  it('makes an anon read against Supabase and returns 200', async () => {
    mockFetch('ok');
    const r = await call({ method: 'GET' });
    expect(r.status).toBe(200);
    expect(r.body).toBe('ok');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-robots-tag']).toBe('noindex');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/rest/v1/board?select=id&limit=1');
    expect((init.headers as Record<string, string>).apikey).toBe('anon-key-123');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer anon-key-123');
  });

  it('answers 500 if Supabase environment variables are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const r = await call({ method: 'GET' });
    expect(r.status).toBe(500);
    expect(r.body).toBe('missing supabase env');
  });

  it('answers 502 if Supabase returns an error or is unreachable', async () => {
    mockFetch('error');
    expect((await call({ method: 'GET' })).status).toBe(502);

    mockFetch('throw');
    expect((await call({ method: 'GET' })).status).toBe(502);
  });

  it('rejects non-GET/HEAD methods with 405', async () => {
    const r = await call({ method: 'POST' });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toContain('GET');
  });

  it('enforces CRON_SECRET authentication when set', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret-value');
    mockFetch('ok');

    // Missing header
    const r1 = await call({ method: 'GET' });
    expect(r1.status).toBe(401);

    // Wrong header
    const r2 = await call({ method: 'GET', headers: { authorization: 'Bearer wrong-secret' } });
    expect(r2.status).toBe(401);

    // Correct header
    const r3 = await call({ method: 'GET', headers: { authorization: 'Bearer test-secret-value' } });
    expect(r3.status).toBe(200);
  });
});
