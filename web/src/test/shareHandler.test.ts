import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/share';

/* The crawler-only link-preview function: real meta for a page that exists, a real 404 for one that doesn't. */
function call(kind: string, key: string, headers: Record<string, string> = { host: 'publisense.app' }) {
  const out = { status: 0, body: '', headers: {} as Record<string, string> };
  const res = {
    status(code: number) { out.status = code; return res; },
    setHeader(k: string, v: string) { out.headers[k] = v; },
    send(body: string) { out.body = body; },
  };
  return handler({ query: { kind, key }, headers }, res).then(() => out);
}

const INDEX = '<html><head><title>Publisense</title></head><body></body></html>';

function mockFetch(rows: unknown[] | 'error') {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/index.html')) return new Response(INDEX);
    if (rows === 'error') return new Response('down', { status: 503 });
    return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } });
  }));
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('share handler status', () => {
  it('answers 200 with the board meta when the board exists', async () => {
    mockFetch([{ slug: 'cursor', name: 'Cursor', tagline: 'AI code editor' }]);
    const r = await call('board', 'cursor');
    expect(r.status).toBe(200);
    expect(r.body).toContain('Cursor');
  });

  it('answers 404 when the board or post is not public', async () => {
    mockFetch([]);
    expect((await call('board', 'no-such-board')).status).toBe(404);
    expect((await call('post', '00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('answers 404 for a singleton hub with one live board and 200 for a multi-product hub (0063)', async () => {
    mockFetch([{ slug: 'cursor', name: 'Cursor', description: '', boards: [{ status: 'live' }] }]);
    expect((await call('hub', 'cursor')).status).toBe(404);
    mockFetch([{ slug: 'figma', name: 'Figma', description: '', boards: [{ status: 'live' }, { status: 'live' }] }]);
    const ok = await call('hub', 'figma');
    expect(ok.status).toBe(200);
    expect(ok.body).toContain('Figma');
  });

  it('answers 200 for a merged post (readable since 0043) with the target as canonical', async () => {
    mockFetch([{ id: '00000000-0000-4000-8000-000000000001', title: 'Composer drops edits', body: '', status: 'merged', merged_into: '00000000-0000-4000-8000-000000000002', board: { name: 'Cursor' }, merged: { id: '00000000-0000-4000-8000-000000000002', title: 'Caret lost' } }]);
    const r = await call('post', '00000000-0000-4000-8000-000000000001');
    expect(r.status).toBe(200);
    expect(r.body).toContain('Composer drops edits');
  });

  it('asks for the merge target with the post, and never for hidden posts', async () => {
    mockFetch([]);
    await call('post', '00000000-0000-4000-8000-000000000001');
    const url = String(vi.mocked(fetch).mock.calls.find(([u]) => String(u).includes('/rest/v1/post'))?.[0]);
    expect(url).toContain('merged:merged_into(id,title)');
    expect(url).toContain('hidden_at=is.null');
  });

  it('answers 404 for a key that cannot name anything', async () => {
    mockFetch([]);
    expect((await call('post', 'not-a-uuid')).status).toBe(404);
  });

  it('stays 200 when the database cannot be reached (no false 404s)', async () => {
    mockFetch('error');
    expect((await call('board', 'cursor')).status).toBe(200);
  });
});

describe('share_unfurl logging (0054)', () => {
  const rpcBodies = () =>
    vi.mocked(fetch).mock.calls
      .filter(([u]) => String(u).endsWith('/rest/v1/rpc/record_event'))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, string>);

  it('logs each unfurl with its own random visit token, before answering', async () => {
    mockFetch([{ slug: 'cursor', name: 'Cursor', tagline: 'AI code editor' }]);
    await call('board', 'cursor');
    await call('board', 'cursor');
    const [first, second] = rpcBodies();
    expect(rpcBodies()).toHaveLength(2);
    if (!first || !second) throw new Error('expected two unfurl logs');
    expect(first.p_kind).toBe('share_unfurl');
    expect(first.p_path).toBe('/b/cursor');
    expect(first.p_visit_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.p_visit_id).not.toBe('00000000-0000-0000-0000-000000000000');
    expect(first.p_visit_id).not.toBe(second.p_visit_id);
    const init = vi.mocked(fetch).mock.calls.find(([u]) => String(u).endsWith('/rpc/record_event'))?.[1] as RequestInit;
    expect(init.signal).toBeTruthy();
  });

  it('still answers the preview when logging fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/index.html')) return new Response(INDEX);
      if (url.endsWith('/rpc/record_event')) throw new Error('timeout');
      return new Response(JSON.stringify([{ slug: 'cursor', name: 'Cursor', tagline: 'AI code editor' }]));
    }));
    const r = await call('board', 'cursor');
    expect(r.status).toBe(200);
    expect(r.body).toContain('Cursor');
  });

  it('logs nothing for a missing page', async () => {
    mockFetch([]);
    await call('board', 'nope');
    expect(rpcBodies()).toHaveLength(0);
  });
});

describe('host header validation & SSRF prevention', () => {
  it('rejects untrusted x-forwarded-host and falls back to SITE', async () => {
    mockFetch([{ slug: 'cursor', name: 'Cursor', tagline: 'AI code editor' }]);
    await call('board', 'cursor', { 'x-forwarded-host': 'evil.com', host: 'publisense.app' });
    const fetchedUrls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(fetchedUrls.some((u) => u.startsWith('https://evil.com'))).toBe(false);
    expect(fetchedUrls.some((u) => u === 'https://publisense.app/index.html')).toBe(true);
  });

  it('rejects private/cloud metadata IPs in host header and falls back to SITE', async () => {
    mockFetch([{ slug: 'cursor', name: 'Cursor', tagline: 'AI code editor' }]);
    await call('board', 'cursor', { host: '169.254.169.254' });
    const fetchedUrls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(fetchedUrls.some((u) => u.includes('169.254.169.254'))).toBe(false);
    expect(fetchedUrls.some((u) => u === 'https://publisense.app/index.html')).toBe(true);
  });

  it('allows trusted Vercel preview and localhost hosts', async () => {
    mockFetch([{ slug: 'cursor', name: 'Cursor', tagline: 'AI code editor' }]);
    await call('board', 'cursor', { host: 'preview-branch.vercel.app' });
    const fetchedUrls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(fetchedUrls.some((u) => u === 'https://preview-branch.vercel.app/index.html')).toBe(true);
  });
});

