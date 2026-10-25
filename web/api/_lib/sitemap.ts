/**
 * sitemap.xml for search engines. Pure builder (unit tested); `api/sitemap.ts`
 * fetches the rows with the public anon key, so RLS decides what is listed.
 */
import { SITE } from './shareMeta.js';

export interface SitemapEntry {
  path: string;
  lastmod?: string | null;
}

/** Public pages that always exist. Private ones (settings, admin, manage) never go here. */
export const STATIC_PATHS = ['/', '/explore', '/privacy', '/terms'];

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const day = (ts: string | null | undefined) => {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export function buildSitemap(entries: SitemapEntry[]): string {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const e of entries) {
    if (!e.path.startsWith('/') || seen.has(e.path)) continue;
    seen.add(e.path);
    const lastmod = day(e.lastmod);
    urls.push(`  <url><loc>${xmlEscape(SITE + e.path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

const SLUG = /^[a-z0-9-]{1,80}$/i;
const UUID = /^[0-9a-f-]{36}$/i;

export function sitemapEntries(rows: {
  boards: Array<{ slug: string; created_at?: string | null }>;
  hubs: Array<{ slug: string; created_at?: string | null }>;
  posts: Array<{ id: string; created_at?: string | null; edited_at?: string | null }>;
}): SitemapEntry[] {
  return [
    ...STATIC_PATHS.map((path) => ({ path })),
    ...rows.hubs.filter((h) => SLUG.test(h.slug)).map((h) => ({ path: `/h/${h.slug}`, lastmod: h.created_at })),
    ...rows.boards.filter((b) => SLUG.test(b.slug)).map((b) => ({ path: `/b/${b.slug}`, lastmod: b.created_at })),
    ...rows.posts.filter((p) => UUID.test(p.id)).map((p) => ({ path: `/post/${p.id}`, lastmod: p.edited_at ?? p.created_at })),
  ];
}
