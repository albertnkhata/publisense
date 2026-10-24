import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePost, fetchFeed, fetchPost, setVote, FEED_PAGE_SIZE } from '../api/posts';

/*
 * The api layer against a recording stand-in for the Supabase query builder:
 * checks the filters each read sends (live posts only, the Following filter,
 * paging) and how writes report refusals. No network.
 */
type Call = [string, ...unknown[]];
const db = vi.hoisted(() => ({
  calls: {} as Record<string, Call[][]>,
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, { code?: string; message: string } | null>,
}));

vi.mock('../api/supabase', () => {
  function builder(table: string) {
    const calls: Call[] = [];
    (db.calls[table] ??= []).push(calls);
    const result = () => ({ data: db.errors[table] ? null : (db.rows[table] ?? []), error: db.errors[table] ?? null });
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'or', 'order', 'range', 'limit', 'insert', 'update', 'delete']) {
      b[m] = (...args: unknown[]) => (calls.push([m, ...args]), b);
    }
    b.maybeSingle = () => Promise.resolve({ ...result(), data: (db.rows[table] ?? [])[0] ?? null });
    b.single = b.maybeSingle;
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return b;
  }
  return {
    hasSupabaseConfig: true,
    getSupabase: () => ({ from: builder }),
    publicStorageUrl: () => null,
  };
});

const row = (id: string) => ({ id, title: 't', author: null, board: null, vote_count: 0, reply_count: 0 });
const only = (table: string, i = 0) => db.calls[table]?.[i] ?? [];
const has = (calls: Call[], ...want: unknown[]) => calls.some((c) => JSON.stringify(c) === JSON.stringify(want));

beforeEach(() => {
  db.calls = {};
  db.rows = {};
  db.errors = {};
});

describe('fetchFeed', () => {
  it('reads live posts only, Top order, one page', async () => {
    db.rows.post = [row('p1'), row('p2')];
    const page = await fetchFeed({ scope: 'all', sort: 'top', offset: 0, viewerId: null });
    const q = only('post');
    expect(has(q, 'is', 'hidden_at', null)).toBe(true);
    expect(has(q, 'neq', 'status', 'merged')).toBe(true);
    expect(has(q, 'order', 'vote_count', { ascending: false })).toBe(true);
    expect(has(q, 'range', 0, FEED_PAGE_SIZE - 1)).toBe(true);
    expect(page.items.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(page.next).toBeNull();
    // Signed out: no vote or follow lookups.
    expect(db.calls.vote).toBeUndefined();
    expect(page.items[0]?.voted).toBe(false);
  });

  it('pages by offset and orders New by time', async () => {
    db.rows.post = Array.from({ length: FEED_PAGE_SIZE }, (_, i) => row(`p${i}`));
    const page = await fetchFeed({ scope: 'all', sort: 'new', offset: 40, viewerId: 'me' });
    expect(has(only('post'), 'order', 'created_at', { ascending: false })).toBe(true);
    expect(has(only('post'), 'range', 40, 40 + FEED_PAGE_SIZE - 1)).toBe(true);
    expect(page.next).toBe(40 + FEED_PAGE_SIZE);
    expect(has(only('vote'), 'eq', 'user_id', 'me')).toBe(true);
  });

  it('builds the Following filter from boards, hub boards, people and posts', async () => {
    db.rows.follow = [
      { target: 'board', target_id: 'b1' },
      { target: 'hub', target_id: 'h1' },
      { target: 'user', target_id: 'u1' },
      { target: 'post', target_id: 'p9' },
    ];
    db.rows.board = [{ id: 'b2' }];
    await fetchFeed({ scope: 'following', sort: 'top', offset: 0, viewerId: 'me' });
    expect(has(only('board'), 'in', 'hub_id', ['h1'])).toBe(true);
    expect(has(only('post'), 'or', 'board_id.in.(b1,b2),author_id.in.(u1),id.in.(p9)')).toBe(true);
  });

  it('returns an empty Following without reading posts when you follow nothing', async () => {
    db.rows.follow = [];
    const page = await fetchFeed({ scope: 'following', sort: 'top', offset: 0, viewerId: 'me' });
    expect(page).toEqual({ items: [], next: null });
    expect(db.calls.post).toBeUndefined();
  });

  it('throws when the read fails so the feed can show its error', async () => {
    db.errors.post = { message: 'boom' };
    await expect(fetchFeed({ scope: 'all', sort: 'top', offset: 0, viewerId: null })).rejects.toBeTruthy();
  });
});

describe('fetchPost and writes', () => {
  it('skips the request for a malformed id', async () => {
    expect(await fetchPost('123', null)).toBeNull();
    expect(db.calls.post).toBeUndefined();
  });

  it('treats a duplicate upvote as done and other refusals as errors', async () => {
    db.errors.vote = { code: '23505', message: 'duplicate' };
    await expect(setVote('p1', 'me', true)).resolves.toBeUndefined();
    db.errors.vote = { code: 'check_violation', message: 'closed to votes' };
    await expect(setVote('p1', 'me', true)).rejects.toThrow('We couldn’t save your upvote. Try again.');
  });

  it('only sends post_id when voting (user_id comes from the session)', async () => {
    await setVote('p1', 'me', true);
    expect(has(only('vote'), 'insert', { post_id: 'p1' })).toBe(true);
  });

  it('reports a delete that RLS filtered out (zero rows) as a failure', async () => {
    db.rows.post = [];
    await expect(deletePost('p1')).rejects.toThrow('We couldn’t delete this post. Try again.');
    db.rows.post = [{ id: 'p1' }];
    await expect(deletePost('p1')).resolves.toBeUndefined();
  });
});
