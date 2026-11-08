import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAtomFeed, isFeedSlug } from '../../api/_lib/feed';
import handler from '../../api/feed';

describe('buildAtomFeed', () => {
  it('validates slugs', () => {
    expect(isFeedSlug('cursor')).toBe(true);
    expect(isFeedSlug('bad_slug!')).toBe(false);
  });

  it('renders valid Atom 1.0 XML for feedback and changelog modes', () => {
    const xml = buildAtomFeed(
      { id: 'b1', slug: 'cursor', name: 'Cursor', tagline: 'The AI <code/> editor', created_at: '2026-10-01T12:00:00Z' },
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Fast tab <autocomplete>',
          body: 'Works across multi-file edits.',
          type: 'feature',
          status: 'shipped',
          vote_count: 14,
          created_at: '2026-10-20T09:30:00Z',
        },
      ],
      'changelog',
    );
    expect(xml).toContain('<title>Cursor — Changelog on Publisense</title>');
    expect(xml).toContain('<subtitle>The AI &lt;code/&gt; editor</subtitle>');
    expect(xml).toContain('href="https://publisense.app/b/cursor/changelog.xml"');
    expect(xml).toContain('<title>[Shipped] Fast tab &lt;autocomplete&gt;</title>');
    expect(xml).toContain('14 votes · Shipped — Works across multi-file edits.');
  });
});

describe('feed handler', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  const makeRes = () => {
    let code = 0;
    let body = '';
    const headers: Record<string, string> = {};
    return {
      res: {
        status(c: number) {
          code = c;
          return this;
        },
        setHeader(k: string, v: string) {
          headers[k.toLowerCase()] = v;
        },
        send(b: string) {
          body = b;
        },
      },
      read: () => ({ code, headers, body }),
    };
  };

  it('serves Atom XML for a live board', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'b1', slug: 'cursor', name: 'Cursor', tagline: 'AI editor', created_at: '2026-10-01T00:00:00Z' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'p1', title: 'Offline mode', body: 'Please add', type: 'feature', status: 'open', vote_count: 5, created_at: '2026-10-05T00:00:00Z' }]), { status: 200 }));

    const { res, read } = makeRes();
    await handler({ query: { slug: 'cursor' } }, res);
    const out = read();
    expect(out.code).toBe(200);
    expect(out.headers['content-type']).toContain('application/atom+xml');
    expect(out.body).toContain('<title>[Feature request] Offline mode</title>');
  });

  it('returns 404 when the board is unknown or slug is invalid', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }));

    const { res, read } = makeRes();
    await handler({ query: { slug: 'missing' } }, res);
    expect(read().code).toBe(404);
  });
});
