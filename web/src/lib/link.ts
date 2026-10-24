/**
 * What a pasted product link is (Add a product, 0024). The same algorithm as
 * public.v2_parse_link() in supabase/migrations/0024_v2_add_product.sql and
 * parseLink() in supabase/functions/link-preview/rules.ts; src/test/addProduct.test.tsx
 * runs this copy and the Edge Function's over one case table so they cannot drift.
 * (A copy rather than an import: Vite's dev server does not serve files outside web/.)
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
