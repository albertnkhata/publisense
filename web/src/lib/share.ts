import { recordEvent } from '../api/analytics';

/** Absolute link to a post page. */
export function postUrl(id: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/post/${id}`;
}

/** Copy text to the clipboard; resolves false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share a post the way the mockup does: the system share sheet where there is one,
 * otherwise copy the link. Resolves to what to tell the user, or null when the share
 * sheet handled it (or was dismissed).
 */
export async function sharePost(id: string, title: string): Promise<string | null> {
  recordEvent('share_click', { path: `/post/${id}` });
  const url = postUrl(id);
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
    } catch {
      /* dismissed */
    }
    return null;
  }
  return (await copyText(url)) ? 'Link copied' : 'Copy failed';
}
