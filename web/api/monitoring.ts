/**
 * /api/monitoring : same-origin Sentry tunnel.
 *
 * The browser SDK posts its envelopes here (Sentry `tunnel` option) instead of
 * straight to sentry.io, so ad and tracker blockers that drop requests to
 * *.sentry.io don't hide real errors from us.
 *
 * Not an open relay: the envelope header's DSN must be exactly this project's
 * own DSN (VITE_SENTRY_DSN: same host, public key and project id), and the
 * envelope is forwarded only to that project's envelope endpoint, which is built
 * from our configured DSN, never from the request. Bodies over MAX_BYTES are
 * refused. Nothing about the visitor is added: no IP, cookies or headers are
 * forwarded, so the SDK's no-PII settings still hold.
 */

export const MAX_BYTES = 512 * 1024;

interface Dsn {
  host: string;
  publicKey: string;
  projectId: string;
}

export function parseDsn(raw: string | undefined | null): Dsn | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const projectId = u.pathname.replace(/^\/+|\/+$/g, '');
    if (u.protocol !== 'https:' || !u.username || !/^\d+$/.test(projectId)) return null;
    return { host: u.host, publicKey: u.username, projectId };
  } catch {
    return null;
  }
}

const sameDsn = (a: Dsn, b: Dsn) => a.host === b.host && a.publicKey === b.publicKey && a.projectId === b.projectId;

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export async function POST(request: Request): Promise<Response> {
  const allowed = parseDsn(process.env.VITE_SENTRY_DSN);
  if (!allowed) return text(503, 'monitoring off');

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) return text(413, 'too large');
  let raw: ArrayBuffer;
  try {
    raw = await request.arrayBuffer();
  } catch {
    return text(400, 'bad request');
  }
  const body = new Uint8Array(raw);
  if (body.byteLength > MAX_BYTES) return text(413, 'too large');
  if (body.byteLength === 0) return text(400, 'empty envelope');

  // The envelope header is the first line: JSON naming the DSN it is meant for.
  let end = body.indexOf(10);
  if (end < 0) end = body.byteLength;
  let header: { dsn?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(body.subarray(0, end))) as { dsn?: unknown };
  } catch {
    return text(400, 'bad envelope');
  }
  const dsn = parseDsn(typeof header.dsn === 'string' ? header.dsn : null);
  if (!dsn || !sameDsn(dsn, allowed)) return text(403, 'unknown project');

  try {
    const upstream = await fetch(`https://${allowed.host}/api/${allowed.projectId}/envelope/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body: raw,
      signal: AbortSignal.timeout(8000),
    });
    // Pass Sentry's status through (429 tells the SDK to back off).
    const headers: Record<string, string> = { 'cache-control': 'no-store' };
    for (const h of ['retry-after', 'x-sentry-rate-limits']) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    return new Response(upstream.status === 200 ? '{}' : null, { status: upstream.status, headers });
  } catch {
    return text(502, 'upstream unavailable');
  }
}

export function GET(): Response {
  return new Response('method not allowed', { status: 405, headers: { allow: 'POST' } });
}
