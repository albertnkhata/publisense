import type { Platform, PostType } from '../api';

/**
 * The composer's crash copy: one per signed-in person, on this device
 * (localStorage). Saved as they type, cleared when they post, save to Drafts
 * (0061) or delete; so if it is still here when the composer opens, the last one
 * closed without either (a reload, a crash) and it comes back. Images are paths already uploaded to the
 * post-images bucket (0060), so a draft keeps its screenshots.
 */
export interface PostDraft {
  /** The saved draft (0061) this copy belongs to, if it was opened from Drafts or saved before. */
  draftId?: string | null;
  board: string | null;
  type: PostType | null;
  platform: Platform | null;
  title: string;
  body: string;
  images: string[];
}

const PREFIX = 'publisense:post-draft:';

const keyFor = (viewerId: string) => `${PREFIX}${viewerId}`;

export function isEmptyDraft(d: Pick<PostDraft, 'title' | 'body' | 'images'>): boolean {
  return !d.title.trim() && !d.body.trim() && d.images.length === 0;
}

export function loadPostDraft(viewerId: string | null): PostDraft | null {
  if (!viewerId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(viewerId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PostDraft>;
    const draft: PostDraft = {
      draftId: typeof d.draftId === 'string' ? d.draftId : null,
      board: typeof d.board === 'string' ? d.board : null,
      type: d.type === 'bug' || d.type === 'feature' || d.type === 'friction' ? d.type : null,
      platform: typeof d.platform === 'string' ? (d.platform as Platform) : null,
      title: typeof d.title === 'string' ? d.title : '',
      body: typeof d.body === 'string' ? d.body : '',
      images: Array.isArray(d.images) ? d.images.filter((p): p is string => typeof p === 'string') : [],
    };
    return isEmptyDraft(draft) ? null : draft;
  } catch {
    return null;
  }
}

export function savePostDraft(viewerId: string | null, draft: PostDraft): void {
  if (!viewerId) return;
  try {
    if (isEmptyDraft(draft)) window.localStorage.removeItem(keyFor(viewerId));
    else window.localStorage.setItem(keyFor(viewerId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the draft just isn't kept.
  }
}

export function clearPostDraft(viewerId: string | null): void {
  if (!viewerId) return;
  try {
    window.localStorage.removeItem(keyFor(viewerId));
  } catch {
    // ignore
  }
}

export interface PendingComposerOpts {
  board?: string;
  hub?: string;
  title?: string;
}

const PENDING_INTENT_KEY = 'publisense:pending-composer';
const PENDING_INTENT_TTL_MS = 30 * 60_000;

export function savePendingComposerIntent(opts: PendingComposerOpts): void {
  try {
    const clean: PendingComposerOpts & { ts: number } = { ts: Date.now() };
    if (opts.board) clean.board = opts.board;
    if (opts.hub) clean.hub = opts.hub;
    if (opts.title) clean.title = opts.title;
    window.localStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(clean));
  } catch {
    // Storage blocked: skip handoff persistence.
  }
}

export function consumePendingComposerIntent(): PendingComposerOpts | null {
  try {
    const raw = window.localStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(PENDING_INTENT_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingComposerOpts & { ts: number }>;
    if (typeof parsed.ts !== 'number' || Date.now() - parsed.ts > PENDING_INTENT_TTL_MS) return null;
    const out: PendingComposerOpts = {};
    if (typeof parsed.board === 'string') out.board = parsed.board;
    if (typeof parsed.hub === 'string') out.hub = parsed.hub;
    if (typeof parsed.title === 'string') out.title = parsed.title;
    return out;
  } catch {
    return null;
  }
}

export function hasPendingComposerIntent(): boolean {
  try {
    const raw = window.localStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PendingComposerOpts & { ts: number }>;
    return typeof parsed.ts === 'number' && Date.now() - parsed.ts <= PENDING_INTENT_TTL_MS;
  } catch {
    return false;
  }
}

export function clearPendingComposerIntent(): void {
  try {
    window.localStorage.removeItem(PENDING_INTENT_KEY);
  } catch {
    // ignore
  }
}
