/**
 * The 1200×630 preview image for a post or board link (WhatsApp, X, Slack, ...).
 * Same look as the site-wide /og.png: white card, cobalt bar along the bottom,
 * but led by the product's own logo and the post's title. Pure: builds the
 * element tree that `api/og.ts` renders, so the layout is unit tested without
 * rendering an image.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const BRAND = '#0047AB';
const INK = '#0B1220';
const INK_SECONDARY = '#4B5563';
const INK_MUTED = '#6B7280';
const LINE = '#E5E7EB';

export interface OgCardData {
  /** The big line: the post's title, or the board's tagline. */
  title: string;
  /** The product (board) name. */
  board: string;
  /** Public URL of the board logo, or null for a coloured initial tile. */
  logoUrl: string | null;
  /** Board colour, for the initial tile when there is no logo. */
  color: string;
  /** Small line under the board name: "Open · 12 upvotes", or "Feedback board". */
  meta: string;
}

/** A satori element: the shape @vercel/og accepts without JSX. */
export interface El {
  type: string;
  props: { style?: Record<string, string | number>; children?: Array<El | string> | El | string; src?: string; width?: number; height?: number };
}

const el = (type: string, style: Record<string, string | number>, children?: El['props']['children'], extra: Partial<El['props']> = {}): El => ({
  type,
  props: { style, ...(children === undefined ? {} : { children }), ...extra },
});

/** Shorter titles get bigger type; longer ones shrink so three lines always fit. */
export function titleSize(title: string): number {
  const n = title.length;
  if (n <= 40) return 68;
  if (n <= 70) return 58;
  if (n <= 110) return 50;
  return 44;
}

export function clipTitle(title: string, max = 140): string {
  const t = title.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function ogCard(d: OgCardData): El {
  const title = clipTitle(d.title);
  const tile = d.logoUrl
    ? el('img', { width: 120, height: 120, borderRadius: 28, border: `2px solid ${LINE}`, objectFit: 'cover' }, undefined, {
        src: d.logoUrl,
        width: 120,
        height: 120,
      })
    : el(
        'div',
        { width: 120, height: 120, borderRadius: 28, background: d.color, color: '#FFFFFF', fontSize: 60, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        (d.board.trim()[0] ?? 'P').toUpperCase(),
      );

  return el(
    'div',
    { width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', flexDirection: 'column', background: '#FFFFFF', fontFamily: 'Jakarta' },
    [
      el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '80px 96px 0 96px' }, [
        el('div', { display: 'flex', alignItems: 'center' }, [
          tile,
          el('div', { display: 'flex', flexDirection: 'column', marginLeft: 32 }, [
            el('div', { fontSize: 40, fontWeight: 700, color: INK, lineHeight: 1.1 }, d.board),
            el('div', { fontSize: 28, fontWeight: 500, color: INK_MUTED, marginTop: 8 }, d.meta),
          ]),
        ]),
        el(
          'div',
          { display: 'block', marginTop: 56, fontSize: titleSize(title), fontWeight: 700, color: INK, lineHeight: 1.22, lineClamp: 3, paddingBottom: 8, overflow: 'hidden' },
          title,
        ),
      ]),
      el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 96px 28px 96px' }, [
        el('div', { fontSize: 26, fontWeight: 700, color: BRAND }, 'Publisense'),
        el('div', { fontSize: 24, fontWeight: 500, color: INK_SECONDARY }, 'publisense.app'),
      ]),
      el('div', { height: 14, background: BRAND, width: '100%' }),
    ],
  );
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  under_review: 'Under review',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  closed: 'Closed',
  merged: 'Merged',
};

/** "Planned · 12 upvotes" */
export function postMetaLine(status: string, votes: number): string {
  const label = STATUS_LABEL[status] ?? 'Open';
  return `${label} · ${votes} ${votes === 1 ? 'upvote' : 'upvotes'}`;
}
