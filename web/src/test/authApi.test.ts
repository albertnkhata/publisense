import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real api functions against a stub client: what they send, and
// that what they return never tells a visitor whether an account exists.
const profileQuery = vi.hoisted(() => {
  const q = { result: { data: [] as unknown[], error: null as unknown }, eq: vi.fn(), select: vi.fn(), limit: vi.fn(), from: vi.fn() };
  q.from.mockImplementation(() => q);
  q.select.mockImplementation(() => q);
  q.eq.mockImplementation(() => q);
  q.limit.mockImplementation(async () => q.result);
  return q;
});

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../api/supabase', () => ({
  hasSupabaseConfig: true,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  getSupabase: () => ({ auth, from: profileQuery.from }),
  publicStorageUrl: () => null,
}));

const { AUTH_COPY, changePassword, completePasswordReset, isHandleTaken, explainAuthError, requestPasswordReset, signInWithPassword, signUp } = await import('../api/auth');

const authError = (code: string, message = code) => Object.assign(new Error(message), { code });

beforeEach(() => Object.values(auth).forEach((f) => f.mockReset()));

describe('explainAuthError', () => {
  it('gives one answer for a wrong password and an unknown email', () => {
    expect(explainAuthError(authError('invalid_credentials', 'Invalid login credentials'), 'signin')).toBe(AUTH_COPY.badCredentials);
    expect(explainAuthError(authError('user_not_found'), 'signin')).toBe(AUTH_COPY.badCredentials);
  });

  it('words throttling as a wait', () => {
    expect(explainAuthError(authError('over_request_rate_limit'), 'signin')).toBe(AUTH_COPY.rateLimited);
    expect(explainAuthError(new Error('For security purposes, you can only request this after 42 seconds.'))).toBe(AUTH_COPY.rateLimited);
  });

  it('never echoes "already registered" on sign-up', () => {
    expect(explainAuthError(authError('user_already_exists', 'User already registered'), 'signup')).toBe(AUTH_COPY.signupFailed);
  });
});

describe('auth api', () => {
  it('signs up with the name in metadata and reports when confirmation is needed', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    const r = await signUp(' Nia ', ' nia@b.co ', 'Long-enough-1', 'nia_builds');
    expect(r).toEqual({ error: null, needsConfirmation: true });
    expect(auth.signUp.mock.calls[0]?.[0]).toMatchObject({
      email: 'nia@b.co',
      options: { data: { full_name: 'Nia', user_name: 'nia_builds', requested_handle: 'nia_builds' } },
    });
  });

  it('does not record a requested handle when the handle was derived, not chosen', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    await signUp('Nia', 'nia@b.co', 'Long-enough-1', 'nia', { chosen: false });
    const data = auth.signUp.mock.calls[0]?.[0]?.options?.data;
    expect(data).toEqual({ full_name: 'Nia', user_name: 'nia' });
  });

  it('asks for the reset link to land on /auth/reset and hides provider errors', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: authError('unexpected_failure', 'User not found') });
    expect(await requestPasswordReset('who@b.co')).toEqual({ error: null });
    expect(auth.resetPasswordForEmail.mock.calls[0]?.[1]).toEqual({ redirectTo: `${window.location.origin}/auth/reset` });
  });

  it('maps sign-in failures to the mockup copy', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: authError('invalid_credentials') });
    expect(await signInWithPassword('a@b.co', 'x')).toEqual({ error: AUTH_COPY.badCredentials });
  });

  it('changes a password only after proving the current one, then signs out other sessions', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: authError('invalid_credentials') });
    expect(await changePassword('a@b.co', 'wrong', 'Newer-pass-1')).toEqual({ error: 'That isn’t your current password.' });
    expect(auth.updateUser).not.toHaveBeenCalled();

    auth.signInWithPassword.mockResolvedValueOnce({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    expect(await changePassword('a@b.co', 'right', 'Newer-pass-1')).toEqual({ error: null });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Newer-pass-1' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('finishes a reset by setting the password and signing out other sessions', async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    expect(await completePasswordReset('Newer-pass-1')).toEqual({ error: null });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Newer-pass-1' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('keeps other sessions when the reset itself fails', async () => {
    auth.updateUser.mockResolvedValue({ error: authError('same_password') });
    expect((await completePasswordReset('Same-pass-1')).error).toBeTruthy();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('checks a handle against public profiles, and answers null when the lookup fails', async () => {
    profileQuery.result = { data: [{ id: 'u1' }], error: null };
    expect(await isHandleTaken('nia')).toBe(true);
    expect(profileQuery.from).toHaveBeenCalledWith('profile');
    expect(profileQuery.eq).toHaveBeenCalledWith('handle', 'nia');
    profileQuery.result = { data: [], error: null };
    expect(await isHandleTaken('nia_b')).toBe(false);
    profileQuery.result = { data: null as unknown as unknown[], error: new Error('offline') };
    expect(await isHandleTaken('nia')).toBeNull();
  });
});
