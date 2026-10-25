/**
 * Link previews for crawlers (X, WhatsApp, Slack, LinkedIn, search engines).
 * The app is a SPA, so crawlers that don't run JS only ever see index.html.
 * `middleware.ts` (Vercel Routing Middleware) uses these helpers to swap the
 * title, description and canonical URL in that HTML for board, hub and post
 * pages. Pure functions so they are unit tested here; no network in this file.
 */

export const SITE = 'https://publisense.app';
export const DEFAULT_TITLE = 'Publisense';
export const DEFAULT_DESCRIPTION =
  'Public feedback boards for the products you use. Upvote, follow and share feedback with the teams who build your tools.';

export interface ShareMeta {
  title: string;
  description: string;
  /** Path on the site, e.g. /b/cursor */
  path: string;
}

const CRAWLER =
  /bot|crawler|spider|facebookexternalhit|facebot|whatsapp|slack|discord|telegram|linkedin|embedly|pinterest|skype|vkshare|redditbot|applebot|quora|mastodon|bluesky|preview/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && CRAWLER.test(userAgent));
}

/** Which record a path previews, or null for pages that keep the site defaults. */
export function shareTarget(pathname: string): { kind: 'board' | 'hub' | 'post'; key: string } | null {
  const m = /^\/(b|h|post)\/([^/?#]+)\/?$/.exec(pathname);
  if (!m || !m[1] || !m[2]) return null;
  const key = decodeURIComponent(m[2]);
  if (m[1] === 'post') return /^[0-9a-f-]{36}$/i.test(key) ? { kind: 'post', key } : null;
  return /^[a-z0-9-]{1,80}$/i.test(key) ? { kind: m[1] === 'b' ? 'board' : 'hub', key } : null;
}

export function boardMeta(b: { slug: string; name: string; tagline?: string | null }): ShareMeta {
  return {
    title: `${b.name} feedback · Publisense`,
    description: clip(b.tagline ? `${b.tagline}. See what people are asking ${b.name} for, upvote it, and follow along.` : `See what people are asking ${b.name} for, upvote it, and follow along on Publisense.`),
    path: `/b/${b.slug}`,
  };
}

export function hubMeta(h: { slug: string; name: string; description?: string | null }): ShareMeta {
  return {
    title: `${h.name} · Publisense`,
    description: clip(h.description || `Feedback for every ${h.name} product, in one place.`),
    path: `/h/${h.slug}`,
  };
}

export function postMeta(p: { id: string; title: string; body?: string | null; board?: { name: string } | null }): ShareMeta {
  return {
    title: clip(`${p.title}${p.board ? ` · ${p.board.name}` : ''} · Publisense`, 110),
    description: clip(p.body?.trim() || (p.board ? `Feedback for ${p.board.name} on Publisense.` : DEFAULT_DESCRIPTION)),
    path: `/post/${p.id}`,
  };
}

export function clip(s: string, max = 200): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rewrite the head of index.html for one page. Unknown markup is left alone. */
export function applyMeta(html: string, meta: ShareMeta): string {
  const title = escapeAttr(meta.title);
  const desc = escapeAttr(meta.description);
  const url = escapeAttr(`${SITE}${meta.path}`);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
}
