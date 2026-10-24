import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canUnmerge,
  decideReports,
  findUser,
  groupReports,
  mergePost,
  ModerationError,
  moderationMessage,
  releaseScope,
  reportError,
  reportText,
  revokePlatformAdmin,
  unmergePost,
  UNMERGE_WINDOW_MS,
  type ReportRow,
} from '../api/moderation';
import { notificationGroup, notificationTab } from '../api/notifications';
import { isHandle, joinedLabel } from '../api/people';

/*
 * Step 8 api layer: RPC names and arguments, how { ok: false, error } becomes a
 * ModerationError with plain wording, and the pure helpers. Supabase is a
 * stand-in that records rpc calls. No network.
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

describe('merge and unmerge', () => {
  it('merge_post gets the source and target and reports the votes moved', async () => {
    sb.answers.push(ok({ moved: 3 }));
    await expect(mergePost('src', 'dst')).resolves.toEqual({ moved: 3 });
    expect(sb.calls).toEqual([['merge_post', { p_source: 'src', p_target: 'dst' }]]);
  });

  it('a refused merge says why', async () => {
    sb.answers.push(refused('target_unavailable'));
    const e = await mergePost('src', 'dst').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ModerationError);
    expect((e as ModerationError).code).toBe('target_unavailable');
    expect((e as Error).message).toBe('That post is closed or hidden. Pick another one.');
  });

  it('unmerge_post returns the status the post went back to; too late is explained', async () => {
    sb.answers.push(ok({ status: 'planned' }), refused('too_late'));
    await expect(unmergePost('src')).resolves.toEqual({ status: 'planned' });
    await expect(unmergePost('src')).rejects.toThrow('Merges can only be undone for 10 minutes.');
  });

  it('the Undo merge window is 10 minutes from the merge', () => {
    const now = Date.now();
    expect(canUnmerge(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(canUnmerge(new Date(now - UNMERGE_WINDOW_MS - 1).toISOString(), now)).toBe(false);
    expect(canUnmerge(null, now)).toBe(false);
  });
});

describe('reports', () => {
  it('stores the reason with any details, and asks for details on “Something else”', () => {
    expect(reportText('spam', '')).toBe('Spam or advertising');
    expect(reportText('abuse', '  calls people names ')).toBe('Harassment or hate: calls people names');
    expect(reportError(null, '')).toBe('Pick a reason.');
    expect(reportError('other', ' ')).toBe('Tell us what’s wrong.');
    expect(reportError('other', 'it is a scam')).toBeNull();
  });

  it('groups reports by target, most reported first, newest report first inside', () => {
    const r = (id: string, target_id: string, created_at: string): ReportRow => ({
      id,
      target: 'post',
      target_id,
      reason: 'Spam or advertising',
      status: 'open',
      created_at,
      decided_at: null,
      reporter: null,
    });
    const groups = groupReports([r('1', 'a', '2026-10-01T00:00:00Z'), r('2', 'b', '2026-10-03T00:00:00Z'), r('3', 'b', '2026-10-02T00:00:00Z')]);
    expect(groups.map((g) => g.target_id)).toEqual(['b', 'a']);
    expect(groups[0]?.reports.map((x) => x.id)).toEqual(['2', '3']);
    expect(groups[0]?.latest).toBe('2026-10-03T00:00:00Z');
  });

  it('decide_reports takes the target and the action', async () => {
    sb.answers.push(ok({ decided: 2 }));
    await expect(decideReports('reply', 'r1', 'hide')).resolves.toBe(2);
    expect(sb.calls[0]).toEqual(['decide_reports', { p_target: 'reply', p_target_id: 'r1', p_action: 'hide' }]);
  });
});

describe('admins and release', () => {
  it('the last admin cannot be removed', async () => {
    sb.answers.push(refused('last_admin'));
    await expect(revokePlatformAdmin('u1')).rejects.toThrow('Publisense always keeps at least one admin. Appoint another admin first.');
    expect(sb.calls[0]).toEqual(['revoke_platform_admin', { p_user: 'u1' }]);
  });

  it('a lookup returns the person; not_found keeps its code for the form', async () => {
    sb.answers.push(ok({ user: { id: 'u2', handle: 'carol', name: 'Carol', avatar_path: null, is_admin: false } }), refused('not_found'));
    await expect(findUser(' carol@cursor.com ')).resolves.toMatchObject({ handle: 'carol', is_admin: false });
    expect(sb.calls[0]).toEqual(['admin_find_user', { p_who: 'carol@cursor.com' }]);
    const e = await findUser('nobody').catch((x: unknown) => x);
    expect((e as ModerationError).code).toBe('not_found');
  });

  it('release_scope is for owners only', async () => {
    sb.answers.push(refused('owners_only'));
    await expect(releaseScope('hub', 'h1')).rejects.toThrow('Only an owner can do that.');
    expect(sb.calls[0]).toEqual(['release_scope', { p_scope: 'hub', p_scope_id: 'h1' }]);
  });

  it('unknown refusals fall back to a generic message', () => {
    expect(moderationMessage('weird')).toBe('Something went wrong. Try again.');
  });
});

describe('people and notification helpers', () => {
  it('handles follow the profile rule', () => {
    expect(isHandle('alex_d')).toBe(true);
    expect(isHandle('Al')).toBe(false);
    expect(isHandle('has space')).toBe(false);
  });

  it('joined label and notification grouping', () => {
    expect(joinedLabel('2026-03-04T10:00:00Z')).toBe('Joined Mar 2026');
    const now = new Date(2026, 9, 24, 15, 0);
    expect(notificationGroup(new Date(2026, 9, 24, 1, 0).toISOString(), now)).toBe('Today');
    expect(notificationGroup(new Date(2026, 9, 20, 12, 0).toISOString(), now)).toBe('This week');
    expect(notificationGroup(new Date(2026, 9, 1, 12, 0).toISOString(), now)).toBe('Earlier');
    expect(notificationTab('mention')).toBe('replies');
    expect(notificationTab('status_change')).toBe('activity');
  });
});
