/**
 * Vercel Routing Middleware: link previews for board, hub and post pages.
 * Only crawlers get the rewritten HTML (people get the SPA untouched, with no
 * extra round trip). Reads public rows with the anon key, the same access an
 * anonymous visitor has, so a pending or hidden record previews as the site.
 */
import { applyMeta, boardMeta, hubMeta, isCrawler, postMeta, shareTarget, type ShareMeta } from './src/lib/shareMeta';

export const config = { matcher: ['/b/:path*', '/h/:path*', '/post/:path*'] };

declare const process: { env: Record<string, string | undefined> };

async function lookup(kind: 'board' | 'hub' | 'post', key: string): Promise<ShareMeta | null> {
  const base = process.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
  const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!base || !anon) return null;
  const q =
    kind === 'board'
      ? `board?select=slug,name,tagline&slug=eq.${encodeURIComponent(key)}&status=eq.live&limit=1`
      : kind === 'hub'
        ? `hub?select=slug,name,description&slug=eq.${encodeURIComponent(key)}&limit=1`
        : `post?select=id,title,body,board(name)&id=eq.${encodeURIComponent(key)}&hidden_at=is.null&limit=1`;
  const res = await fetch(`${base}/rest/v1/${q}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` }, signal: AbortSignal.timeout(1500) });
  if (!res.ok) return null;
  const [row] = (await res.json()) as Array<Record<string, unknown>>;
  if (!row) return null;
  if (kind === 'board') return boardMeta(row as { slug: string; name: string; tagline: string | null });
  if (kind === 'hub') return hubMeta(row as { slug: string; name: string; description: string | null });
  return postMeta(row as { id: string; title: string; body: string | null; board: { name: string } | null });
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  if (!isCrawler(request.headers.get('user-agent'))) return undefined;
  const url = new URL(request.url);
  const target = shareTarget(url.pathname);
  if (!target) return undefined;
  try {
    const meta = await lookup(target.kind, target.key);
    if (!meta) return undefined;
    const page = await fetch(new URL('/index.html', url), { signal: AbortSignal.timeout(1500) });
    if (!page.ok) return undefined;
    const html = applyMeta(await page.text(), meta);
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=600' },
    });
  } catch {
    // Any failure falls through to the plain SPA: a preview is never worth a broken page.
    return undefined;
  }
}
