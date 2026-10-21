import { describe, expect, it } from 'vitest';
import { profileProvisioningPayload, PRIVILEGED_PROFILE_FIELDS } from './profileProvisioning';
import type { UserProfile } from '../types';

const profile: UserProfile = {
  id: 'u1',
  handle: 'albert',
  name: 'Albert',
  email: 'a@example.test',
  avatarUrl: 'https://example.test/a.png',
  bio: 'hi',
  role: 'admin',
  managedOrgId: 'org-1',
  roleTitle: 'Owner',
  joinedAt: '2026-01-01T00:00:00Z',
};

describe('profileProvisioningPayload', () => {
  it('carries the display fields it is responsible for', () => {
    expect(profileProvisioningPayload(profile)).toMatchObject({
      id: 'u1',
      handle: 'albert',
      name: 'Albert',
      email: 'a@example.test',
      avatar_url: 'https://example.test/a.png',
      bio: 'hi',
    });
  });

  it('never asserts a role, even when the local model says admin', () => {
    expect(profileProvisioningPayload(profile)).not.toHaveProperty('role');
  });

  it('never asserts organisation ownership or a join date', () => {
    const payload = profileProvisioningPayload(profile);
    for (const field of PRIVILEGED_PROFILE_FIELDS) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it('has no way to smuggle privileges through extra local fields', () => {
    const payload = profileProvisioningPayload({ ...profile, extra: 'x' } as UserProfile & { extra: string });
    expect(Object.keys(payload).sort()).toEqual(['avatar_url', 'bio', 'email', 'handle', 'id', 'name']);
  });
});
