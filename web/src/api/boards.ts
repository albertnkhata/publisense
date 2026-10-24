import { getSupabase, publicStorageUrl } from './supabase';
import { ApiError, searchPosts, type Post } from './posts';

/*
 * Boards, hubs, following them, and search (FOUNDATION §6, step 6).
 *
 * board and hub are public reads. Following is the viewer's own `follow` rows
 * (target 'board' | 'hub'); follower counts are kept by a trigger. Posts on a
 * hub's boards reach the Following feed through the hub follow (posts.ts), so
 * following a hub does not need a follow per board.
 */

export type BoardCategory = 'ai' | 'code' | 'dev' | 'design' | 'prod' | 'browser';
/** 0024: new boards wait for review; existing boards are live. */
export type BoardStatus = 'pending' | 'live' | 'rejected';

export interface Board {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  site: string | null;
  color: string;
  logo_path: string | null;
  category: BoardCategory | null;
  hub_id: string | null;
  claimed_at: string | null;
  created_at: string;
  follower_count: number;
  post_count: number;
  status: BoardStatus;
  /** Who added it (0024); null for the seeded catalogue or a deleted account. */
  created_by: string | null;
}

export interface HubRef {
  id: string;
  slug: string;
  name: string;
  /** On a board's own hub (fetchBoard): whether a team claimed it, and its domain. */
  claimed_at?: string | null;
  primary_domain?: string | null;
}

export interface BoardWithHub extends Board {
  hub: HubRef | null;
  /** "Added by @handle" until the board is claimed. */
  creator?: { id: string; handle: string; name: string; avatar_path: string | null } | null;
  /** Why a board was not approved (its creator and staff only). */
  review_note?: string | null;
}

export interface Hub {
  id: string;
  slug: string;
  name: string;
  description: string;
  primary_domain: string | null;
  claimed_at: string | null;
  created_at: string;
  follower_count: number;
  /** Its boards, alphabetical. */
  boards: Board[];
}

export const BOARD_COLUMNS =
  'id, slug, name, tagline, site, color, logo_path, category, hub_id, claimed_at, created_at, follower_count, post_count, status, created_by';
const HUB_COLUMNS = 'id, slug, name, description, primary_domain, claimed_at, created_at, follower_count';

/** Explore's category chips, in the mockup's order and wording. */
export const CATEGORIES: Array<{ value: 'all' | BoardCategory; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'ai', label: 'AI assistants' },
  { value: 'code', label: 'Code editors' },
  { value: 'dev', label: 'Dev platforms' },
  { value: 'design', label: 'Design' },
  { value: 'prod', label: 'Productivity' },
  { value: 'browser', label: 'Browsers' },
];

/**
 * Boards that belong in public lists (Explore, search, hubs, trending). RLS also lets
 * a creator and platform admins read pending boards; those stay off the lists.
 */
export const isLive = (b: Pick<Board, 'status'>) => (b.status ?? 'live') === 'live';

/** Boards the composer may offer: live ones, plus the viewer's own pending boards. */
export const isPostable = (b: Pick<Board, 'status' | 'created_by'>, viewerId: string | null) =>
  isLive(b) || (b.status === 'pending' && Boolean(viewerId) && b.created_by === viewerId);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isSlug = (s: string | null | undefined): s is string => Boolean(s && s.length <= 40 && SLUG_RE.test(s));

export const logoSrc = (b: { logo_path: string | null } | null | undefined) => publicStorageUrl('board-logos', b?.logo_path);

/** "1.2k" style counts for followers, as the mockup prints them. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------ reads

/** Every board, alphabetical. The catalogue is small (tens of boards), so Explore filters client-side. */
export async function fetchBoards(): Promise<Board[]> {
  const { data, error } = await getSupabase().from('board').select(BOARD_COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as Board[];
}

/** One board by slug with its hub, or null. */
export async function fetchBoard(slug: string): Promise<BoardWithHub | null> {
  if (!isSlug(slug)) return null;
  const { data, error } = await getSupabase()
    .from('board')
    .select(
      `${BOARD_COLUMNS}, review_note, hub:hub!hub_id(id, slug, name, claimed_at, primary_domain), creator:profile!board_created_by_fkey(id, handle, name, avatar_path)`,
    )
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as BoardWithHub | null) ?? null;
}

/** Every hub with its boards. */
export async function fetchHubs(): Promise<Hub[]> {
  const { data, error } = await getSupabase()
    .from('hub')
    .select(`${HUB_COLUMNS}, boards:board(${BOARD_COLUMNS})`)
    .order('name');
  if (error) throw error;
  return ((data ?? []) as Hub[]).map(sortHubBoards);
}

/** One hub by slug with its boards, or null. */
export async function fetchHub(slug: string): Promise<Hub | null> {
  if (!isSlug(slug)) return null;
  const { data, error } = await getSupabase()
    .from('hub')
    .select(`${HUB_COLUMNS}, boards:board(${BOARD_COLUMNS})`)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data ? sortHubBoards(data as Hub) : null;
}

function sortHubBoards(h: Hub): Hub {
  return { ...h, boards: [...(h.boards ?? [])].filter(isLive).sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Live posts and roadmap items on a set of boards, for the tab counts. */
export async function fetchPostCounts(boardIds: string[]): Promise<{ posts: number; roadmap: number }> {
  if (boardIds.length === 0) return { posts: 0, roadmap: 0 };
  const sb = getSupabase();
  const live = () => sb.from('post').select('id', { count: 'exact', head: true }).in('board_id', boardIds).is('hidden_at', null);
  const [all, roadmap] = await Promise.all([live().neq('status', 'merged'), live().in('status', ['planned', 'in_progress'])]);
  if (all.error) throw all.error;
  if (roadmap.error) throw roadmap.error;
  return { posts: all.count ?? 0, roadmap: roadmap.count ?? 0 };
}

/**
 * Trending: boards with the most new posts in the last 7 days, then by size.
 * Counted client-side from at most 500 recent post rows (board_id only), which
 * is plenty at today's volume; a server-side aggregate can replace it later.
 */
export async function fetchTrending(boards: Board[], limit = 4, now: Date = new Date()): Promise<Array<Board & { recent: number }>> {
  const since = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const { data, error } = await getSupabase()
    .from('post')
    .select('board_id')
    .gte('created_at', since)
    .is('hidden_at', null)
    .limit(500);
  if (error) throw error;
  return rankTrending(boards, (data ?? []) as Array<{ board_id: string }>, limit);
}

export function rankTrending(boards: Board[], recentPosts: Array<{ board_id: string }>, limit: number): Array<Board & { recent: number }> {
  const recent = new Map<string, number>();
  for (const p of recentPosts) recent.set(p.board_id, (recent.get(p.board_id) ?? 0) + 1);
  return boards
    .filter(isLive)
    .map((b) => ({ ...b, recent: recent.get(b.id) ?? 0 }))
    .sort((a, b) => b.recent - a.recent || b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Is the viewer on this board's team (directly or through its hub)? Mirrors RLS; the UI shows Manage and team controls from it. */
export async function fetchIsBoardTeam(boardId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('is_board_team', { p_board: boardId });
  if (error) return false;
  return data === true;
}

// ------------------------------------------------------------------ following boards and hubs

export type FollowTarget = 'board' | 'hub';
export const followKey = (target: FollowTarget, id: string) => `${target}:${id}`;

/** The boards and hubs the viewer follows, as "board:<id>" / "hub:<id>" keys. */
export async function fetchFollowedScopes(viewerId: string): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from('follow')
    .select('target, target_id')
    .eq('user_id', viewerId)
    .in('target', ['board', 'hub']);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ target: FollowTarget; target_id: string }>).map((f) => followKey(f.target, f.target_id)));
}

export async function setScopeFollow(target: FollowTarget, id: string, viewerId: string, on: boolean): Promise<void> {
  const sb = getSupabase();
  const what = target === 'hub' ? 'hub' : 'board';
  if (on) {
    const { error } = await sb.from('follow').insert({ target, target_id: id });
    if (error && error.code !== '23505') throw new ApiError(`We couldn’t follow this ${what}. Try again.`);
  } else {
    const { error } = await sb.from('follow').delete().eq('user_id', viewerId).eq('target', target).eq('target_id', id);
    if (error) throw new ApiError(`We couldn’t unfollow this ${what}. Try again.`);
  }
}

// ------------------------------------------------------------------ search

export const SEARCH_MIN = 2;

/** Terms for ilike: PostgREST's or=() syntax reserves , ( ) and ilike treats % _ \ as patterns. */
export function ilikeTerm(q: string): string {
  return q
    .replace(/[,()%_\\*"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchResults {
  boards: Board[];
  hubs: Hub[];
  posts: Post[];
}

/** Does every word of the query appear in the text (case-insensitive)? */
export function matchesAll(text: string, q: string): boolean {
  const t = text.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w));
}

/**
 * Search boards (name, tagline), hubs (name, description, or holding a matching
 * board) and posts (Postgres full-text search over title and body, `websearch`
 * syntax, most upvoted first). Boards and hubs are few, so they are read whole
 * and matched word by word here, which also handles multi-word queries.
 */
export async function searchAll(
  q: string,
  { postLimit = 30, boards: knownBoards, hubs: knownHubs, viewerId = null }: { postLimit?: number; boards?: Board[]; hubs?: Hub[]; viewerId?: string | null } = {},
): Promise<SearchResults> {
  const term = q.trim();
  if (term.length < SEARCH_MIN) return { boards: [], hubs: [], posts: [] };
  const [boardList, hubList, posts] = await Promise.all([
    knownBoards ? Promise.resolve(knownBoards) : fetchBoards(),
    knownHubs ? Promise.resolve(knownHubs) : fetchHubs(),
    searchPosts(term, viewerId, postLimit),
  ]);
  return { ...matchCatalogue(term, boardList, hubList), posts };
}

export function matchCatalogue(q: string, boards: Board[], hubs: Hub[]): { boards: Board[]; hubs: Hub[] } {
  const term = ilikeTerm(q);
  if (term.length < 1) return { boards: [], hubs: [] };
  const matchedBoards = boards
    .filter((b) => isLive(b) && matchesAll(`${b.name} ${b.tagline}`, term))
    .sort((a, b) => Number(matchesAll(b.name, term)) - Number(matchesAll(a.name, term)) || b.follower_count - a.follower_count || a.name.localeCompare(b.name));
  const matchedHubs = hubs.filter(
    (h) => matchesAll(`${h.name} ${h.description}`, term) || h.boards.some((b) => matchesAll(b.name, term)),
  );
  return { boards: matchedBoards, hubs: matchedHubs };
}

// ------------------------------------------------------------------ recent searches (this device only)

const RECENT_KEY = 'publisense:recent-searches';

export function readRecentSearches(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(q: string): string[] {
  const term = q.trim();
  const next = term ? [term, ...readRecentSearches().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 6) : readRecentSearches();
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: recent searches just aren't kept */
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
