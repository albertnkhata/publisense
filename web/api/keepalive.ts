/**
 * /api/keepalive: a daily Vercel cron (see vercel.json "crons") that makes one
 * cheap anon read against Supabase so the free-plan project never sits idle long
 * enough to be paused. Unlike the GitHub scheduled workflows, Vercel crons are
 * not disabled when the repository goes quiet.
 * When CRON_SECRET is set, only Vercel's cron (Authorization: Bearer <secret>) may call it.
 */
interface Req {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  setHeader(k: string, v: string): void;
  send(body: string): void;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405);
    res.setHeader('allow', 'GET, HEAD');
    res.send('method not allowed');
    return;
  }

  const secret = (process.env.CRON_SECRET ?? '').trim();
  const auth = one(req.headers?.authorization).trim();
  if (secret && auth !== `Bearer ${secret}`) {
    res.status(401).send('unauthorized');
    return;
  }

  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!base || !anon) {
    res.status(500).send('missing supabase env');
    return;
  }

  try {
    const r = await fetch(`${base}/rest/v1/board?select=id&limit=1`, {
      headers: { apikey: anon, authorization: `Bearer ${anon}` },
      signal: AbortSignal.timeout(8000),
    });
    res.status(r.ok ? 200 : 502).send(r.ok ? 'ok' : `supabase ${r.status}`);
  } catch {
    res.status(502).send('supabase unreachable');
  }
}
