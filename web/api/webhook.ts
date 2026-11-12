import { parseInboundWebhook } from './_lib/inboundWebhook.js';

interface Req {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface Res {
  status(code: number): Res;
  setHeader(k: string, v: string): void;
  send(body: string): void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim();

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');
  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.status(405);
    res.setHeader('allow', 'POST');
    res.send(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const token = one(req.query.token);
  if (!UUID_RE.test(token)) {
    res.status(401);
    res.send(JSON.stringify({ ok: false, error: 'invalid_token' }));
    return;
  }

  const ghEvent = one(req.headers?.['x-github-event']).toLowerCase();
  if (ghEvent === 'ping') {
    res.status(200);
    res.send(JSON.stringify({ ok: true, pong: true }));
    return;
  }

  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400);
      res.send(JSON.stringify({ ok: false, error: 'invalid_json' }));
      return;
    }
  }

  const transitions = parseInboundWebhook(body, ghEvent || undefined);
  if (transitions.length === 0) {
    res.status(200);
    res.send(JSON.stringify({ ok: true, matched: 0, updated: 0 }));
    return;
  }

  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!base || !anon) {
    res.status(503);
    res.send(JSON.stringify({ ok: false, error: 'unavailable' }));
    return;
  }

  const targets = transitions.slice(0, 10);
  const results = await Promise.allSettled(
    targets.map(async (t) => {
      const r = await fetch(`${base}/rest/v1/rpc/apply_inbound_webhook`, {
        method: 'POST',
        headers: {
          apikey: anon,
          authorization: `Bearer ${anon}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          p_token: token,
          p_post: t.postId,
          p_to: t.to,
          p_note: t.note,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) {
        throw new Error(`upstream_${r.status}`);
      }
      return (await r.json()) as { ok?: boolean; changed?: boolean; error?: string };
    }),
  );

  let hasInvalidToken = false;
  let fulfilledCount = 0;
  let updated = 0;

  for (const resItem of results) {
    if (resItem.status === 'fulfilled') {
      fulfilledCount++;
      const val = resItem.value;
      if (val.error === 'invalid_token') {
        hasInvalidToken = true;
      }
      if (val.changed) {
        updated++;
      }
    }
  }

  if (hasInvalidToken) {
    res.status(401);
    res.send(JSON.stringify({ ok: false, error: 'invalid_token' }));
    return;
  }

  if (targets.length > 0 && fulfilledCount === 0) {
    res.status(502);
    res.send(JSON.stringify({ ok: false, error: 'upstream_error' }));
    return;
  }

  res.status(200);
  res.send(JSON.stringify({ ok: true, matched: transitions.length, updated }));
}
