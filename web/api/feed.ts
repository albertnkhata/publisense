/**
 * /b/<slug>/feed.xml and /b/<slug>/changelog.xml (rewritten here by vercel.json):
 * public Atom 1.0 feeds for a live board's open feedback or shipped changelog.
 * Reads with the public anon key so RLS decides visibility.
 */
import { buildAtomFeed, isFeedSlug, type FeedBoard, type FeedMode, type FeedPost } from './_lib/feed.js';

interface Req {
  query?: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  setHeader(k: string, v: string): void;
  send(body: string): void;
}

const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: Req, res: Res): Promise<void> {
  const slug = pick(req.query?.slug).toLowerCase().replace(/\.xml$/, '');
  const mode: FeedMode = pick(req.query?.tab) === 'changelog' ? 'changelog' : 'feedback';
  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

  if (!isFeedSlug(slug) || !base || !anon) {
    res.status(404);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.send('Not found');
    return;
  }

  const headers = { apikey: anon, authorization: `Bearer ${anon}` };
  try {
    const bRes = await fetch(
      `${base}/rest/v1/board?select=id,slug,name,tagline,created_at&slug=eq.${encodeURIComponent(slug)}&status=eq.live&limit=1`,
      { headers, signal: AbortSignal.timeout(4000) },
    );
    if (!bRes.ok) throw new Error('board');
    const boards = (await bRes.json()) as FeedBoard[];
    const board = boards[0];
    if (!board) {
      res.status(404);
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.send('Not found');
      return;
    }

    const statusFilter = mode === 'changelog' ? 'status=eq.shipped' : 'status=neq.merged';
    const pRes = await fetch(
      `${base}/rest/v1/post?select=id,title,body,type,status,vote_count,created_at,edited_at&board_id=eq.${board.id}&hidden_at=is.null&${statusFilter}&order=created_at.desc&limit=30`,
      { headers, signal: AbortSignal.timeout(4000) },
    );
    const posts = pRes.ok ? ((await pRes.json()) as FeedPost[]) : [];

    res.status(200);
    res.setHeader('content-type', 'application/atom+xml; charset=utf-8');
    res.setHeader('cache-control', 'public, max-age=300, s-maxage=600');
    res.send(buildAtomFeed(board, posts, mode));
  } catch {
    res.status(502);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.send('Feed temporarily unavailable');
  }
}
