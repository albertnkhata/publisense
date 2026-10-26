/**
 * Link previews for crawlers (X, WhatsApp, Slack, LinkedIn, search engines).
 * vercel.json routes ONLY crawler user agents on /b/:slug, /h/:slug and
 * /post/:id here; people never hit this function, so a failure here can't
 * break the app. Any error still answers with the plain index.html.
 */
import { applyMeta, boardMeta, hubMeta, postMeta, SITE, type ShareMeta } from './_lib/shareMeta.js';

interface Req { query: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(k: string, v: string): void; send(body: string): void }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** What a lookup found: the page's meta, a definite "no such page", or null when we couldn't tell. */
export type Lookup = ShareMeta | 'missing' | null;

export async function lookup(kind: string, key: string): Promise<Lookup> {
  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!base || !anon) return null;
  const k = encodeURIComponent(key);
  const q =
    kind === 'board' && /^[a-z0-9-]{1,80}$/i.test(key)
      ? `board?select=slug,name,tagline&slug=eq.${k}&status=eq.live&limit=1`
      : kind === 'hub' && /^[a-z0-9-]{1,80}$/i.test(key)
        ? `hub?select=slug,name,description&slug=eq.${k}&limit=1`
        : kind === 'post' && /^[0-9a-f-]{36}$/i.test(key)
          ? `post?select=id,title,body,board(name)&id=eq.${k}&hidden_at=is.null&limit=1`
          : null;
  // A key that can't name a board, hub or post is a definite miss.
  if (!q) return 'missing';
  const r = await fetch(`${base}/rest/v1/${q}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` }, signal: AbortSignal.timeout(2000) });
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<Record<string, unknown>>;
  const row = rows[0];
  // The query ran and the public can't see such a row: unknown, pending, rejected,
  // hidden or deleted. Crawlers get a real 404 so these aren't indexed as soft 404s.
  if (!row) return 'missing';
  if (kind === 'board') return boardMeta(row as { slug: string; name: string; tagline: string | null });
  if (kind === 'hub') return hubMeta(row as { slug: string; name: string; description: string | null });
  return postMeta(row as { id: string; title: string; body: string | null; board: { name: string } | null });
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const host = one(req.headers['x-forwarded-host']) || one(req.headers.host);
  const origin = host ? `https://${host}` : SITE;
  let html = '';
  let missing = false;
  try {
    const page = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(2000) });
    html = await page.text();
    const meta = await lookup(one(req.query.kind), one(req.query.key));
    if (meta === 'missing') missing = true;
    else if (meta) html = applyMeta(html, meta);
  } catch {
    // fall through with whatever we have
  }
  if (!html) {
    res.status(302);
    res.setHeader('location', SITE);
    res.send('');
    return;
  }
  res.status(missing ? 404 : 200);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=600');
  res.send(html);
}
