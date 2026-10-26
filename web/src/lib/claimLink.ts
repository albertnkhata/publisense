/** The public "How claiming works" page (#157), for one board or hub or on its own. */
export const CLAIM_PATH = '/claim';

export function claimHref(target?: { board?: string; hub?: string }): string {
  if (target?.board) return `${CLAIM_PATH}?board=${encodeURIComponent(target.board)}`;
  if (target?.hub) return `${CLAIM_PATH}?hub=${encodeURIComponent(target.hub)}`;
  return CLAIM_PATH;
}
