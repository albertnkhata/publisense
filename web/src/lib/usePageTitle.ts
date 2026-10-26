import { useEffect } from 'react';

export const SITE_TITLE = 'Publisense';

/** "Title · Publisense", or the site name alone for a null title. */
export function pageTitle(title: string | null | undefined): string {
  return title ? `${title} · ${SITE_TITLE}` : SITE_TITLE;
}

/**
 * Sets the tab title (document.title) for the page. Board, hub and post pages
 * pass the board or hub name or the post title once it loads (null while it
 * loads keeps the site name). The title goes back to the site name when the
 * page unmounts, so a page that sets none never keeps the last one's.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = pageTitle(title);
  }, [title]);
  useEffect(
    () => () => {
      document.title = SITE_TITLE;
    },
    [],
  );
}
