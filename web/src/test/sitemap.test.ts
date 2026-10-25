import { describe, expect, it } from 'vitest';
import { buildSitemap, sitemapEntries } from '../../api/_lib/sitemap';

describe('sitemap', () => {
  it('lists static pages, hubs, boards and posts with absolute URLs', () => {
    const xml = buildSitemap(
      sitemapEntries({
        boards: [{ slug: 'cursor', created_at: '2026-10-01T10:00:00Z' }],
        hubs: [{ slug: 'figma', created_at: null }],
        posts: [{ id: '11111111-2222-3333-4444-555555555555', created_at: '2026-10-02T00:00:00Z', edited_at: '2026-10-20T08:00:00Z' }],
      }),
    );
    expect(xml).toContain('<loc>https://publisense.app/</loc>');
    expect(xml).toContain('<loc>https://publisense.app/explore</loc>');
    expect(xml).toContain('<loc>https://publisense.app/b/cursor</loc><lastmod>2026-10-01</lastmod>');
    expect(xml).toContain('<loc>https://publisense.app/h/figma</loc></url>');
    expect(xml).toContain('/post/11111111-2222-3333-4444-555555555555</loc><lastmod>2026-10-20</lastmod>');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('drops malformed keys and duplicates, never lists private pages', () => {
    const xml = buildSitemap(
      sitemapEntries({
        boards: [{ slug: 'ok' }, { slug: 'ok' }, { slug: 'bad slug<>' }],
        hubs: [],
        posts: [{ id: 'not-a-uuid' }],
      }),
    );
    expect(xml.match(/\/b\/ok</g)).toHaveLength(1);
    expect(xml).not.toContain('bad slug');
    expect(xml).not.toContain('not-a-uuid');
    expect(xml).not.toMatch(/admin|settings|manage/);
  });
});
