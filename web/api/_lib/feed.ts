/**
 * Atom 1.0 feed builder for a board's feedback (`/b/<slug>/feed.xml`) or
 * shipped changelog (`/b/<slug>/changelog.xml`). Pure so unit tests can check
 * it without network calls.
 */
import { SITE } from './shareMeta.js';
import { isBadgeSlug } from './badge.js';

export type FeedMode = 'feedback' | 'changelog';

export interface FeedBoard {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  created_at?: string | null;
}

export interface FeedPost {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  status?: string | null;
  vote_count?: number | null;
  created_at?: string | null;
  edited_at?: string | null;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const iso = (ts: string | null | undefined, fallback = '2026-01-01T00:00:00Z'): string => {
  if (!ts) return fallback;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString().replace(/\.\d+Z$/, 'Z');
};

const TYPE_LABEL: Record<string, string> = {
  bug: 'Bug',
  friction: 'Friction',
  feature: 'Feature request',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  under_review: 'Under review',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  closed: 'Closed',
};

export { isBadgeSlug as isFeedSlug };

export function buildAtomFeed(board: FeedBoard, posts: FeedPost[], mode: FeedMode = 'feedback'): string {
  const isChangelog = mode === 'changelog';
  const boardUrl = `${SITE}/b/${board.slug}${isChangelog ? '?tab=changelog' : ''}`;
  const selfUrl = `${SITE}/b/${board.slug}/${isChangelog ? 'changelog.xml' : 'feed.xml'}`;
  const title = `${board.name} — ${isChangelog ? 'Changelog' : 'Feedback'} on Publisense`;
  const newest = posts[0]?.edited_at ?? posts[0]?.created_at ?? board.created_at;
  const updated = iso(newest);

  const entries = posts.map((p) => {
    const postUrl = `${SITE}/post/${p.id}`;
    const prefix = isChangelog ? 'Shipped' : (TYPE_LABEL[p.type ?? ''] ?? 'Feedback');
    const status = STATUS_LABEL[p.status ?? ''] ?? 'Open';
    const votes = Math.max(0, Number(p.vote_count ?? 0));
    const voteText = `${votes} ${votes === 1 ? 'vote' : 'votes'}`;
    const body = (p.body ?? '').trim();
    const summary = body ? `${voteText} · ${status} — ${body.slice(0, 500)}` : `${voteText} · ${status}`;
    return [
      '  <entry>',
      `    <id>${xmlEscape(postUrl)}</id>`,
      `    <title>${xmlEscape(`[${prefix}] ${p.title}`)}</title>`,
      `    <link href="${xmlEscape(postUrl)}"/>`,
      `    <updated>${iso(p.edited_at ?? p.created_at, updated)}</updated>`,
      `    <summary>${xmlEscape(summary)}</summary>`,
      '  </entry>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${xmlEscape(boardUrl)}</id>`,
    `  <title>${xmlEscape(title)}</title>`,
    ...(board.tagline?.trim() ? [`  <subtitle>${xmlEscape(board.tagline.trim())}</subtitle>`] : []),
    `  <link href="${xmlEscape(boardUrl)}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${xmlEscape(selfUrl)}"/>`,
    `  <updated>${updated}</updated>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}
