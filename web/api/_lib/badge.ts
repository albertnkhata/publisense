/**
 * The embeddable feedback badge (/badge/<slug>.svg): a flat two-part label in
 * the shields.io shape, "feedback | 42 open", linking (by the embedder) to the
 * board. Pure so tests can check it without a request.
 */

/** Statuses that still count as open feedback. */
export const OPEN_STATUSES = ['open', 'under_review', 'planned', 'in_progress'] as const;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const isBadgeSlug = (s: unknown): s is string => typeof s === 'string' && SLUG_RE.test(s);

/** "42", "1.2k", "12k". */
export function badgeCount(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.floor(n)));
  const k = n / 1000;
  return `${k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)}k`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rough Verdana 11px advance, the font shields-style badges use. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[mw]/.test(ch) ? 9.5 : /[MW]/.test(ch) ? 11 : /[il.,:;'|!]/.test(ch) ? 3.5 : /[A-Z0-9]/.test(ch) ? 7.5 : ch === ' ' ? 3.8 : 6.6;
  return Math.ceil(w);
}

export const BADGE_BRAND = '#0047AB';
export const BADGE_LABEL_BG = '#555555';
export const BADGE_MUTED = '#9F9F9F';

export function badgeSvg({ label = 'feedback', value, color = BADGE_BRAND }: { label?: string; value: string; color?: string }): string {
  const pad = 6;
  const lw = textWidth(label) + pad * 2;
  const vw = textWidth(value) + pad * 2;
  const w = lw + vw;
  const title = esc(`${label}: ${value}`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
    `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>`,
    `<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="${BADGE_LABEL_BG}"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>`,
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`,
    `<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw / 2}" y="14">${esc(label)}</text>`,
    `<text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(value)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text>`,
    `</g></svg>`,
  ].join('');
}

/** The badge for a board's open count, or a grey "not found" one. */
export function boardBadge(open: number | null): string {
  return open === null ? badgeSvg({ value: 'not found', color: BADGE_MUTED }) : badgeSvg({ value: `${badgeCount(open)} open` });
}
