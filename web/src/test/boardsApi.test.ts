import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactCount,
  siteLink,
  fetchBoard,
  fetchHub,
  fetchPostCounts,
  hubFormerNames,
  hubLegalName,
  ilikeTerm,
  isSlug,
  matchCatalogue,
  matchesAll,
  rankTrending,
  resolveHubSlug,
  searchAll,
  setScopeFollow,
  type Board,
  type Hub,
  type HubName,
} from '../api/boards';
import {
  anyWordQuery,
  createPost,
  fetchChangelog,
  fetchPostList,
  fetchRoadmap,
  fetchSimilar,
  groupChangelog,
  localDay,
  similarityScore,
  simTokens,
  type PostSummary,
} from '../api/posts';

/*
 * Step 6 api layer against a recording stand-in for the Supabase query builder:
 * the filters each read sends, how the composer's insert recovers from the
 * pre-0020 RLS read-back refusal, and the pure helpers. No network.
 */
type Call = [string, ...unknown[]];
type Result = { data: unknown; error: { code?: string; message: string } | null; count?: number };
const db = vi.hoisted(() => ({
  calls: {} as Record<string, Call[][]>,
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, { code?: string; message: string } | null>,
  /** Per-table queue of one-off results, used before rows/errors. */
  queue: {} as Record<string, Result[]>,
  /** Per-function results for rpc(), used before the truthy default. */
  rpcResults: {} as Record<string, { data: unknown; error: { code?: string; message: string } | null }>,
  count: 0,
}));

vi.mock('../api/supabase', () => {
  function builder(table: string) {
    const calls: Call[] = [];
    (db.calls[table] ??= []).push(calls);
    let queued: Result | undefined;
    const take = () => (queued ??= db.queue[table]?.shift() ?? { data: db.errors[table] ? null : (db.rows[table] ?? []), error: db.errors[table] ?? null, count: db.count });
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'or', 'order', 'range', 'limit', 'insert', 'update', 'delete', 'textSearch', 'gte']) {
      b[m] = (...args: unknown[]) => (calls.push([m, ...args]), b);
    }
    b.maybeSingle = () => {
      const r = take();
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    };
    b.single = b.maybeSingle;
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(take()).then(resolve);
    return b;
  }
  return {
    hasSupabaseConfig: true,
    getSupabase: () => ({
      from: builder,
      rpc: (fn: string, args: unknown) =>
        Promise.resolve(db.rpcResults[fn] ?? { data: true, error: null, args }),
    }),
    publicStorageUrl: () => null,
  };
});

const only = (table: string, i = 0) => db.calls[table]?.[i] ?? [];
const has = (calls: Call[], ...want: unknown[]) => calls.some((c) => JSON.stringify(c) === JSON.stringify(want));
const row = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 't', body: '', author: null, board: null, vote_count: 0, reply_count: 0, ...over });

const board = (over: Partial<Board>): Board => ({
  id: 'b',
  slug: 'b',
  name: 'B',
  tagline: '',
  site: null,
  color: '#000000',
  logo_path: null,
  category: null,
  hub_id: null,
  claimed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  follower_count: 0,
  post_count: 0,
  status: 'live',
  created_by: null,
  ...over,
});

beforeEach(() => {
  db.calls = {};
  db.rows = {};
  db.errors = {};
  db.queue = {};
  db.rpcResults = {};
  db.count = 0;
});

describe('board and hub reads', () => {
  it('answers a malformed slug without a request', async () => {
    expect(await fetchBoard('Not A Slug!')).toBeNull();
    expect(db.calls.board).toBeUndefined();
    expect(isSlug('figma-slides')).toBe(true);
    expect(isSlug('-bad')).toBe(false);
  });

  it('reads one board by slug with its hub', async () => {
    db.rows.board = [board({ slug: 'figjam', name: 'FigJam' })];
    const b = await fetchBoard('figjam');
    expect(b?.name).toBe('FigJam');
    expect(has(only('board'), 'eq', 'slug', 'figjam')).toBe(true);
    expect(JSON.stringify(only('board'))).toContain('hub:hub!hub_id');
  });

  it('counts live posts and roadmap items for the tabs', async () => {
    db.count = 7;
    const counts = await fetchPostCounts(['b1']);
    expect(counts).toEqual({ posts: 7, roadmap: 7 });
    const [all, roadmap] = [only('post', 0), only('post', 1)];
    expect(has(all, 'neq', 'status', 'merged')).toBe(true);
    expect(has(roadmap, 'in', 'status', ['planned', 'in_progress'])).toBe(true);
    expect(has(all, 'is', 'hidden_at', null)).toBe(true);
  });
});

describe('board feed', () => {
  it('filters one board by type and status, New order', async () => {
    db.rows.post = [row('p1')];
    await fetchPostList({ boardIds: ['b1'], type: 'bug', status: 'planned', sort: 'new', offset: 0, viewerId: null });
    const q = only('post');
    expect(has(q, 'eq', 'board_id', 'b1')).toBe(true);
    expect(has(q, 'eq', 'type', 'bug')).toBe(true);
    expect(has(q, 'eq', 'status', 'planned')).toBe(true);
    expect(has(q, 'neq', 'status', 'merged')).toBe(true);
    expect(has(q, 'order', 'created_at', { ascending: false })).toBe(true);
  });

  it('reads every board of a hub and leaves closed posts out when asked', async () => {
    await fetchPostList({ boardIds: ['b1', 'b2'], sort: 'top', offset: 0, viewerId: null, excludeClosed: true });
    const q = only('post');
    expect(has(q, 'in', 'board_id', ['b1', 'b2'])).toBe(true);
    expect(has(q, 'neq', 'status', 'closed')).toBe(true);
  });

  it('makes no request for a hub with no boards', async () => {
    expect(await fetchPostList({ boardIds: [], sort: 'top', offset: 0, viewerId: null })).toEqual({ items: [], next: null });
    expect(db.calls.post).toBeUndefined();
  });
});

describe('roadmap and changelog', () => {
  it('splits roadmap posts into their columns', async () => {
    db.rows.post = [
      { id: 'a', status: 'planned' },
      { id: 'b', status: 'shipped' },
      { id: 'c', status: 'in_progress' },
      { id: 'd', status: 'planned' },
    ];
    const r = await fetchRoadmap(['b1']);
    expect(r.planned.map((p) => p.id)).toEqual(['a', 'd']);
    expect(r.in_progress.map((p) => p.id)).toEqual(['c']);
    expect(r.shipped.map((p) => p.id)).toEqual(['b']);
    expect(has(only('post'), 'in', 'status', ['planned', 'in_progress', 'shipped'])).toBe(true);
  });

  it('dates shipped posts by their latest move to Shipped', async () => {
    db.rows.post = [
      { id: 'p1', board_id: 'b1', status: 'shipped', vote_count: 3, created_at: '2026-09-01T10:00:00Z' },
      { id: 'p2', board_id: 'b1', status: 'shipped', vote_count: 9, created_at: '2026-09-02T10:00:00Z' },
    ];
    db.rows.status_event = [
      { post_id: 'p1', at: '2026-10-20T10:00:00Z' },
      { post_id: 'p2', at: '2026-10-20T11:00:00Z' },
      { post_id: 'p1', at: '2026-10-01T12:00:00Z' },
    ];
    const entries = await fetchChangelog(['b1']);
    expect(has(only('status_event'), 'eq', 'to', 'shipped')).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.posts.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('groups by local day, newest day first', () => {
    const s = (id: string, at: string): PostSummary & { shipped_at: string } => ({
      id,
      board_id: 'b',
      title: id,
      type: 'bug',
      status: 'shipped',
      vote_count: 0,
      reply_count: 0,
      created_at: at,
      board: null,
      shipped_at: at,
    });
    const days = groupChangelog([s('old', '2026-10-01T12:00:00'), s('new', '2026-10-21T12:00:00'), s('new2', '2026-10-21T09:00:00')]);
    expect(days.map((d) => d.day)).toEqual([localDay('2026-10-21T12:00:00'), localDay('2026-10-01T12:00:00')]);
    expect(days[0]?.posts).toHaveLength(2);
  });
});

describe('composer: createPost', () => {
  const draft = { boardId: 'b1', type: 'feature' as const, title: '  Keyboard shortcut for cycles ', body: ' details ' };

  it('inserts only the granted columns, trimmed, and returns the post', async () => {
    db.rows.post = [row('new', { title: 'Keyboard shortcut for cycles' })];
    const post = await createPost(draft, 'me');
    const q = only('post');
    expect(has(q, 'insert', { board_id: 'b1', type: 'feature', title: 'Keyboard shortcut for cycles', body: 'details' })).toBe(true);
    expect(q.some((c) => c[0] === 'select')).toBe(true);
    expect(post.id).toBe('new');
    expect(post.following).toBe(true);
  });

  it('falls back to a plain insert and a read when RLS refuses the read-back (before 0020)', async () => {
    db.queue.post = [
      { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "post"' } },
      { data: null, error: null },
      { data: [row('found')], error: null },
    ];
    const post = await createPost(draft, 'me');
    expect(post.id).toBe('found');
    const read = only('post', 2);
    expect(has(read, 'eq', 'author_id', 'me')).toBe(true);
    expect(has(read, 'eq', 'title', 'Keyboard shortcut for cycles')).toBe(true);
    expect(has(read, 'order', 'created_at', { ascending: false })).toBe(true);
  });

  it('explains a block without retrying', async () => {
    db.queue.post = [{ data: null, error: { code: '42501', message: 'blocked on this board' } }];
    await expect(createPost(draft, 'me')).rejects.toThrow('You can’t post on this board.');
    expect(db.calls.post).toHaveLength(1);
  });
});

describe('similar posts', () => {
  it('tokenises like the mockup and builds an any-word prefix query', () => {
    expect(simTokens('Add support for keyboard shortcuts in cycles')).toEqual(['keyboard', 'shortcut', 'cycl']);
    expect(anyWordQuery('Keyboard shortcuts!')).toBe('keyboard:* | shortcut:*');
    expect(anyWordQuery('the and of')).toBeNull();
  });

  it('needs a shared title word and enough overlap', () => {
    expect(similarityScore('keyboard shortcut for cycles', { title: 'Cycle keyboard shortcuts' })).toBeGreaterThan(0);
    expect(similarityScore('keyboard shortcut for cycles', { title: 'Dark mode', body: 'keyboard shortcut cycles' })).toBe(0);
  });

  it('searches the chosen boards with full-text search and keeps only close matches', async () => {
    db.rows.post = [row('close', { title: 'Keyboard shortcuts for cycles', vote_count: 4 }), row('far', { title: 'Layout glitch on resize' })];
    const out = await fetchSimilar('Shortcut to switch cycles by keyboard', ['b1'], null);
    expect(out.map((p) => p.id)).toEqual(['close']);
    const q = only('post');
    expect(q.some((c) => c[0] === 'textSearch' && c[1] === 'search')).toBe(true);
    expect(has(q, 'in', 'board_id', ['b1'])).toBe(true);
  });

  it('waits for a real title', async () => {
    expect(await fetchSimilar('short', ['b1'], null)).toEqual([]);
    expect(db.calls.post).toBeUndefined();
  });
});

describe('search', () => {
  const boards = [
    board({ id: 'f', name: 'Figma', tagline: 'Collaborative interface design', follower_count: 5 }),
    board({ id: 'j', name: 'FigJam', tagline: 'Online whiteboard for teams' }),
    board({ id: 'l', name: 'Linear', tagline: 'Issue tracking and product planning' }),
  ];
  const hubs: Hub[] = [
    { id: 'h', slug: 'figma', name: 'Figma', description: 'Figma, FigJam and Figma Slides', primary_domain: 'figma.com', domains: ['figma.com'], former_names: [], legal_name: null, claimed_at: null, created_at: '', follower_count: 0, boards: boards.slice(0, 2) },
  ];

  it('matches boards and hubs word by word, names first', () => {
    const m = matchCatalogue('fig', boards, hubs);
    expect(m.boards.map((b) => b.id)).toEqual(['f', 'j']);
    expect(m.hubs).toHaveLength(1);
    expect(matchCatalogue('product planning', boards, hubs).boards.map((b) => b.id)).toEqual(['l']);
    expect(matchCatalogue('figjam', boards, [{ ...hubs[0]!, description: '' }]).hubs).toHaveLength(1); // a hub holding a matching board
    expect(matchesAll('Issue tracking', 'track iss')).toBe(true);
  });

  it('strips characters PostgREST and ilike treat specially', () => {
    expect(ilikeTerm('a,b (c)% d_e*')).toBe('a b c d e');
  });

  it('runs a websearch full-text query for posts', async () => {
    db.rows.post = [row('p1')];
    const r = await searchAll('dark mode', { boards, hubs });
    const q = only('post');
    expect(q.some((c) => c[0] === 'textSearch' && c[2] === 'dark mode' && JSON.stringify(c[3]).includes('websearch'))).toBe(true);
    expect(has(q, 'is', 'hidden_at', null)).toBe(true);
    expect(r.posts.map((p) => p.id)).toEqual(['p1']);
  });

  it('does not search a single character', async () => {
    expect(await searchAll('a', { boards, hubs })).toEqual({ boards: [], hubs: [], posts: [] });
    expect(db.calls.post).toBeUndefined();
  });
});

describe('following boards and hubs', () => {
  it('treats a duplicate follow as done and reports other failures', async () => {
    db.errors.follow = { code: '23505', message: 'duplicate' };
    await expect(setScopeFollow('board', 'b1', 'me', true)).resolves.toBeUndefined();
    db.errors.follow = { code: '500', message: 'boom' };
    await expect(setScopeFollow('hub', 'h1', 'me', true)).rejects.toThrow('We couldn’t follow this hub. Try again.');
  });

  it('unfollows only the viewer’s own row', async () => {
    await setScopeFollow('board', 'b1', 'me', false);
    const q = only('follow');
    expect(has(q, 'eq', 'user_id', 'me')).toBe(true);
    expect(has(q, 'eq', 'target', 'board')).toBe(true);
    expect(has(q, 'eq', 'target_id', 'b1')).toBe(true);
  });
});

describe('helpers', () => {
  it('ranks trending by posts this week, then size', () => {
    const list = [board({ id: 'a', name: 'A', post_count: 50 }), board({ id: 'b', name: 'B', post_count: 1 }), board({ id: 'c', name: 'C', post_count: 9 })];
    const ranked = rankTrending(list, [{ board_id: 'b' }, { board_id: 'b' }, { board_id: 'c' }], 3);
    expect(ranked.map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(ranked[0]?.recent).toBe(2);
  });

  it('prints follower counts compactly', () => {
    expect(compactCount(950)).toBe('950');
    expect(compactCount(4100)).toBe('4.1k');
    expect(compactCount(12_400)).toBe('12k');
  });
});

describe('siteLink', () => {
  it.each([
    ['linear.app', 'https://linear.app/', 'linear.app'],
    ['www.figma.com', 'https://www.figma.com/', 'figma.com'],
    ['https://cursor.com/pricing', 'https://cursor.com/pricing', 'cursor.com'],
    ['http://example.org', 'http://example.org/', 'example.org'],
    ['github.com/vercel/next.js', 'https://github.com/vercel/next.js', 'github.com/vercel/next.js'],
    ['github.com/vercel/next.js/tree/canary', 'https://github.com/vercel/next.js/tree/canary', 'github.com/vercel/next.js'],
  ])('%s', (site, href, label) => {
    expect(siteLink(site)).toEqual({ href, label });
  });

  it.each([null, undefined, '', '   ', 'not a site', 'javascript:alert(1)', 'ftp://x.com'])('rejects %s', (site) => {
    expect(siteLink(site)).toBeNull();
  });
});

/*
 * 0030: a company that changes its name keeps the names it used, its old address resolves
 * to it, and searching an old name finds it.
 */
describe('company names (0030)', () => {
  const SXI = '7a000000-0000-4000-8000-000000000001';
  const history = (over: HubName[] = []): HubName[] => [
    ...over,
    { name: 'SpaceXSI', slug: 'spacexsi', kind: 'trade', is_current: true, created_at: '2026-10-24T10:00:00Z' },
    { name: 'SpaceXAI', slug: 'spacexai', kind: 'former', is_current: false, created_at: '2026-10-24T09:00:00Z' },
    { name: 'xAI', slug: 'xai', kind: 'former', is_current: false, created_at: '2026-10-24T08:00:00Z' },
    { name: 'SpaceXAI LLC', slug: 'spacexai-llc', kind: 'legal', is_current: false, created_at: '2026-10-24T07:00:00Z' },
  ];

  const hub = (over: Partial<Hub> = {}): Hub => ({
    id: SXI,
    slug: 'spacexsi',
    name: 'SpaceXSI',
    description: 'SpaceX Super Intelligence',
    primary_domain: 'x.ai',
    domains: ['x.ai'],
    former_names: ['SpaceXAI', 'xAI'],
    legal_name: 'SpaceXAI LLC',
    claimed_at: null,
    created_at: '',
    follower_count: 0,
    boards: [],
    ...over,
  });

  it('lists former names newest first, without the legal entity or the current name', () => {
    expect(hubFormerNames({ name: 'SpaceXSI', hub_name: history() })).toEqual(['SpaceXAI', 'xAI']);
    // Once the company renames, the name it leaves behind joins the list.
    expect(
      hubFormerNames({
        name: 'xAI',
        hub_name: [
          { name: 'xAI', slug: 'xai', kind: 'trade', is_current: true, created_at: '2026-10-25T10:00:00Z' },
          { name: 'SpaceXSI', slug: 'spacexsi', kind: 'former', is_current: false, created_at: '2026-10-24T10:00:00Z' },
        ],
      }),
    ).toEqual(['SpaceXSI']);
    // The same name used twice is reported once, newest first.
    expect(
      hubFormerNames({ name: 'SpaceXSI', hub_name: history([{ name: 'xai', slug: 'xai-2', kind: 'former', is_current: false, created_at: '2026-10-24T11:00:00Z' }]) }),
    ).toEqual(['xai', 'SpaceXAI']);
  });

  it('reports the legal entity only when it differs from the name shown', () => {
    expect(hubLegalName({ name: 'SpaceXSI', hub_name: history() })).toBe('SpaceXAI LLC');
    expect(hubLegalName({ name: 'Figma', hub_name: [{ name: 'Figma', slug: 'figma', kind: 'legal', is_current: false }] })).toBeNull();
    expect(hubLegalName({ name: 'Figma' })).toBeNull();
  });

  it('resolves a former slug to the company that owns it, and nothing for an unused one', async () => {
    db.rpcResults.resolve_hub_slug = { data: [{ hub_id: SXI, slug: 'xai', name: 'xAI', is_current: false }], error: null };
    await expect(resolveHubSlug('xai')).resolves.toEqual({ hub_id: SXI, slug: 'xai', name: 'xAI', is_current: false });
    db.rpcResults.resolve_hub_slug = { data: [], error: null };
    await expect(resolveHubSlug('nobody-used-this')).resolves.toBeNull();
  });

  it('loads a hub asked for by a former slug, so the page can send the reader to the current one', async () => {
    db.rpcResults.resolve_hub_slug = { data: [{ hub_id: SXI, slug: 'xai', name: 'xAI', is_current: false }], error: null };
    db.rows.hub = [
      {
        ...hub(),
        hub_domain: [{ domain: 'x.ai', created_at: '' }],
        hub_name: history(),
        status: 'live',
        board: [],
      },
    ];
    const found = await fetchHub('xai');
    expect(found?.slug).toBe('spacexsi');
    expect(found?.former_names).toEqual(['SpaceXAI', 'xAI']);
    // Read by the id the resolver returned, not by the slug the reader typed.
    expect(has(only('hub'), 'eq', 'id', SXI)).toBe(true);
  });

  it('finds a company by a name it no longer uses, current-name matches first', () => {
    const hubs = [hub(), hub({ id: 'other', slug: 'xai-tools', name: 'xAI Tools', description: '', former_names: [], legal_name: null })];
    expect(matchCatalogue('xai', [], hubs).hubs.map((h) => h.slug)).toEqual(['xai-tools', 'spacexsi']);
    expect(matchCatalogue('spacexai', [], hubs).hubs.map((h) => h.slug)).toEqual(['spacexsi']);
    expect(matchCatalogue('spacexai llc', [], hubs).hubs.map((h) => h.slug)).toEqual(['spacexsi']);
  });
});
