import type { Organization, Product } from '../types';

/**
 * An admin's to-do list. Kept as a pure function so the queue's rules — what
 * counts as pending, how it is ordered, what happens when the data is thin —
 * can be tested without a browser or a database.
 */
export interface ClaimRequest {
  productId: string;
  productName: string;
  orgName: string;
  claimantEmail: string;
  requestedAt?: string;
}

/**
 * Oldest first, because a queue is worked front to back and an approval that has
 * been waiting longest is the one costing a real person the most. A request with
 * no timestamp sorts last rather than jumping the queue, and ties fall back to
 * name so the order is stable between renders.
 */
export function pendingClaimRequests(
  products: Product[],
  organizations: Organization[]
): ClaimRequest[] {
  const orgNames = new Map(organizations.map((o) => [o.id, o.name]));

  return products
    .filter((p) => p.claimStatus === 'pending')
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      orgName: orgNames.get(p.orgId) ?? 'Unknown organisation',
      claimantEmail: p.claimEmail ?? '',
      requestedAt: p.claimRequestedAt,
    }))
    .sort((a, b) => {
      if (!a.requestedAt && !b.requestedAt) return a.productName.localeCompare(b.productName);
      if (!a.requestedAt) return 1;
      if (!b.requestedAt) return -1;
      const byTime = a.requestedAt.localeCompare(b.requestedAt);
      return byTime !== 0 ? byTime : a.productName.localeCompare(b.productName);
    });
}

export interface ApprovalOutcome {
  ok: boolean;
  message: string;
}

/**
 * approve_product_claim returns jsonb and never throws on a refusal, so a naive
 * caller would treat a rejected approval as a success. Decode it explicitly.
 *
 * The success message says what the database actually did — verified the board and
 * made the claimant a maintainer — rather than a bare "Done".
 */
export function approvalOutcome(result: unknown, productName: string): ApprovalOutcome {
  const r = (result ?? {}) as { ok?: boolean; error?: string };

  if (r.ok === true) {
    return {
      ok: true,
      message: `${productName} is verified, and the claimant is now a maintainer of it.`,
    };
  }

  switch (r.error) {
    case 'not_admin':
      return { ok: false, message: 'Only an administrator can approve a claim.' };
    case 'already_verified':
      return { ok: false, message: 'That board is already verified — nothing to approve.' };
    case 'no_pending_claim':
      return {
        ok: false,
        message: 'That claim is no longer pending — it may already have been decided.',
      };
    default:
      return { ok: false, message: 'The database refused the approval.' };
  }
}

/**
 * The mirror of approvalOutcome(). A rejection is a decision, not a failure: it
 * clears the claim and leaves the board claimable again, so the message says that
 * plainly instead of apologising for it.
 */
export function rejectionOutcome(result: unknown, productName: string): ApprovalOutcome {
  const r = (result ?? {}) as { ok?: boolean; error?: string };

  if (r.ok === true) {
    return {
      ok: true,
      message: `${productName} was not approved. The claim is cleared and the board is open again.`,
    };
  }

  switch (r.error) {
    case 'not_admin':
      return { ok: false, message: 'Only an administrator can reject a claim.' };
    case 'no_pending_claim':
      return {
        ok: false,
        message: 'That claim is no longer pending — it may already have been decided.',
      };
    case 'product_not_found':
      return { ok: false, message: 'That product board no longer exists.' };
    default:
      return { ok: false, message: 'The database refused the rejection.' };
  }
}
