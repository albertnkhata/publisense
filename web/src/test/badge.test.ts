import { afterEach, describe, expect, it, vi } from 'vitest';
import { badgeCount, badgeSvg, boardBadge, isBadgeSlug, textWidth } from '../../api/_lib/badge';
import handler from '../../api/badge';
import { badgeSnippets } from '../lib/badge';

describe('badge svg', () => {
  it('formats counts', () => {
    expect(badgeCount(0)).toBe('0');
    expect(badgeCount(42)).toBe('42');
    expect(badgeCount(1250)).toBe('1.2k');
    expect(badgeCount(12_900)).toBe('12k');
  });

  it('draws label and value, sized to the text, and escapes', () => {
    const svg = badgeSvg({ label: 'a<b', value: '42 open' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('a&lt;b');
    expect(svg).not.toContain('a<b');
    expect(svg).toContain(`width="${textWidth('a<b') + textWidth('42 open') + 24}"`);
    expect(boardBadge(7)).toContain('aria-label="feedback: 7 open"');
    expect(boardBadge(null)).toContain('not found');
  });

  it('accepts only board slugs', () => {
    expect(isBadgeSlug('cursor')).toBe(true);
    expect(isBadgeSlug('my-app-2')).toBe(true);
    expect(isBadgeSlug('../x')).toBe(false);
    expect(isBadgeSlug('-x')).toBe(false);
    expect(isBadgeSlug(undefined)).toBe(false);
  });

  it('snippets point at publisense.app', () => {
    const s = badgeSnippets('cursor');
    expect(s.markdown).toBe('[![Feedback on Publisense](https://publisense.app/badge/cursor.svg)](https://publisense.app/b/cursor)');
    expect(s.html).toContain('href="https://publisense.app/b/cursor"');
  });
});

describe('badge handler', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });
  const res = () => {
    const r = { code: 0, headers: {} as Record<string, string>, body: '' };
    const api = {
      status: (c: number) => ((r.code = c), api),
      setHeader: (k: string, v: string) => void (r.headers[k] = v),
      send: (b: string) => void (r.body = b),
    };
    return { r, api };
  };

  it('counts open posts on a live board', async () => {
    process.env.VITE_SUPABASE_URL = 'https://x.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon';
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/board?')
        ? new Response(JSON.stringify([{ id: 'b1' }]), { status: 200 })
        : new Response(null, { status: 206, headers: { 'content-range': '0-0/42' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { r, api } = res();
    await handler({ query: { slug: 'cursor' } }, api);
    expect(r.code).toBe(200);
    expect(r.headers['content-type']).toContain('image/svg+xml');
    expect(r.body).toContain('42 open');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('status=in.(open,under_review,planned,in_progress)');
  });

  it('answers a grey badge for unknown boards and bad slugs', async () => {
    process.env.VITE_SUPABASE_URL = 'https://x.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    const a = res();
    await handler({ query: { slug: 'nope' } }, a.api);
    expect(a.r.body).toContain('not found');
    const b = res();
    await handler({ query: { slug: '../etc' } }, b.api);
    expect(b.r.body).toContain('not found');
  });
});
