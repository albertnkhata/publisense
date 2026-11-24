/**
 * /api/unsubscribe?token=[&kind=] : the RFC 8058 one-click unsubscribe endpoint
 * named in every notification email's List-Unsubscribe header (#138).
 *
 *  - POST (the inbox's own "Unsubscribe" button, body `List-Unsubscribe=One-Click`):
 *    turns off either the specific email kind (`kind` query param) or every email
 *    (when `kind` is omitted) through the `unsubscribe(p_token, p_kind)` RPC, with
 *    no sign-in, cookies or redirects, and answers 200.
 *  - GET (someone opening the header URL by hand): redirects to the visible
 *    /unsubscribe?token=[&kind=] page, which does the same thing and shows the result.
 *
 * Like the page, it never says whether a token exists: an unknown or malformed token
 * (or unrecognized kind) gets the same 200 as a real one without turning off other
 * emails. Only a transport failure answers 503, so the mailbox provider may retry.
 */

interface Req { method?: string; query: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(k: string, v: string): void; send(body: string): void }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSUBSCRIBE_KINDS = new Set([
  'reply',
  'mention',
  'followed_post',
  'status_change',
  'upvote_milestone',
  'follow',
  'new_post',
  'claim',
  'join',
  'product',
  'message',
  'weekly_digest',
]);
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim();

export default async function handler(req: Req, res: Res): Promise<void> {
  const token = one(req.query.token);
  const rawKind = one(req.query.kind).toLowerCase();
  const hasKind = rawKind.length > 0;
  const validKind = !hasKind || UNSUBSCRIBE_KINDS.has(rawKind);
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.status(303);
    const qs = new URLSearchParams();
    if (UUID_RE.test(token)) qs.set('token', token);
    if (hasKind) qs.set('kind', rawKind);
    const suffix = qs.toString();
    res.setHeader('location', `/unsubscribe${suffix ? `?${suffix}` : ''}`);
    res.send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405);
    res.setHeader('allow', 'GET, HEAD, POST');
    res.send('method not allowed');
    return;
  }

  // A malformed token or unknown kind can't safely target a category; answer quietly.
  if (!UUID_RE.test(token) || !validKind) {
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
    const payload = hasKind ? { p_token: token, p_kind: rawKind } : { p_token: token };
    const r = await fetch(`${base}/rest/v1/rpc/unsubscribe`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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
