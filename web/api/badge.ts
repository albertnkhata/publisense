/**
 * /badge/<slug>.svg (rewritten here by vercel.json): the board's open-feedback
 * count as an SVG badge. Public data only, read with the anon key. An unknown
 * or non-live board gets a grey "not found" badge rather than a broken image.
 */
import { boardBadge, isBadgeSlug, OPEN_STATUSES } from './_lib/badge.js';

interface Req { query?: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(k: string, v: string): void; send(body: string): void }

async function openCount(base: string, anon: string, slug: string): Promise<number | null> {
  const headers = { apikey: anon, authorization: `Bearer ${anon}` };
  const b = await fetch(`${base}/rest/v1/board?select=id&slug=eq.${encodeURIComponent(slug)}&status=eq.live&limit=1`, { headers, signal: AbortSignal.timeout(4000) });
  if (!b.ok) throw new Error('board');
  const rows = (await b.json()) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) return null;
  const p = await fetch(
    `${base}/rest/v1/post?select=id&board_id=eq.${id}&hidden_at=is.null&status=in.(${OPEN_STATUSES.join(',')})`,
    { method: 'HEAD', headers: { ...headers, prefer: 'count=exact', range: '0-0' }, signal: AbortSignal.timeout(4000) },
  );
  const total = Number((p.headers.get('content-range') ?? '').split('/')[1]);
  if (!Number.isFinite(total)) throw new Error('count');
  return total;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const raw = req.query?.slug;
  const slug = ((Array.isArray(raw) ? raw[0] : raw) ?? '').toLowerCase().replace(/\.svg$/, '');
  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  let open: number | null = null;
  let ok = true;
  if (isBadgeSlug(slug) && base && anon) {
    try {
      open = await openCount(base, anon, slug);
    } catch {
      ok = false;
    }
  }
  res.status(200);
  res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
  // Short edge cache: counts move, and GitHub's camo proxy respects it.
  res.setHeader('cache-control', ok && open !== null ? 'public, max-age=300, s-maxage=600' : 'public, max-age=60, s-maxage=60');
  res.send(boardBadge(open));
}
