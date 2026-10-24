/**
 * Pure rules for the link-preview Edge Function: link parsing, the SSRF address
 * checks, HTML metadata extraction and image sniffing. No Deno or Supabase imports,
 * so the web tests import this file directly (web/src/test/linkPreview.test.ts).
 *
 * parseLink() is the same algorithm as public.v2_parse_link() in
 * supabase/migrations/0024_v2_add_product.sql and parseLink() in web/src/lib/link.ts.
 * A web test runs both TypeScript copies over one case table; the SQL copy is
 * checked on the same cases in supabase/tests/v2_rls_test.sql.
 */

export type LinkKind = 'site' | 'github';
export interface ParsedLink {
  kind: LinkKind;
  /** "github.com/owner/repo" or the bare host (lower-case, no www., no port). */
  canonical: string;
  /** host + path, lower-case, for boards that live under a path ("figma.com/figjam"). */
  full: string;
}

export const GITHUB_RESERVED = [
  'about', 'apps', 'blog', 'codespaces', 'collections', 'contact', 'customer-stories', 'enterprise',
  'events', 'explore', 'features', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications',
  'orgs', 'organizations', 'pricing', 'pulls', 'readme', 'search', 'security', 'settings', 'signup',
  'site', 'sponsors', 'team', 'topics', 'trending',
];

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function parseLink(raw: string | null | undefined): ParsedLink | null {
  let s = (raw ?? '').trim();
  if (!s || s.length > 2048 || /\s/.test(s)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^https?:\/\//i.test(s)) return null;
    s = s.replace(/^https?:\/\//i, '');
  } else if (/^(javascript|data|mailto|file|ftp|about|blob|vbscript|tel):/i.test(s)) {
    return null;
  } else if (s.startsWith('//')) {
    s = s.slice(2);
  }
  const auth = /^[^/?#]*/.exec(s)?.[0] ?? '';
  const rest = s.slice(auth.length);
  if (auth.includes('@')) return null;
  let host = auth.replace(/:[0-9]{1,5}$/, '').toLowerCase();
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  if (host.length > 253 || !HOST_RE.test(host) || /\.[0-9]+$/.test(host)) return null;

  const path = (/^[^?#]*/.exec(rest)?.[0] ?? '').toLowerCase();
  const segs = path.split('/').filter(Boolean);
  const full = segs.length ? `${host}/${segs.join('/')}` : host;

  if (host === 'github.com' && segs.length >= 2 && !GITHUB_RESERVED.includes(segs[0]!)) {
    const owner = segs[0]!;
    const repo = segs[1]!.replace(/\.git$/, '');
    if (/^[a-z0-9]([a-z0-9-]{0,38})$/.test(owner) && /^[a-z0-9._-]{1,100}$/.test(repo) && repo !== '.' && repo !== '..') {
      return { kind: 'github', canonical: `github.com/${owner}/${repo}`, full };
    }
  }
  return { kind: 'site', canonical: host, full };
}

// ------------------------------------------------------------------ SSRF guards

export const LIMITS = {
  /** Whole request budget, redirects included. */
  timeoutMs: 5000,
  /** HTML is read up to this many bytes; the <head> is near the top. */
  maxHtmlBytes: 512 * 1024,
  /** Same as the board-logos bucket (0018). */
  maxImageBytes: 1024 * 1024,
  maxRedirects: 3,
  /** Per signed-in user, per function instance. */
  perMinute: 20,
} as const;

/** Host names that only ever mean something inside a network. */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.')) return true;
  return /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|onion|test|invalid|example)$/.test(h);
}

/** Is this a literal IPv4 or IPv6 address (with or without brackets)? */
export function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
}

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const V4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

/** Private, loopback, link-local, CGNAT, documentation, multicast and reserved IPv4. */
export function isPrivateIPv4(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return true; // unparseable: refuse
  return V4_BLOCKED.some(([base, bits]) => {
    const b = v4ToInt(base)!;
    const size = 2 ** (32 - bits);
    return n >= b && n < b + size;
  });
}

/** Expand an IPv6 address to 8 groups, or null. Handles :: and a trailing dotted IPv4. */
export function expandIPv6(ip: string): number[] | null {
  let s = ip.replace(/^\[|\]$/g, '').toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  if (s.includes('.')) {
    const cut = s.lastIndexOf(':');
    const n = v4ToInt(s.slice(cut + 1));
    if (cut < 0 || n === null) return null;
    tail = [Math.floor(n / 65536), n % 65536];
    s = s.slice(0, cut + 1);
    s = s.endsWith('::') ? s : s.slice(0, -1);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)) : []);
  const head = parse(halves[0] ?? '');
  const back = halves.length === 2 ? parse(halves[1] ?? '') : [];
  const want = 8 - tail.length;
  let groups: number[];
  if (halves.length === 2) {
    const fill = want - head.length - back.length;
    if (fill < 0) return null;
    groups = [...head, ...new Array(fill).fill(0), ...back];
  } else {
    groups = head;
  }
  groups = [...groups, ...tail];
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  return groups;
}

/** Loopback, unspecified, ULA, link-local, multicast, documentation, and IPv4 embedded in mapped / NAT64 / 6to4 forms. */
export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true;
  const [a, b] = [g[0]!, g[1]!];
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateIPv4(v4(g[6]!, g[7]!)); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::a.b.c.d (deprecated compat)
  if (a === 0x64 && b === 0xff9b) return isPrivateIPv4(v4(g[6]!, g[7]!)); // NAT64
  if (a === 0x2002) return isPrivateIPv4(v4(b, g[2]!)); // 6to4
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 (site-local)
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if (a === 0x2001 && b < 0x200) return true; // 2001::/23 IETF protocol assignments (Teredo etc.)
  if (a === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // 100::/64 discard
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * May the function fetch this URL at all (before DNS)? http(s) only, default ports
 * only, a host name (never an IP literal), no credentials, nothing internal-looking.
 */
export function urlAllowed(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  if (!host || isIpLiteral(host) || isBlockedHostname(host)) return false;
  return HOST_RE.test(host.replace(/\.$/, ''));
}

// ------------------------------------------------------------------ HTML metadata

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", mdash: '—', ndash: '–', hellip: '…', middot: '·' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith('#x')) return safeChar(parseInt(k.slice(2), 16), m);
    if (k.startsWith('#')) return safeChar(parseInt(k.slice(1), 10), m);
    return ENTITIES[k] ?? m;
  });
}

function safeChar(code: number, fallback: string): string {
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : fallback;
}

/** One line, collapsed spaces, at most `max` characters (cut at a word, with …). */
export function oneLine(s: string | null | undefined, max: number): string {
  const t = decodeEntities(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** "Linear – Plan and build products" -> "Linear". */
export function nameFromTitle(title: string): string {
  const t = oneLine(title, 200);
  const parts = t.split(/\s+[|–—·•:-]\s+/);
  const first = (parts[0] ?? '').trim();
  return first.length >= 2 ? first : t;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]!.toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

export interface PageMeta {
  name: string;
  description: string;
  /** Logo candidates, best first, as absolute http(s) URLs. */
  icons: string[];
}

function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function largest(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (/any/i.test(sizes)) return 512;
  return Math.max(0, ...sizes.split(/\s+/).map((s) => Number(/^(\d+)x\d+$/i.exec(s)?.[1] ?? 0)));
}

/** Name, one-line description and logo candidates from a page's <head>. */
export function extractMeta(html: string, baseUrl: string): PageMeta {
  const head = html.slice(0, LIMITS.maxHtmlBytes);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '';
  const siteName = meta['og:site_name'] ?? meta['application-name'] ?? meta['apple-mobile-web-app-title'];
  const name = oneLine(siteName ? siteName : nameFromTitle(meta['og:title'] ?? title), 60);
  const description = oneLine(meta['og:description'] ?? meta['description'] ?? meta['twitter:description'] ?? '', 120);

  const touch: Array<[number, string]> = [];
  const icon: Array<[number, string]> = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel ?? '').toLowerCase().split(/\s+/);
    const href = absolute(a.href, baseUrl);
    if (!href) continue;
    const type = (a.type ?? '').toLowerCase();
    // Formats the board-logos bucket cannot hold (ico, svg) go last.
    const storable = !/\.(ico|svg)(\?|#|$)/i.test(href) && !/svg|icon/.test(type);
    if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) touch.push([largest(a.sizes) || 180, href]);
    else if (rel.includes('icon')) icon.push([(largest(a.sizes) || 32) + (storable ? 1000 : 0), href]);
  }
  const byScore = (l: Array<[number, string]>) => l.sort((x, y) => y[0] - x[0]).map(([, h]) => h);
  const og = absolute(meta['og:image'] ?? meta['twitter:image'], baseUrl);
  const fallback = absolute('/apple-touch-icon.png', baseUrl);
  const icons = [...byScore(touch), ...byScore(icon), ...(og ? [og] : []), ...(fallback ? [fallback] : [])];
  return { name, description, icons: [...new Set(icons)] };
}

// ------------------------------------------------------------------ images

/** png / jpg / webp by magic bytes (never by the Content-Type a server claims). */
export function sniffImage(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

export const MIME: Record<'png' | 'jpg' | 'webp', string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// ------------------------------------------------------------------ http

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
