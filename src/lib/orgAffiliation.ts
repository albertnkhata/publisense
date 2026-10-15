import { Company, UserProfile } from '../types';

export interface UserOrgAffiliation {
  company: Company | null;
  companyName: string | null;
  isAffiliated: boolean;
  isClaimed: boolean;
  isVerifiedMember: boolean;
  isOrgAdmin: boolean;
  effectiveRoleTitle: string | undefined;
  statusLabel: 'verified_admin' | 'verified_member' | 'none';
}

/**
 * Resolves the true, canonical affiliation between a user profile and an organization
 * based strictly on the live Company record (the single source of truth).
 *
 * Fundamental Invariant:
 * The association ONLY exists when the organization is actively claimed AND the user
 * is verified as an official claimant or team member on its roster.
 * If an organization is not claimed, or if the user is not a verified member of it,
 * the association is NON-EXISTENT (isAffiliated: false, company: null, companyName: null).
 */
export function resolveUserOrgAffiliation(
  user: UserProfile | null | undefined,
  companies: Company[] = []
): UserOrgAffiliation {
  if (!user) {
    return {
      company: null,
      companyName: null,
      isAffiliated: false,
      isClaimed: false,
      isVerifiedMember: false,
      isOrgAdmin: false,
      effectiveRoleTitle: undefined,
      statusLabel: 'none',
    };
  }

  const isPlatformAdmin = user.role === 'admin';
  const cleanHandle = user.handle ? user.handle.toLowerCase().replace(/^@/, '') : '';
  const cleanEmail = user.email ? user.email.toLowerCase().trim() : '';
  const cleanWorkEmail = user.workEmail ? user.workEmail.toLowerCase().trim() : '';

  // 1. Find matching company from live list
  let matchedCompany: Company | null = null;

  if (user.companyId) {
    matchedCompany =
      companies.find((c) => c.id === user.companyId || c.slug === user.companyId) || null;
  }

  if (!matchedCompany && user.companyOrOrg && user.companyOrOrg.trim() !== '') {
    const q = user.companyOrOrg.toLowerCase().trim();
    matchedCompany =
      companies.find(
        (c) =>
          c.name.toLowerCase() === q ||
          c.slug.toLowerCase() === q ||
          (c.id && c.id.toLowerCase() === q)
      ) || null;
  }

  // Also check if user is recorded as claimant or verified member on any company
  if (!matchedCompany) {
    matchedCompany =
      companies.find(
        (c) =>
          c.claimedById === user.id ||
          c.verifiedMembers?.some(
            (m) =>
              (user.id && m.id === user.id) ||
              (cleanHandle && m.handle.toLowerCase().replace(/^@/, '') === cleanHandle) ||
              (cleanEmail && m.email && m.email.toLowerCase() === cleanEmail) ||
              (cleanWorkEmail && m.email && m.email.toLowerCase() === cleanWorkEmail)
          )
      ) || null;
  }

  // If no company matched OR the matched company is NOT claimed, association is NON-EXISTENT
  if (!matchedCompany || !matchedCompany.isClaimed) {
    return {
      company: null,
      companyName: null,
      isAffiliated: false,
      isClaimed: false,
      isVerifiedMember: false,
      isOrgAdmin: false,
      effectiveRoleTitle: isPlatformAdmin ? 'Platform Administrator' : undefined,
      statusLabel: 'none',
    };
  }

  // Company is claimed: check whether this user is an authorized claimant or verified member
  const isClaimant = matchedCompany.claimedById === user.id;
  const verifiedMember = matchedCompany.verifiedMembers?.find(
    (m) =>
      (user.id && m.id === user.id) ||
      (cleanHandle && m.handle.toLowerCase().replace(/^@/, '') === cleanHandle) ||
      (cleanEmail && m.email && m.email.toLowerCase() === cleanEmail) ||
      (cleanWorkEmail && m.email && m.email.toLowerCase() === cleanWorkEmail)
  );

  const isVerifiedMember = Boolean(isClaimant || verifiedMember);

  // If the company is claimed by someone else and this user is not on the verified roster, NO affiliation exists
  if (!isVerifiedMember) {
    return {
      company: null,
      companyName: null,
      isAffiliated: false,
      isClaimed: false,
      isVerifiedMember: false,
      isOrgAdmin: false,
      effectiveRoleTitle: isPlatformAdmin ? 'Platform Administrator' : undefined,
      statusLabel: 'none',
    };
  }

  const isOrgAdmin = Boolean(
    isClaimant ||
    verifiedMember?.role === 'org_admin' ||
    isPlatformAdmin
  );

  const effectiveRoleTitle =
    verifiedMember?.roleTitle ||
    user.roleTitle ||
    (isOrgAdmin ? 'Organization Admin' : 'Verified Team Member');

  return {
    company: matchedCompany,
    companyName: matchedCompany.name,
    isAffiliated: true,
    isClaimed: true,
    isVerifiedMember: true,
    isOrgAdmin,
    effectiveRoleTitle,
    statusLabel: isOrgAdmin ? 'verified_admin' : 'verified_member',
  };
}
