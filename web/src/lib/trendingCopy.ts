/**
 * What to call the "boards with new posts this week" list, and when.
 *
 * The rail card and the Explore section show the same ordering, and a ranking
 * with one or two entries does not read as curation — it reads as a list that
 * failed to fill. Below three entries the card stops claiming to rank anything
 * and says what the rows are instead. One helper so the two surfaces cannot
 * drift apart on the threshold or the wording.
 */

/** Fewer entries than this and the list is a plain "new this week", not a ranking. */
export const TRENDING_MIN_CURATED = 3;

export function trendingTitle(count: number): string {
  return count >= TRENDING_MIN_CURATED ? 'Trending this week' : 'New this week';
}

export function trendingNote(count: number): string {
  return count >= TRENDING_MIN_CURATED ? 'Most new posts this week' : 'New posts this week';
}
