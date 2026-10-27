import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, MAX_BYTES, parseDsn, POST } from '../../api/monitoring';

/* Same-origin Sentry tunnel: forwards only to our own project, never an open relay. */
const DSN = 'https://abc123@o4500000000000001.ingest.de.sentry.io/4500000000000002';
const UPSTREAM = 'https://o4500000000000001.ingest.de.sentry.io/api/4500000000000002/envelope/';

const envelope = (dsn: string, extra = '') =>
  `${JSON.stringify({ event_id: '9ec79c33ec9942ab8353589fcb2e04dc', dsn, sent_at: new Date().toISOString() })}\n{"type":"event"}\n{"message":"hello"}${extra}`;

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request('https://publisense.app/api/monitoring', { method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8', ...headers } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('VITE_SENTRY_DSN', DSN);
  fetchMock = vi.fn(async () => new Response('{"id":"9ec79c33ec9942ab8353589fcb2e04dc"}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('parseDsn', () => {
  it('reads host, key and project id', () => {
    expect(parseDsn(DSN)).toEqual({ host: 'o4500000000000001.ingest.de.sentry.io', publicKey: 'abc123', projectId: '4500000000000002' });
  });
  it('rejects anything that isn’t an https DSN with a key and numeric project', () => {
    expect(parseDsn('http://abc@sentry.io/1')).toBeNull();
    expect(parseDsn('https://sentry.io/1')).toBeNull();
    expect(parseDsn('https://abc@sentry.io/not-a-project')).toBeNull();
    expect(parseDsn('nonsense')).toBeNull();
    expect(parseDsn('')).toBeNull();
  });
});

describe('POST /api/monitoring', () => {
  it('forwards an envelope for our own project to its envelope endpoint, adding nothing about the visitor', async () => {
    const body = envelope(DSN);
    const res = await post(body, { 'x-forwarded-for': '203.0.113.9', cookie: 'sb=secret' });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(UPSTREAM);
    expect(init.headers).toEqual({ 'content-type': 'application/x-sentry-envelope' });
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body);
  });

  it('refuses another project, another key or another host (no open relay)', async () => {
    for (const other of [
      'https://abc123@o4500000000000001.ingest.de.sentry.io/999',
      'https://otherkey@o4500000000000001.ingest.de.sentry.io/4500000000000002',
      'https://abc123@evil.example.com/4500000000000002',
    ]) {
      const res = await post(envelope(other));
      expect(res.status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses envelopes without a DSN header or with a broken one', async () => {
    expect((await post('{"event_id":"x"}\n{}')).status).toBe(403);
    expect((await post('not json\n{}')).status).toBe(400);
    expect((await post('')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses bodies over the size limit', async () => {
    const big = envelope(DSN, 'x'.repeat(MAX_BYTES));
    expect((await post(big)).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes Sentry’s rate limit through so the SDK backs off', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '60', 'x-sentry-rate-limits': '60:error:organization' } }));
    const res = await post(envelope(DSN));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('x-sentry-rate-limits')).toBe('60:error:organization');
  });

  it('answers 502 when Sentry can’t be reached, and 503 when monitoring is off', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect((await post(envelope(DSN))).status).toBe(502);
    vi.stubEnv('VITE_SENTRY_DSN', '');
    expect((await post(envelope(DSN))).status).toBe(503);
  });

  it('only takes POST', () => {
    expect(GET().status).toBe(405);
  });
});

describe('SDK setup', () => {
  it('sends through the same-origin tunnel and keeps the no-PII defaults', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init, reactErrorHandler: () => () => undefined }));
    const { initMonitoring, MONITORING_TUNNEL } = await import('../lib/monitoring');
    initMonitoring();
    expect(MONITORING_TUNNEL).toBe('/api/monitoring');
    const opts = init.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.tunnel).toBe('/api/monitoring');
    expect(opts.dsn).toBe(DSN);
    expect(opts.sendDefaultPii).not.toBe(true);
    vi.doUnmock('@sentry/react');
  });
});
