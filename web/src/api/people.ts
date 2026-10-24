import { getSupabase } from './supabase';
import { ilikeTerm } from './boards';
import { ApiError, type BoardRef, type PersonRef } from './posts';
import type { Role, Scope } from './teams';

/*
 * People (FOUNDATION §6, §9 `/u/:handle`, step 8): public profiles, their replies,
 * following people, and the boards and hubs the viewer manages. Profiles are public;
 * follow rows are private to their owner, so a profile shows what anyone may read
 * (followers count, posts, replies) and the viewer's own "following" only to them.
 */

export interface PublicProfile extends PersonRef {
  bio: string;
  created_at: string;
  follower_count: number;
}

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
export const isHandle = (h: string | null | undefined): h is string => Boolean(h && HANDLE_RE.test(h));

export async function fetchProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const h = handle.replace(/^@/, '').toLowerCase();
  if (!isHandle(h)) return null;
  const { data, error } = await getSupabase()
    .from('profile')
    .select('id, handle, name, avatar_path, bio, created_at, follower_count')
    .eq('handle', h)
    .maybeSingle();
  if (error) throw error;
  return (data as PublicProfile | null) ?? null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Joined Oct 2026" */
export function joinedLabel(iso: string): string {
  const d = new Date(iso);
  return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface UserStats {
  posts: number;
  upvotes: number;
}

/** Live posts and the upvotes they received (summed over at most 1000 posts). */
export async function fetchUserStats(userId: string): Promise<UserStats> {
  const { data, error, count } = await getSupabase()
    .from('post')
    .select('vote_count', { count: 'exact' })
    .eq('author_id', userId)
    .is('hidden_at', null)
    .neq('status', 'merged')
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ vote_count: number }>;
  return { posts: count ?? rows.length, upvotes: rows.reduce((n, r) => n + r.vote_count, 0) };
}

export interface UserReply {
  id: string;
  body: string;
  created_at: string;
  post: { id: string; title: string; board: BoardRef | null } | null;
}

/** A person's own replies (not the ones they posted as their board's team), newest first. */
export async function fetchUserReplies(userId: string, limit = 30): Promise<UserReply[]> {
  const { data, error } = await getSupabase()
    .from('reply')
    .select('id, body, created_at, post:post!post_id(id, title, board:board!board_id(id, slug, name, color, logo_path))')
    .eq('author_id', userId)
    .eq('is_official', false)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  // A reply whose post the viewer may no longer see comes back without its post.
  return ((data ?? []) as unknown as UserReply[]).filter((r) => r.post);
}

// ------------------------------------------------------------------ following people

export async function fetchFollowsUser(viewerId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('follow')
    .select('target_id')
    .eq('user_id', viewerId)
    .eq('target', 'user')
    .eq('target_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** People the viewer follows (their own rows only), as a set of ids. */
export async function fetchFollowedUsers(viewerId: string): Promise<Set<string>> {
  const { data, error } = await getSupabase().from('follow').select('target_id').eq('user_id', viewerId).eq('target', 'user');
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ target_id: string }>).map((f) => f.target_id));
}

export async function setUserFollow(userId: string, viewerId: string, on: boolean): Promise<void> {
  const sb = getSupabase();
  if (on) {
    if (userId === viewerId) throw new ApiError('You can’t follow yourself.');
    const { error } = await sb.from('follow').insert({ target: 'user', target_id: userId });
    if (error && error.code !== '23505') throw new ApiError('We couldn’t follow them. Try again.');
  } else {
    const { error } = await sb.from('follow').delete().eq('user_id', viewerId).eq('target', 'user').eq('target_id', userId);
    if (error) throw new ApiError('We couldn’t unfollow them. Try again.');
  }
}

// ------------------------------------------------------------------ what the viewer manages

export interface Managed {
  scope: Scope;
  scope_id: string;
  role: Role;
  name: string;
  slug: string;
  color: string;
  logo_path: string | null;
  /** Hub: its boards. */
  boards: Array<{ name: string; color: string; logo_path: string | null }>;
  /** Live posts with no status yet. */
  waiting: number;
}

export async function fetchManaged(viewerId: string): Promise<Managed[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from('membership').select('scope, scope_id, role').eq('user_id', viewerId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ scope: Scope; scope_id: string; role: Role }>;
  if (rows.length === 0) return [];
  const boardIds = rows.filter((r) => r.scope === 'board').map((r) => r.scope_id);
  const hubIds = rows.filter((r) => r.scope === 'hub').map((r) => r.scope_id);
  const [boards, hubs, hubBoards] = await Promise.all([
    boardIds.length ? sb.from('board').select('id, slug, name, color, logo_path').in('id', boardIds) : Promise.resolve({ data: [], error: null }),
    hubIds.length ? sb.from('hub').select('id, slug, name').in('id', hubIds) : Promise.resolve({ data: [], error: null }),
    hubIds.length ? sb.from('board').select('id, hub_id, name, color, logo_path').in('hub_id', hubIds).order('name') : Promise.resolve({ data: [], error: null }),
  ]);
  if (boards.error) throw boards.error;
  if (hubs.error) throw hubs.error;
  if (hubBoards.error) throw hubBoards.error;
  const hb = (hubBoards.data ?? []) as Array<{ id: string; hub_id: string; name: string; color: string; logo_path: string | null }>;
  const allBoards = [...boardIds, ...hb.map((b) => b.id)];
  const open = allBoards.length
    ? await sb.from('post').select('board_id').in('board_id', allBoards).eq('status', 'open').is('hidden_at', null).limit(2000)
    : { data: [], error: null };
  if (open.error) throw open.error;
  const waiting = new Map<string, number>();
  for (const p of (open.data ?? []) as Array<{ board_id: string }>) waiting.set(p.board_id, (waiting.get(p.board_id) ?? 0) + 1);

  const out: Managed[] = [];
  for (const r of rows) {
    if (r.scope === 'board') {
      const b = ((boards.data ?? []) as Array<{ id: string; slug: string; name: string; color: string; logo_path: string | null }>).find((x) => x.id === r.scope_id);
      if (b) out.push({ ...r, name: b.name, slug: b.slug, color: b.color, logo_path: b.logo_path, boards: [], waiting: waiting.get(b.id) ?? 0 });
    } else {
      const h = ((hubs.data ?? []) as Array<{ id: string; slug: string; name: string }>).find((x) => x.id === r.scope_id);
      if (!h) continue;
      const mine = hb.filter((b) => b.hub_id === h.id);
      out.push({
        ...r,
        name: h.name,
        slug: h.slug,
        color: mine[0]?.color ?? '',
        logo_path: mine[0]?.logo_path ?? null,
        boards: mine.map((b) => ({ name: b.name, color: b.color, logo_path: b.logo_path })),
        waiting: mine.reduce((n, b) => n + (waiting.get(b.id) ?? 0), 0),
      });
    }
  }
  return out.sort((a, b) => (a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'hub' ? -1 : 1));
}

// ------------------------------------------------------------------ people in search

/** People whose handle or name matches (FOUNDATION §11 step 8: people in search). */
export async function searchPeople(q: string, limit = 5): Promise<PersonRef[]> {
  const term = ilikeTerm(q.replace(/^@/, ''));
  if (term.length < 2) return [];
  const { data, error } = await getSupabase()
    .from('profile')
    .select('id, handle, name, avatar_path')
    .or(`handle.ilike.%${term}%,name.ilike.%${term}%`)
    .order('follower_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PersonRef[];
}
