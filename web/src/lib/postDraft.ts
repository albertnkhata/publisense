import type { Platform, PostType } from '../api';

/**
 * The composer's saved draft: one per signed-in person, on this device
 * (localStorage). Saved as they type, restored when the composer next opens,
 * cleared when they post or discard. Images are paths already uploaded to the
 * post-images bucket (0060), so a draft keeps its screenshots.
 */
export interface PostDraft {
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
