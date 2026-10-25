/**
 * /sitemap.xml (rewritten here by vercel.json). Reads public rows with the anon
 * key, so only what anyone can see is listed. On any failure it still answers
 * with the static pages rather than an error.
 */
import { buildSitemap, sitemapEntries } from './_lib/sitemap.js';

interface Res { status(code: number): Res; setHeader(k: string, v: string): void; send(body: string): void }

async function rows<T>(base: string, anon: string, q: string): Promise<T[]> {
  const r = await fetch(`${base}/rest/v1/${q}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` }, signal: AbortSignal.timeout(4000) });
  return r.ok ? ((await r.json()) as T[]) : [];
}

export default async function handler(_req: unknown, res: Res): Promise<void> {
  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  let boards: Array<{ slug: string; created_at: string }> = [];
  let hubs: Array<{ slug: string; created_at: string }> = [];
  let posts: Array<{ id: string; created_at: string; edited_at: string | null }> = [];
  if (base && anon) {
    try {
      [boards, hubs, posts] = await Promise.all([
        rows<{ slug: string; created_at: string }>(base, anon, 'board?select=slug,created_at&status=eq.live&order=slug&limit=5000'),
        rows<{ slug: string; created_at: string }>(base, anon, 'hub?select=slug,created_at&status=eq.live&order=slug&limit=1000'),
        rows<{ id: string; created_at: string; edited_at: string | null }>(
          base,
          anon,
          'post?select=id,created_at,edited_at&hidden_at=is.null&status=neq.merged&order=created_at.desc&limit=40000',
        ),
      ]);
    } catch {
      // static pages only
    }
  }
  res.status(200);
  res.setHeader('content-type', 'application/xml; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=3600');
  res.send(buildSitemap(sitemapEntries({ boards, hubs, posts })));
}
