import { describe, expect, it } from 'vitest';
import { approvalOutcome, pendingClaimRequests, rejectionOutcome } from './claimRequests';
import type { Organization, Product } from '../types';

function product(over: Partial<Product>): Product {
  return {
    id: 'p1',
    slug: 'p1',
    orgId: 'o1',
    name: 'Product One',
    tagline: '',
    description: '',
    category: 'dev_tools',
    logoUrl: '',
    websiteUrl: '',
    isVerified: false,
    responsivenessRate: 80,
    avgResponseTime: '< 24h',
    followersCount: 0,
    claimStatus: 'unclaimed',
    ...over,
  } as Product;
}

const orgs: Organization[] = [
  { id: 'o1', slug: 'o1', name: 'Acme', tagline: '', logoUrl: '', websiteUrl: '', isVerified: false },
];

describe('pendingClaimRequests', () => {
  it('returns only claims awaiting a decision', () => {
    const queue = pendingClaimRequests(
      [
        product({ id: 'a', name: 'A', claimStatus: 'pending', claimEmail: 'a@acme.test' }),
        product({ id: 'b', name: 'B', claimStatus: 'verified' }),
        product({ id: 'c', name: 'C', claimStatus: 'unclaimed' }),
        product({ id: 'd', name: 'D', claimStatus: undefined }),
      ],
      orgs
    );

    expect(queue.map((q) => q.productId)).toEqual(['a']);
  });

  it('carries the product name, organisation and claimant email', () => {
    const [req] = pendingClaimRequests(
      [product({ claimStatus: 'pending', claimEmail: 'founder@acme.test' })],
      orgs
    );

    expect(req).toMatchObject({
      productId: 'p1',
      productName: 'Product One',
      orgName: 'Acme',
      claimantEmail: 'founder@acme.test',
    });
  });

  it('orders oldest request first', () => {
    const queue = pendingClaimRequests(
      [
        product({ id: 'new', name: 'Newer', claimStatus: 'pending', claimRequestedAt: '2026-10-20T10:00:00Z' }),
        product({ id: 'old', name: 'Older', claimStatus: 'pending', claimRequestedAt: '2026-10-01T10:00:00Z' }),
      ],
      orgs
    );

    expect(queue.map((q) => q.productId)).toEqual(['old', 'new']);
  });

  it('pushes requests with no timestamp to the back, not the front', () => {
    const queue = pendingClaimRequests(
      [
        product({ id: 'undated', name: 'Undated', claimStatus: 'pending' }),
        product({ id: 'dated', name: 'Dated', claimStatus: 'pending', claimRequestedAt: '2026-10-20T10:00:00Z' }),
      ],
      orgs
    );

    expect(queue.map((q) => q.productId)).toEqual(['dated', 'undated']);
  });

  it('is stable when timestamps tie', () => {
    const queue = pendingClaimRequests(
      [
        product({ id: 'z', name: 'Zeta', claimStatus: 'pending', claimRequestedAt: '2026-10-20T10:00:00Z' }),
        product({ id: 'a', name: 'Alpha', claimStatus: 'pending', claimRequestedAt: '2026-10-20T10:00:00Z' }),
      ],
      orgs
    );

    expect(queue.map((q) => q.productId)).toEqual(['a', 'z']);
  });

  it('does not invent an organisation or an email when the row lacks them', () => {
    const [req] = pendingClaimRequests([product({ orgId: 'missing', claimStatus: 'pending' })], orgs);

    expect(req.orgName).toBe('Unknown organisation');
    expect(req.claimantEmail).toBe('');
  });

  it('returns an empty queue rather than throwing when nothing is pending', () => {
    expect(pendingClaimRequests([product({ claimStatus: 'unclaimed' })], orgs)).toEqual([]);
    expect(pendingClaimRequests([], [])).toEqual([]);
  });
});

describe('approvalOutcome', () => {
  it('does not read a refusal as success', () => {
    const outcome = approvalOutcome({ ok: false, error: 'not_admin' }, 'Product One');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/administrator/i);
  });

  it('explains that a claim is already settled', () => {
    const outcome = approvalOutcome({ ok: false, error: 'no_pending_claim' }, 'Product One');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/no longer pending/i);
  });

  it('states what a successful approval actually granted', () => {
    const outcome = approvalOutcome({ ok: true, status: 'verified' }, 'Product One');
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain('Product One');
    expect(outcome.message).toMatch(/maintainer/i);
  });

  it('explains that a board is already verified instead of implying a failure', () => {
    const outcome = approvalOutcome({ ok: false, error: 'already_verified' }, 'Product One');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/already verified/i);
  });

  it('treats an unrecognised payload as a failure, not a success', () => {
    expect(approvalOutcome(null, 'X').ok).toBe(false);
    expect(approvalOutcome({}, 'X').ok).toBe(false);
    expect(approvalOutcome({ ok: 'yes' }, 'X').ok).toBe(false);
    expect(approvalOutcome(undefined, 'X').ok).toBe(false);
  });
});

describe('rejectionOutcome', () => {
  it('reads a rejection as the decision it is, not an error', () => {
    const outcome = rejectionOutcome({ ok: true, status: 'unclaimed' }, 'Product One');
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain('Product One');
    expect(outcome.message).toMatch(/open again/i);
  });

  it('distinguishes a database refusal from the decision itself', () => {
    expect(rejectionOutcome({ ok: false, error: 'not_admin' }, 'X').message).toMatch(/administrator/i);
    expect(rejectionOutcome({ ok: false, error: 'no_pending_claim' }, 'X').message).toMatch(/no longer pending/i);
    expect(rejectionOutcome({ ok: false, error: 'product_not_found' }, 'X').message).toMatch(/no longer exists/i);
  });

  it('never reads an unknown payload as a completed rejection', () => {
    expect(rejectionOutcome(null, 'X').ok).toBe(false);
    expect(rejectionOutcome({}, 'X').ok).toBe(false);
    expect(rejectionOutcome({ ok: 'yes' }, 'X').ok).toBe(false);
  });
});
