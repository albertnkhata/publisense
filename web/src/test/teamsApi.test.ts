import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkDns,
  claimBoard,
  countStats,
  covered,
  domainCovers,
  requestJoin,
  setMemberRole,
  siteDomain,
  sortMembers,
  startEmailCode,
  TeamError,
  teamErrorMessage,
  verifyEmailCode,
  workEmailError,
  type Member,
} from '../api/teams';

/*
 * Step 7 api layer: the RPC arguments, how { ok: false, error } becomes a
 * TeamError with the mockup's wording, DNS polling, and the pure helpers.
 * Supabase is a stand-in that records rpc calls. No network.
 */
const sb = vi.hoisted(() => ({ calls: [] as Array<[string, Record<string, unknown>]>, answers: [] as Array<{ data: unknown; error: unknown }> }));
vi.mock('../api/supabase', () => ({
  getSupabase: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      sb.calls.push([fn, args]);
      return sb.answers.shift() ?? { data: { ok: true }, error: null };
    },
  }),
  publicStorageUrl: () => null,
  hasSupabaseConfig: false,
}));

const ok = (extra: Record<string, unknown> = {}) => ({ data: { ok: true, ...extra }, error: null });
const refused = (error: string) => ({ data: { ok: false, error }, error: null });

beforeEach(() => {
  sb.calls = [];
  sb.answers = [];
});

describe('domains', () => {
  it('reads a board’s domain from its site, like v2_site_domain()', () => {
    expect(siteDomain('figma.com/figjam')).toBe('figma.com');
    expect(siteDomain('www.Arc.net')).toBe('arc.net');
    expect(siteDomain('github.com/features/copilot')).toBe('github.com');
    expect(siteDomain(null)).toBeNull();
    expect(siteDomain('localhost')).toBeNull();
  });

  it('a verified domain covers itself and its subdomains only', () => {
    expect(domainCovers('figma.com', 'figma.com')).toBe(true);
    expect(domainCovers('figma.com', 'eu.figma.com')).toBe(true);
    expect(domainCovers('figma.com', 'notfigma.com')).toBe(false);
    expect(domainCovers('eu.figma.com', 'figma.com')).toBe(false);
    expect(covered(['cursor.com'], 'cursor.com')).toBe(true);
    expect(covered(undefined, 'cursor.com')).toBe(false);
  });

  it('checks a work email before sending a code (mockup wording)', () => {
    expect(workEmailError('nope', 'cursor.com')).toBe('Enter a valid email address.');
    expect(workEmailError('me@gmail.com', 'cursor.com')).toBe('That isn’t an @cursor.com address. Use your work email, or verify with DNS.');
    expect(workEmailError('Me@Cursor.com', 'cursor.com')).toBeNull();
    expect(workEmailError('me@eu.cursor.com', 'cursor.com')).toBeNull();
  });
});

describe('RPCs', () => {
  it('sends the code request with a lower-cased email', async () => {
    await startEmailCode(' Carol@Cursor.com ', 'cursor.com');
    expect(sb.calls).toEqual([['start_domain_email', { p_email: 'carol@cursor.com', p_domain: 'cursor.com' }]]);
  });

  it('turns a refusal into a TeamError with words a person can act on', async () => {
    sb.answers.push(refused('wrong_code'));
    await expect(verifyEmailCode('carol@cursor.com', '000000')).rejects.toMatchObject({ code: 'wrong_code', message: 'That code isn’t right. Check the email and try again.' });
    sb.answers.push(refused('claimed'));
    const err = await claimBoard('b1', { name: 'Cursor', domain: 'cursor.com' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeamError);
    expect((err as TeamError).message).toBe('Cursor is already claimed.');
    sb.answers.push(refused('wrong_domain'));
    await expect(requestJoin('board', 'b1', 'x@other.org', 'cursor.com')).rejects.toThrow('Use an @cursor.com address.');
  });

  it('a network error never leaks details', async () => {
    sb.answers.push({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } });
    await expect(startEmailCode('a@cursor.com', 'cursor.com')).rejects.toThrow('Something went wrong. Try again.');
  });

  it('claim returns the hub to offer', async () => {
    sb.answers.push(ok({ hub: 'figma' }));
    await expect(claimBoard('b1', { name: 'Figma', domain: 'figma.com' })).resolves.toEqual({ hub: 'figma' });
    expect(sb.calls[0]).toEqual(['claim_board', { p_board: 'b1' }]);
  });

  it('maps the last-owner refusal', async () => {
    sb.answers.push(refused('last_owner'));
    await expect(setMemberRole('board', 'b1', 'u1', 'member')).rejects.toThrow('Add another owner first. A claimed board always keeps an owner.');
    expect(sb.calls[0]).toEqual(['set_member_role', { p_scope: 'board', p_scope_id: 'b1', p_user: 'u1', p_role: 'member' }]);
  });

  it('polls DNS until pg_net answers', async () => {
    sb.answers.push(ok({ pending: true }), ok({ pending: true }), ok({ verified: true, domain: 'arc.net' }));
    const sleep = vi.fn(async () => {});
    await checkDns('arc.net', { sleep });
    expect(sb.calls.map((c) => c[0])).toEqual(['check_domain_dns', 'check_domain_dns', 'check_domain_dns']);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the record is missing, and gives up politely when DNS is slow', async () => {
    sb.answers.push(ok({ pending: true }), refused('not_found'));
    await expect(checkDns('arc.net', { sleep: async () => {} })).rejects.toMatchObject({ code: 'not_found' });
    sb.answers = [];
    for (let i = 0; i < 3; i += 1) sb.answers.push(ok({ pending: true }));
    await expect(checkDns('arc.net', { tries: 3, sleep: async () => {} })).rejects.toMatchObject({ code: 'dns_slow' });
  });
});

describe('helpers', () => {
  it('counts the Manage tiles', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    const rows = [
      { status: 'open' as const, vote_count: 5, created_at: '2026-10-23T12:00:00Z' },
      { status: 'open' as const, vote_count: 3, created_at: '2026-09-01T12:00:00Z' },
      { status: 'shipped' as const, vote_count: 10, created_at: '2026-10-20T12:00:00Z' },
    ];
    expect(countStats(rows, now)).toEqual({ waiting: 2, newThisWeek: 2, upvotes: 18, shipped: 1 });
  });

  it('lists you first, then owners, admins and members', () => {
    const m = (user_id: string, role: Member['role'], handle: string): Member => ({
      user_id, role, scope: 'board', scope_id: 'b1', created_at: '', profile: { id: user_id, handle, name: handle, avatar_path: null },
    });
    const sorted = sortMembers([m('a', 'member', 'zed'), m('b', 'owner', 'yan'), m('me', 'member', 'me'), m('c', 'admin', 'amy')], 'me');
    expect(sorted.map((x) => x.user_id)).toEqual(['me', 'b', 'c', 'a']);
  });

  it('has a message for every refusal the RPCs return', () => {
    for (const code of ['sign_in', 'shared_domain', 'rate_limited', 'email_unavailable', 'expired', 'too_many_attempts', 'hub_claimed', 'not_verified', 'not_claimed', 'already_member', 'not_allowed', 'owners_only', 'decided', 'reason_length']) {
      expect(teamErrorMessage(code)).not.toBe('Something went wrong. Try again.');
    }
  });
});
