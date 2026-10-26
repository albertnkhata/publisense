import { isSlug, siteDomain, useBoards, useHubs } from '../api';

/**
 * The board or hub a claim explainer is about (#157): the /claim page reads it
 * from ?board= / ?hub=, the claim intro modal from the entry point that opened it.
 */
export interface ClaimTargetRef {
  board?: string | null;
  hub?: string | null;
}

export interface ClaimTarget {
  kind: 'board' | 'hub';
  slug: string;
  name: string;
  domain: string | null;
  claimed: boolean;
}

/** The named board or hub once boards and hubs load, else null. */
export function useClaimTarget(ref: ClaimTargetRef | undefined): ClaimTarget | null {
  const boards = useBoards();
  const hubs = useHubs();
  const board = ref?.board;
  const hub = ref?.hub;
  if (isSlug(board)) {
    const b = boards.data?.find((x) => x.slug === board);
    if (!b) return null;
    const h = b.hub_id ? hubs.data?.find((x) => x.id === b.hub_id) : undefined;
    return { kind: 'board', slug: b.slug, name: b.name, domain: siteDomain(b.site), claimed: Boolean(b.claimed_at || h?.claimed_at) };
  }
  if (isSlug(hub)) {
    const h = hubs.data?.find((x) => x.slug === hub);
    if (!h) return null;
    return { kind: 'hub', slug: h.slug, name: h.name, domain: h.primary_domain, claimed: Boolean(h.claimed_at) };
  }
  return null;
}

/** Shared by the /claim page and the claim intro modal so the two never disagree. */
export const CLAIM_ACTIONS = {
  signupReason: 'claim your product’s board',
  signUp: 'Create an account to claim',
  signIn: 'I have an account',
};
