// Supabase Edge Function: link-preview (Deno). "Add a product" (0024).
//
// Two jobs, both for signed-in users only (JWT verification stays on, and the token
// is checked again with the auth server here):
//
//   POST { url }       -> { kind, canonical, name, description, icon_url }
//                         Autofill for the Add a product form. A GitHub repo is read
//                         from the public GitHub API (name, description, owner avatar);
//                         any other link from its site's home page (<title>, og: and
//                         description meta, apple-touch-icon / icon links / og:image).
//   POST { board_id }  -> { ok, logo_path }
//                         After create_board: fetch the product's logo once and store it
//                         in the board-logos bucket at {board_id}/{uuid}.{png|jpg|webp}
//                         (the 0018 path scheme), then set board.logo_path. Only the
//                         board's creator, only while it is pending and has no logo.
//                         The logo source is derived again from board.site here, never
//                         taken from the client. Formats the bucket refuses (ico, svg)
//                         are skipped, and the board keeps its colour-and-initial tile.
//
// SSRF guards (rules.ts): http/https only, ports 80/443 only, no credentials in the URL,
// no IP literals, no internal-looking host names; every host is resolved first and
// refused if ANY address is private, loopback, link-local, CGNAT, multicast, reserved
// or an IPv4 embedded in such a range; redirects are followed by hand (at most 3) and
// every hop is checked the same way; 5 s budget for the whole request; HTML is read up
// to 512 KB, images up to 1 MB, both as streams that are cut off at the cap; images are
// accepted by magic bytes, not by Content-Type; 20 requests a minute per user per instance.
// What it cannot rule out: a host whose DNS answer changes between our lookup and
// fetch()'s own (DNS rebinding). The function holds no secrets beyond the service role
// key it needs to write the logo, and only ever returns parsed text and one URL.
//
// Deploy (not done by CI):
//   supabase functions deploy link-preview --project-ref wyjfgrgxmhumyzwcrywj
// Keep JWT verification on (the default; do NOT pass --no-verify-jwt).
// Optional secret: GITHUB_TOKEN (any read-only token) lifts GitHub's 60 requests/hour
// per IP limit for unauthenticated API calls, which Edge Function IPs share.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  CORS_HEADERS,
  extractMeta,
  isPrivateAddress,
  json,
  LIMITS,
  MIME,
  oneLine,
  parseLink,
  sniffImage,
  urlAllowed,
  type ParsedLink,
} from './rules.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const UA = 'PublisenseBot/1.0 (+https://publisense.app)';

class FetchRefused extends Error {}

// ------------------------------------------------------------------ guarded fetch

async function resolveAll(host: string): Promise<string[]> {
  const out: string[] = [];
  let native = false;
  for (const type of ['A', 'AAAA'] as const) {
    try {
      out.push(...(await Deno.resolveDns(host, type)));
      native = true;
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) native = true; // no records of this type
    }
  }
  if (native) return out;
  // Runtime without resolveDns: ask a public DNS-over-HTTPS resolver (a fixed host).
  for (const type of ['A', 'AAAA']) {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) continue;
    const body = (await r.json()) as { Answer?: Array<{ type: number; data: string }> };
    for (const a of body.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
  }
  return out;
}

async function checkHost(u: URL): Promise<void> {
  if (!urlAllowed(u)) throw new FetchRefused('url_not_allowed');
  const addrs = await resolveAll(u.hostname);
  if (addrs.length === 0) throw new FetchRefused('unresolved');
  if (addrs.some(isPrivateAddress)) throw new FetchRefused('private_address');
}

/** Read at most `max` bytes. `strict`: more than that is a refusal, not a truncation. */
async function readCapped(res: Response, max: number, strict: boolean): Promise<Uint8Array> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (strict && len > max) throw new FetchRefused('too_large');
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      if (strict) throw new FetchRefused('too_large');
      chunks.push(value.subarray(0, value.byteLength - (total - max)));
      total = max;
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function guardedFetch(
  start: string,
  { accept, max, strict, deadline }: { accept: string; max: number; strict: boolean; deadline: number },
): Promise<{ url: string; bytes: Uint8Array; type: string }> {
  let url = new URL(start);
  for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
    await checkHost(url);
    const left = deadline - Date.now();
    if (left <= 0) throw new FetchRefused('timeout');
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept, 'accept-language': 'en' },
      signal: AbortSignal.timeout(left),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      await res.body?.cancel();
      if (!loc) throw new FetchRefused('bad_redirect');
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchRefused(`status_${res.status}`);
    }
    return { url: url.toString(), bytes: await readCapped(res, max, strict), type: (res.headers.get('content-type') ?? '').toLowerCase() };
  }
  throw new FetchRefused('too_many_redirects');
}

// ------------------------------------------------------------------ sources

interface Preview {
  kind: ParsedLink['kind'];
  canonical: string;
  name: string;
  description: string;
  icon_url: string | null;
  /** Every logo candidate, best first (used by the store step, not returned). */
  icons: string[];
}

async function previewGithub(link: ParsedLink, deadline: number): Promise<Preview | null> {
  const [, owner, repo] = link.canonical.split('/');
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': UA, 'x-github-api-version': '2022-11-28' };
  if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}`, {
    headers,
    signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
  });
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new FetchRefused(`github_${res.status}`);
  }
  const data = JSON.parse(new TextDecoder().decode(await readCapped(res, 256 * 1024, true))) as {
    name?: string;
    full_name?: string;
    description?: string | null;
    private?: boolean;
    owner?: { avatar_url?: string };
  };
  if (data.private) return null;
  const canonical = data.full_name ? `github.com/${data.full_name.toLowerCase()}` : link.canonical;
  let avatar: string | null = null;
  if (data.owner?.avatar_url) {
    const a = new URL(data.owner.avatar_url);
    a.searchParams.set('s', '256');
    avatar = a.toString();
  }
  return {
    kind: 'github',
    canonical,
    name: oneLine(data.name ?? repo, 60),
    description: oneLine(data.description ?? '', 120),
    icon_url: avatar,
    icons: avatar ? [avatar] : [],
  };
}

async function previewSite(link: ParsedLink, deadline: number): Promise<Preview> {
  const page = await guardedFetch(`https://${link.canonical}/`, {
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    max: LIMITS.maxHtmlBytes,
    strict: false,
    deadline,
  });
  const html = page.type.includes('html') || page.type === '' ? new TextDecoder().decode(page.bytes) : '';
  const meta = extractMeta(html, page.url);
  return { kind: 'site', canonical: link.canonical, name: meta.name, description: meta.description, icon_url: meta.icons[0] ?? null, icons: meta.icons };
}

async function preview(link: ParsedLink): Promise<Preview | null> {
  const deadline = Date.now() + LIMITS.timeoutMs;
  return link.kind === 'github' ? previewGithub(link, deadline) : previewSite(link, deadline);
}

// ------------------------------------------------------------------ rate limit (per instance)

const hits = new Map<string, number[]>();
function limited(uid: string): boolean {
  const now = Date.now();
  const recent = (hits.get(uid) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(uid, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMITS.perMinute;
}

// ------------------------------------------------------------------ handler

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('link-preview: SUPABASE_URL or the service role key is not set');
    return json(500, { error: 'not_configured' });
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'unauthorized' });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (authError || !uid) return json(401, { error: 'unauthorized' });
  if (limited(uid)) return json(429, { error: 'rate_limited' });

  let body: { url?: unknown; board_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { error: 'bad_request' });
  }

  try {
    if (typeof body.board_id === 'string') return await storeLogo(admin, uid, body.board_id);
    if (typeof body.url !== 'string') return json(400, { error: 'bad_request' });
    const link = parseLink(body.url);
    if (!link) return json(400, { error: 'invalid_link' });
    const p = await preview(link);
    if (!p) return json(404, { error: 'not_found', kind: link.kind, canonical: link.canonical });
    const { icons: _icons, ...out } = p;
    return json(200, out);
  } catch (e) {
    // A site we may not or cannot read is not an error for the form: it just gets no autofill.
    const reason = e instanceof FetchRefused ? e.message : e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'fetch_failed';
    if (!(e instanceof FetchRefused)) console.error(`link-preview: ${reason}: ${e instanceof Error ? e.message : String(e)}`);
    return json(422, { error: 'unreadable', reason });
  }
});

// deno-lint-ignore no-explicit-any
async function storeLogo(admin: any, uid: string, boardId: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/.test(boardId)) return json(400, { error: 'bad_request' });
  const { data: board, error } = await admin.from('board').select('id, site, status, created_by, logo_path').eq('id', boardId).maybeSingle();
  if (error) return json(500, { error: 'failed' });
  if (!board || board.created_by !== uid) return json(404, { error: 'not_found' });
  if (board.status !== 'pending' || board.logo_path) return json(409, { error: 'not_needed' });
  const link = parseLink(board.site);
  if (!link) return json(200, { ok: true, logo_path: null });

  const p = await preview(link).catch(() => null);
  const deadline = Date.now() + LIMITS.timeoutMs;
  for (const src of (p?.icons ?? []).slice(0, 4)) {
    try {
      const img = await guardedFetch(src, { accept: 'image/png,image/jpeg,image/webp;q=0.9,*/*;q=0.1', max: LIMITS.maxImageBytes, strict: true, deadline });
      const ext = sniffImage(img.bytes);
      if (!ext || img.bytes.byteLength < 64) continue;
      const path = `${board.id}/${crypto.randomUUID()}.${ext}`;
      const up = await admin.storage.from('board-logos').upload(path, img.bytes, { contentType: MIME[ext], upsert: false });
      if (up.error) {
        console.error(`link-preview: upload failed: ${up.error.message}`);
        break;
      }
      const set = await admin.from('board').update({ logo_path: path }).eq('id', board.id).is('logo_path', null).select('id');
      if (set.error || !set.data?.length) {
        await admin.storage.from('board-logos').remove([path]);
        return json(409, { error: 'not_needed' });
      }
      return json(200, { ok: true, logo_path: path });
    } catch {
      // Try the next candidate.
    }
  }
  return json(200, { ok: true, logo_path: null });
}
