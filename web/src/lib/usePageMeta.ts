import { useEffect } from 'react';

export const SITE_URL = 'https://publisense.app';

/**
 * Per-page description, share tags and canonical URL for the SPA (#157).
 * index.html ships the site-wide tags; this swaps them while the page is
 * mounted and puts the originals back when it unmounts. Crawlers that don't run
 * JS get the same values from api/share.ts (see claimMeta in api/_lib/shareMeta).
 */
export function usePageMeta({ title, description, path }: { title: string; description: string; path: string }) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    const full = `${title} · Publisense`;
    const targets: Array<[selector: string, attr: 'content' | 'href', value: string]> = [
      ['meta[name="description"]', 'content', description],
      ['meta[property="og:title"]', 'content', full],
      ['meta[property="og:description"]', 'content', description],
      ['meta[property="og:url"]', 'content', url],
      ['meta[name="twitter:title"]', 'content', full],
      ['meta[name="twitter:description"]', 'content', description],
      ['link[rel="canonical"]', 'href', url],
    ];
    const undo: Array<() => void> = [];
    for (const [selector, attr, value] of targets) {
      let el = document.head.querySelector(selector);
      let created = false;
      if (!el) {
        // jsdom and odd hosts: create the tag so the page still describes itself.
        const m = /^(meta|link)\[(\w+)="([^"]+)"\]$/.exec(selector);
        if (!m || !m[1] || !m[2] || !m[3]) continue;
        el = document.createElement(m[1]);
        el.setAttribute(m[2], m[3]);
        document.head.appendChild(el);
        created = true;
      }
      const before = el.getAttribute(attr);
      el.setAttribute(attr, value);
      const node = el;
      undo.push(() => {
        if (created) node.remove();
        else if (before === null) node.removeAttribute(attr);
        else node.setAttribute(attr, before);
      });
    }
    return () => {
      for (const fn of undo.reverse()) fn();
    };
  }, [title, description, path]);
}
