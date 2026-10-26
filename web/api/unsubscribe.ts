/**
 * /api/unsubscribe?token= : the RFC 8058 one-click unsubscribe endpoint named in
 * every notification email's List-Unsubscribe header (#138).
 *
 *  - POST (the inbox's own "Unsubscribe" button, body `List-Unsubscribe=One-Click`):
 *    turns every email off through the same `unsubscribe(p_token)` RPC the
 *    /unsubscribe page uses, with no sign-in, cookies or redirects, and answers 200.
 *  - GET (someone opening the header URL by hand): redirects to the visible
 *    /unsubscribe?token= page, which does the same thing and shows the result.
 *
 * Like the page, it never says whether a token exists: an unknown token gets the
 * same 200 as a real one. Only a transport failure answers 503, so the mailbox
 * provider may retry.
 */

interface Req { method?: string; query: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(k: string, v: string): void; send(body: string): void }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim();

export default async function handler(req: Req, res: Res): Promise<void> {
  const token = one(req.query.token);
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.status(303);
    res.setHeader('location', `/unsubscribe${UUID_RE.test(token) ? `?token=${encodeURIComponent(token)}` : ''}`);
    res.send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405);
    res.setHeader('allow', 'GET, HEAD, POST');
    res.send('method not allowed');
    return;
  }

  // A malformed token can't name anyone; answer like any other unknown token.
  if (!UUID_RE.test(token)) {
    res.status(200);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.send('ok');
    return;
  }

  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!base || !anon) {
    res.status(503);
    res.send('unavailable');
    return;
  }
  try {
    const r = await fetch(`${base}/rest/v1/rpc/unsubscribe`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      res.status(503);
      res.send('unavailable');
      return;
    }
  } catch {
    res.status(503);
    res.send('unavailable');
    return;
  }
  res.status(200);
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.send('ok');
}
