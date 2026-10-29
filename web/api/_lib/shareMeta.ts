/**
 * Link previews for crawlers (X, WhatsApp, Slack, LinkedIn, search engines).
 * The app is a SPA, so crawlers that don't run JS only ever see index.html.
 * `api/share.ts` (crawler-only function) uses these helpers to swap the
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
  /**
   * Where search engines should send this page's ranking, when it is not the page
   * itself: a merged post points at the post it was merged into (0043).
   */
  canonicalPath?: string;
  /** The page's own preview image (api/og.ts); without one the site-wide /og.png stays. */
  image?: { path: string; alt: string };
}

/**
 * Short, stable version tag for a preview image URL. Chat apps cache images by URL,
 * so a renamed post or board gets a fresh image instead of the old picture.
 */
export function imageVersion(...parts: Array<string | null | undefined>): string {
  let h = 5381;
  for (const ch of parts.map((p) => p ?? '').join('|')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

const CRAWLER =
  /bot|crawler|spider|facebookexternalhit|facebot|whatsapp|slack|discord|telegram|linkedin|embedly|pinterest|skype|vkshare|redditbot|applebot|quora|mastodon|bluesky|preview/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && CRAWLER.test(userAgent));
}

/** Which record a path previews, or null for pages that keep the site defaults. */
export function shareTarget(pathname: string): { kind: 'board' | 'hub' | 'post' | 'user'; key: string } | null {
  const m = /^\/(b|h|post|u)\/([^/?#]+)\/?$/.exec(pathname);
  if (!m || !m[1] || !m[2]) return null;
  const key = decodeURIComponent(m[2]);
  if (m[1] === 'u') {
    const h = key.replace(/^@/, '').toLowerCase();
    return /^[a-z0-9_]{3,30}$/.test(h) ? { kind: 'user', key: h } : null;
  }
  if (m[1] === 'post') return /^[0-9a-f-]{36}$/i.test(key) ? { kind: 'post', key } : null;
  return /^[a-z0-9-]{1,80}$/i.test(key) ? { kind: m[1] === 'b' ? 'board' : 'hub', key } : null;
}

export function boardMeta(b: { slug: string; name: string; tagline?: string | null }): ShareMeta {
  return {
    title: `${b.name} feedback · Publisense`,
    description: clip(b.tagline ? `${b.tagline}. See what people are asking ${b.name} for, upvote it, and follow along.` : `See what people are asking ${b.name} for, upvote it, and follow along on Publisense.`),
    path: `/b/${b.slug}`,
    image: {
      path: `/api/og?kind=board&key=${encodeURIComponent(b.slug)}&v=${imageVersion(b.name, b.tagline)}`,
      alt: `${b.name} on Publisense`,
    },
  };
}

export function userMeta(u: { handle: string; name?: string | null; bio?: string | null }): ShareMeta {
  const name = u.name?.trim() || `@${u.handle}`;
  return {
    title: clip(`${name}${u.name?.trim() ? ` (@${u.handle})` : ''} · Publisense`, 110),
    description: clip(u.bio?.trim() || `See what ${name} has asked product teams for on Publisense.`),
    path: `/u/${u.handle}`,
    image: {
      path: `/api/og?kind=user&key=${encodeURIComponent(u.handle)}&v=${imageVersion(u.name, u.bio)}`,
      alt: `${name} on Publisense`,
    },
  };
}

export function hubMeta(h: { slug: string; name: string; description?: string | null }): ShareMeta {
  return {
    title: `${h.name} · Publisense`,
    description: clip(h.description || `Feedback for every ${h.name} product, in one place.`),
    path: `/h/${h.slug}`,
  };
}

export interface PostMetaRow {
  id: string;
  title: string;
  body?: string | null;
  board?: { name: string } | null;
  status?: string | null;
  merged_into?: string | null;
  /** The surviving post, embedded through merged_into. */
  merged?: { id: string; title: string } | null;
}

export function postMeta(p: PostMetaRow): ShareMeta {
  // A merged post is a real page ("Merged into …"), not a 404, but its canonical URL is
  // the surviving post, so search engines index that one instead of the duplicate.
  if (p.status === 'merged' && p.merged_into) {
    const into = p.merged?.title?.trim();
    return {
      title: clip(`${p.title}${p.board ? ` · ${p.board.name}` : ''} · Publisense`, 110),
      description: clip(into ? `Merged into “${into}”. Votes and followers moved there.` : 'Merged into another post. Votes and followers moved there.'),
      path: `/post/${p.id}`,
      canonicalPath: `/post/${p.merged_into}`,
      image: postImage(p),
    };
  }
  return {
    title: clip(`${p.title}${p.board ? ` · ${p.board.name}` : ''} · Publisense`, 110),
    description: clip(p.body?.trim() || (p.board ? `Feedback for ${p.board.name} on Publisense.` : DEFAULT_DESCRIPTION)),
    path: `/post/${p.id}`,
    image: postImage(p),
  };
}

function postImage(p: PostMetaRow): ShareMeta['image'] {
  return {
    path: `/api/og?kind=post&key=${p.id}&v=${imageVersion(p.title, p.status, p.board?.name, p.body)}`,
    alt: clip(`${p.title}${p.board ? ` · ${p.board.name}` : ''}`, 110),
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
  const url = escapeAttr(`${SITE}${meta.canonicalPath ?? meta.path}`);
  const img = meta.image ? escapeAttr(`${SITE}${meta.image.path}`) : '';
  const alt = meta.image ? escapeAttr(meta.image.alt) : '';
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, (m, a: string, b: string) => (img ? `${a}${img}${b}` : m))
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, (m, a: string, b: string) => (img ? `${a}${img}${b}` : m))
    .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, (m, a: string, b: string) => (alt ? `${a}${alt}${b}` : m));
}
