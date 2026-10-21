import type { UserProfile } from '../types';

/**
 * The only fields the browser is allowed to write when it provisions a profile
 * row for a newly signed-in user.
 *
 * Deliberately absent:
 *
 * - `role` — who someone is in this system is decided by the database (claim
 *   approval promotes a claimant to maintainer; migration 0011 bootstraps the
 *   owner). A client that writes `role: 'user'` on sign-in does not "default" the
 *   value, it *overwrites* it: an admin who signs in on a cold page load gets
 *   silently demoted, because at that instant their own admin role makes the
 *   guard trigger permit the change.
 * - `managed_org_id` — same reasoning, and for a maintainer the write is not just
 *   wrong but rejected, which used to fail silently.
 * - `joined_at` — a first-seen timestamp is not the same fact as an account age.
 * - `email` — changes require the dedicated flow.
 */
export function profileProvisioningPayload(profile: UserProfile) {
  return {
    id: profile.id,
    handle: profile.handle,
    name: profile.name,
    email: profile.email,
    avatar_url: profile.avatarUrl,
    bio: profile.bio,
  };
}

/** Fields the client must never assert about an existing account. */
export const PRIVILEGED_PROFILE_FIELDS = ['role', 'managed_org_id', 'role_title', 'joined_at'] as const;
