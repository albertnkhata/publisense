import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BYTES, avatarPath, squareCrop, validateAvatarFile } from '../api/profile';
import { soleOwnedScopes } from '../api/account';
import { createRecoverySignal, isRecoveryRedirect, shouldDetectSessionInUrl } from '../api/recovery';
import * as rules from '../../../supabase/functions/delete-account/rules';

const MB = 1024 * 1024;

describe('avatar validation', () => {
  it('accepts png, jpg and webp only', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 2000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/jpeg', size: 2000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 2000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/svg+xml', size: 2000 })).toBe('Use a PNG, JPG or WebP image.');
    expect(validateAvatarFile({ type: 'image/gif', size: 2000 })).toBe('Use a PNG, JPG or WebP image.');
  });

  it('refuses empty and oversized picks; the 1 MB limit applies to the cropped upload', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 0 })).toBe('That file is empty.');
    expect(validateAvatarFile({ type: 'image/png', size: 3 * MB })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: 11 * MB })).toBe('That image is too large. Pick one under 10 MB.');
    expect(AVATAR_MAX_BYTES).toBe(MB);
  });

  it('crops the largest centred square', () => {
    expect(squareCrop(800, 600)).toEqual({ sx: 100, sy: 0, size: 600 });
    expect(squareCrop(600, 900)).toEqual({ sx: 0, sy: 150, size: 600 });
    expect(squareCrop(512, 512)).toEqual({ sx: 0, sy: 0, size: 512 });
  });

  it('builds paths the storage policy and profile check accept', () => {
    const uid = '00000000-0000-4000-8000-00000000000a';
    const policy = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;
    for (const t of ['image/png', 'image/jpeg', 'image/webp'] as const) {
      const p = avatarPath(uid, t);
      expect(p).toMatch(policy);
      expect(p.startsWith(`${uid}/`)).toBe(true);
    }
    expect(avatarPath(uid, 'image/jpeg').endsWith('.jpg')).toBe(true);
  });
});

describe('sole-owner rule (web and Edge Function agree)', () => {
  const me = 'me';
  const cases = [
    { name: 'no memberships', rows: [], blocked: 0 },
    { name: 'admin, not owner', rows: [{ user_id: me, scope: 'board', scope_id: 'b1', role: 'admin' }], blocked: 0 },
    { name: 'sole owner', rows: [{ user_id: me, scope: 'board', scope_id: 'b1', role: 'owner' }], blocked: 1 },
    {
      name: 'co-owned',
      rows: [
        { user_id: me, scope: 'hub', scope_id: 'h1', role: 'owner' },
        { user_id: 'x', scope: 'hub', scope_id: 'h1', role: 'owner' },
      ],
      blocked: 0,
    },
    {
      name: 'another user owns a different scope with the same id space',
      rows: [
        { user_id: me, scope: 'board', scope_id: 'z', role: 'owner' },
        { user_id: 'x', scope: 'hub', scope_id: 'z', role: 'owner' },
      ],
      blocked: 1,
    },
  ] as const;
  it.each(cases)('$name', ({ rows, blocked }) => {
    const list = rows.map((r) => ({ ...r }));
    expect(soleOwnedScopes(me, list)).toHaveLength(blocked);
    expect(rules.soleOwnedScopes(me, list)).toHaveLength(blocked);
  });
});

describe('recovery signal', () => {
  it('recognises a reset redirect only with a credential', () => {
    expect(isRecoveryRedirect({ type: 'recovery', access_token: 't' })).toBe(true);
    expect(isRecoveryRedirect({ type: 'recovery' })).toBe(false);
    expect(isRecoveryRedirect({ type: 'signup', access_token: 't' })).toBe(false);
  });

  it('keeps auth-js’s own rule for which URLs it consumes', () => {
    expect(shouldDetectSessionInUrl({ access_token: 't' })).toBe(true);
    expect(shouldDetectSessionInUrl({ error_code: 'otp_expired' })).toBe(true);
    expect(shouldDetectSessionInUrl({ code: 'pkce' })).toBe(false);
  });

  it('notifies listeners and survives a broken one', () => {
    const s = createRecoverySignal();
    let heard = 0;
    s.subscribe(() => {
      throw new Error('boom');
    });
    const off = s.subscribe(() => heard++);
    s.mark();
    expect(s.peek()).toBe(true);
    expect(heard).toBe(1);
    off();
    s.clear();
    s.mark();
    expect(heard).toBe(1);
  });
});
