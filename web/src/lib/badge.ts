/** The feedback badge snippets Manage hands a team (served by api/badge.ts). */
export const BADGE_ORIGIN = 'https://publisense.app';

export function badgeSnippets(slug: string, origin = BADGE_ORIGIN): { image: string; board: string; markdown: string; html: string } {
  const image = `${origin}/badge/${slug}.svg`;
  const board = `${origin}/b/${slug}`;
  return {
    image,
    board,
    markdown: `[![Feedback on Publisense](${image})](${board})`,
    html: `<a href="${board}"><img src="${image}" alt="Feedback on Publisense" height="20"></a>`,
  };
}
