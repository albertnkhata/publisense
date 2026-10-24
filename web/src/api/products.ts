import { getSupabase } from './supabase';
import { ApiError, type PersonRef } from './posts';
import { BOARD_COLUMNS, type Board, type BoardCategory, type BoardWithHub } from './boards';
import { parseLink, type LinkKind } from '../lib/link';

/*
 * Add a product (0024): anyone signed in adds a board, which waits as 'pending'
 * (visible to them and to platform admins only) until an admin approves it.
 *
 *   checkProductLink   is the link valid, and is the product already here? (RPC)
 *   fetchLinkPreview   name, one-line description and logo for the form (Edge Function link-preview)
 *   createBoard        the only way to create a board (security-definer RPC, rate-limited)
 *   storeBoardLogo     asks link-preview to copy the logo into board-logos (best effort)
 *   fetchProductQueue / decideBoard   the admin "New products" queue
 */

export const PRODUCT_NAME_MAX = 60;
export const PRODUCT_TAGLINE_MAX = 120;

/** The form's category choices: the six board categories with short labels. */
export const PRODUCT_CATEGORIES: Array<{ value: BoardCategory; label: string }> = [
  { value: 'ai', label: 'AI' },
  { value: 'code', label: 'Code' },
  { value: 'dev', label: 'Dev tools' },
  { value: 'design', label: 'Design' },
  { value: 'prod', label: 'Productivity' },
  { value: 'browser', label: 'Browser' },
];

export const categoryLabel = (c: BoardCategory | null | undefined) => PRODUCT_CATEGORIES.find((x) => x.value === c)?.label ?? 'Uncategorised';

export interface LinkMatch {
  /** Absent when it is someone else's board still waiting for review. */
  slug?: string;
  name?: string;
  status: Board['status'];
  mine: boolean;
}

export interface LinkCheck {
  kind: LinkKind;
  canonical: string;
  match: LinkMatch | null;
  hub: { slug: string; name: string } | null;
}

export interface LinkPreview {
  kind: LinkKind;
  canonical: string;
  name: string;
  description: string;
  icon_url: string | null;
}

const MESSAGES: Record<string, string> = {
  sign_in: 'Sign in to add a product.',
  invalid_link: 'Paste a product website or a GitHub repo link.',
  name_length: `Give it a name of up to ${PRODUCT_NAME_MAX} characters.`,
  tagline_length: `Keep the description to one line of ${PRODUCT_TAGLINE_MAX} characters.`,
  invalid_category: 'Choose a category.',
  exists: 'It’s already here.',
  too_many_pending: 'You have 3 products waiting for review. Add more once one is approved.',
  rate_limited: 'You’ve added a lot of products today. Try again tomorrow.',
  not_allowed: 'You don’t have permission to do that.',
  not_found: 'We couldn’t find that product.',
  decided: 'Someone already reviewed this one.',
  reason_length: 'Keep the reason under 500 characters.',
};

export const productMessage = (code: string | undefined) => (code && MESSAGES[code]) || 'Something went wrong. Try again.';

export class ProductError extends ApiError {
  constructor(
    readonly code: string,
    message: string,
    readonly match: LinkMatch | null = null,
  ) {
    super(message);
  }
}

interface RpcResult {
  ok: boolean;
  error?: string;
  match?: LinkMatch | null;
  [k: string]: unknown;
}

async function rpc<T extends RpcResult>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new ProductError('network', 'Something went wrong. Try again.');
  const res = (data ?? { ok: false }) as T;
  if (!res.ok) throw new ProductError(res.error ?? 'unknown', productMessage(res.error), res.match ?? null);
  return res;
}

/** Validate locally first (no round trip for an obvious typo), then ask the database. */
export async function checkProductLink(link: string): Promise<LinkCheck> {
  if (!parseLink(link)) throw new ProductError('invalid_link', productMessage('invalid_link'));
  const res = await rpc<RpcResult & LinkCheck>('check_product_link', { p_link: link.trim() });
  return { kind: res.kind, canonical: res.canonical, match: res.match ?? null, hub: res.hub ?? null };
}

/**
 * Autofill from the Edge Function. Never throws: a site we cannot read (blocked,
 * slow, private) just gets no autofill, and the person types the name themselves.
 */
export async function fetchLinkPreview(link: string): Promise<LinkPreview | null> {
  if (!parseLink(link)) return null;
  try {
    const { data, error } = await getSupabase().functions.invoke('link-preview', { method: 'POST', body: { url: link.trim() } });
    if (error || !data || typeof data !== 'object' || 'error' in data) return null;
    return data as LinkPreview;
  } catch {
    return null;
  }
}

export interface NewProduct {
  link: string;
  name: string;
  tagline: string;
  category: BoardCategory;
}

export interface CreatedBoard {
  id: string;
  slug: string;
  name: string;
  status: Board['status'];
  hub: string | null;
  can_claim: boolean;
}

export function validateProduct(p: Partial<NewProduct>): Partial<Record<keyof NewProduct, string>> {
  const errors: Partial<Record<keyof NewProduct, string>> = {};
  if (!p.link?.trim() || !parseLink(p.link)) errors.link = productMessage('invalid_link');
  const name = (p.name ?? '').trim();
  if (!name || name.length > PRODUCT_NAME_MAX) errors.name = productMessage('name_length');
  if ((p.tagline ?? '').trim().length > PRODUCT_TAGLINE_MAX) errors.tagline = productMessage('tagline_length');
  if (!p.category) errors.category = productMessage('invalid_category');
  return errors;
}

export async function createBoard(p: NewProduct): Promise<CreatedBoard> {
  const res = await rpc<RpcResult & CreatedBoard>('create_board', {
    p_link: p.link.trim(),
    p_name: p.name.trim(),
    p_tagline: p.tagline.trim(),
    p_category: p.category,
  });
  return { id: res.id, slug: res.slug, name: res.name, status: res.status, hub: res.hub ?? null, can_claim: Boolean(res.can_claim) };
}

/** Copy the product's logo into board-logos. Best effort: the tile keeps its initial otherwise. */
export async function storeBoardLogo(boardId: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().functions.invoke('link-preview', { method: 'POST', body: { board_id: boardId } });
    if (error || !data || typeof data !== 'object') return null;
    return (data as { logo_path?: string | null }).logo_path ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ admin queue

export interface QueuedBoard extends BoardWithHub {
  review_note: string | null;
  reviewed_at: string | null;
  creator: PersonRef | null;
}

const QUEUE_SELECT =
  `${BOARD_COLUMNS}, review_note, reviewed_at, hub:hub!hub_id(id, slug, name), ` + 'creator:profile!board_created_by_fkey(id, handle, name, avatar_path)';

/** Pending boards oldest first, or the latest decisions. RLS: platform admins see every pending board. */
export async function fetchProductQueue(status: 'pending' | 'decided'): Promise<QueuedBoard[]> {
  let q = getSupabase().from('board').select(QUEUE_SELECT);
  q = status === 'pending' ? q.eq('status', 'pending').order('created_at') : q.not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(50);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as QueuedBoard[];
}

export interface BoardDecision {
  id: string;
  approve: boolean;
  name?: string;
  tagline?: string;
  category?: BoardCategory;
  reason?: string;
}

export async function decideBoard(d: BoardDecision): Promise<void> {
  await rpc('decide_board', {
    p_board: d.id,
    p_approve: d.approve,
    p_name: d.approve ? (d.name ?? null) : null,
    p_tagline: d.approve ? (d.tagline ?? null) : null,
    p_category: d.approve ? (d.category ?? null) : null,
    p_reason: d.approve ? null : d.reason?.trim() || null,
  });
}
