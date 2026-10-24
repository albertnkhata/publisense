import { getSupabase, publicStorageUrl } from './supabase';

/*
 * Posts, votes, replies and post follows (FOUNDATION §6, step 5).
 *
 * Every call here runs as the signed-in user (or anon) through the public API,
 * so RLS and the column grants in 0017_v2_rls.sql decide what actually happens:
 *   - post:  insert/update (title, body, type) and delete by the author only;
 *            status, counters, hidden_at are never client-writable.
 *   - vote:  insert (post_id) / delete your own; user_id defaults to auth.uid().
 *   - reply: insert (post_id, parent_id, body), update (body), delete: author only.
 *            Deleting a reply deletes its replies too (parent_id cascades).
 *   - follow: your own rows; voting auto-follows the post (trigger).
 * Deletes are hard deletes. A post or reply whose author deleted their account
 * keeps author_id = null and shows as "deleted user"; a post with no author and a
 * source_url is a seeded post.
 */

export type PostType = 'bug' | 'feature';
export type PostStatus = 'open' | 'under_review' | 'planned' | 'in_progress' | 'shipped' | 'closed' | 'merged';
export type FeedScope = 'all' | 'following';
export type FeedSort = 'top' | 'new';

export interface PersonRef {
  id: string;
  handle: string;
  name: string;
  avatar_path: string | null;
}

export interface BoardRef {
  id: string;
  slug: string;
  name: string;
  color: string;
  logo_path: string | null;
}

export interface OfficialReply {
  id: string;
  body: string;
  created_at: string;
  author: PersonRef | null;
}

export interface Post {
  id: string;
  board_id: string;
  author_id: string | null;
  source_url: string | null;
  type: PostType;
  status: PostStatus;
  title: string;
  body: string;
  merged_into: string | null;
  hidden_at: string | null;
  edited_at: string | null;
  created_at: string;
  vote_count: number;
  reply_count: number;
  author: PersonRef | null;
  board: BoardRef | null;
  /** The viewer has upvoted it. Always false signed out. */
  voted: boolean;
  /** The viewer follows it. Always false signed out. */
  following: boolean;
  /** Latest official (team) reply, shown on the card. */
  official: OfficialReply | null;
}

export interface FeedPage {
  items: Post[];
  /** Offset of the next page, or null when the feed is exhausted. */
  next: number | null;
}

export const FEED_PAGE_SIZE = 20;

const PERSON = 'id, handle, name, avatar_path';
const BOARD = 'id, slug, name, color, logo_path';
export const POST_SELECT =
  'id, board_id, author_id, source_url, type, status, title, body, merged_into, hidden_at, edited_at, created_at, vote_count, reply_count, ' +
  `author:profile!author_id(${PERSON}), board:board!board_id(${BOARD})`;
const REPLY_SELECT = `id, post_id, parent_id, author_id, body, is_official, hidden_at, edited_at, created_at, author:profile!author_id(${PERSON})`;

type PostRow = Omit<Post, 'voted' | 'following' | 'official'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPostId = (id: string | null | undefined): id is string => Boolean(id && UUID_RE.test(id));

// ------------------------------------------------------------------ pure helpers

/** "seeded" (imported from a public source), "deleted" (author removed their account) or "community". */
export function postKind(p: Pick<Post, 'author' | 'author_id' | 'source_url'>): 'seeded' | 'deleted' | 'community' {
  if (p.author) return 'community';
  if (!p.author_id && p.source_url) return 'seeded';
  return 'deleted';
}

/** "GitHub", "Reddit", "X" or the bare host, for "from GitHub" on seeded posts. */
export function sourceLabel(url: string | null | undefined): string {
  if (!url) return 'the web';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'github.com' || host.endsWith('.github.com')) return 'GitHub';
    if (host === 'reddit.com' || host.endsWith('.reddit.com')) return 'Reddit';
    if (host === 'x.com' || host === 'twitter.com') return 'X';
    return host;
  } catch {
    return 'the web';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compact age, as the mockup writes it: "now", "5m", "4h", "3d", "2w", then "Oct 12" (or "Oct 12, 2025"). */
export function shortAge(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const s = Math.max(0, (now.getTime() - t.getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  if (s < 5 * 7 * 86400) return `${Math.floor(s / (7 * 86400))}w`;
  return formatDate(iso, now);
}

/** "4h ago" on cards; "now" and dates stand alone. */
export function ago(iso: string, now: Date = new Date()): string {
  const a = shortAge(iso, now);
  return a === 'now' ? 'just now' : /^\d+[mhdw]$/.test(a) ? `${a} ago` : a;
}

/** "Oct 12, 2026" (year dropped when it is this year unless `withYear`). */
export function formatDate(iso: string, now: Date = new Date(), withYear = false): string {
  const d = new Date(iso);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return withYear || d.getFullYear() !== now.getFullYear() ? `${base}, ${d.getFullYear()}` : base;
}

export const TITLE_MIN = 3;
export const TITLE_MAX = 140;
export const BODY_MAX = 10_000;
export const REPLY_MAX = 5_000;

export interface PostDraft {
  type: PostType;
  title: string;
  body: string;
}
export type PostErrors = Partial<Record<keyof PostDraft, string>>;

/** Mirrors the table checks so the form explains them before the server refuses. */
export function validatePost(d: PostDraft): PostErrors {
  const e: PostErrors = {};
  const title = d.title.trim();
  if (title.length < TITLE_MIN) e.title = `Give it a title of at least ${TITLE_MIN} characters.`;
  else if (title.length > TITLE_MAX) e.title = `Keep the title to ${TITLE_MAX} characters.`;
  if (d.body.length > BODY_MAX) e.body = `Keep the details to ${BODY_MAX.toLocaleString('en')} characters.`;
  if (d.type !== 'bug' && d.type !== 'feature') e.type = 'Pick a type.';
  return e;
}

export function validateReply(body: string): string | null {
  const v = body.trim();
  if (!v) return 'Write something first.';
  if (v.length > REPLY_MAX) return `Keep replies to ${REPLY_MAX.toLocaleString('en')} characters.`;
  return null;
}

export const avatarSrc = (p: PersonRef | null | undefined) => publicStorageUrl('avatars', p?.avatar_path);
export const boardLogoSrc = (b: BoardRef | null | undefined) => publicStorageUrl('board-logos', b?.logo_path);

/** Same post can appear on two pages when Top reorders between fetches; keep the first. */
export function dedupePosts(pages: FeedPage[]): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (const page of pages) {
    for (const p of page.items) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

// ------------------------------------------------------------------ reads

/** Which of `ids` the viewer has upvoted and follows, plus the latest official reply on each. */
async function decorate(rows: PostRow[], viewerId: string | null): Promise<Post[]> {
  if (rows.length === 0) return [];
  const sb = getSupabase();
  const ids = rows.map((r) => r.id);
  const [votes, follows, officials] = await Promise.all([
    viewerId ? sb.from('vote').select('post_id').eq('user_id', viewerId).in('post_id', ids) : Promise.resolve({ data: [], error: null }),
    viewerId
      ? sb.from('follow').select('target_id').eq('user_id', viewerId).eq('target', 'post').in('target_id', ids)
      : Promise.resolve({ data: [], error: null }),
    sb
      .from('reply')
      .select(`id, post_id, body, created_at, author:profile!author_id(${PERSON})`)
      .eq('is_official', true)
      .is('hidden_at', null)
      .in('post_id', ids)
      .order('created_at', { ascending: false }),
  ]);
  if (votes.error) throw votes.error;
  if (follows.error) throw follows.error;
  if (officials.error) throw officials.error;
  const voted = new Set(((votes.data ?? []) as Array<{ post_id: string }>).map((v) => v.post_id));
  const followed = new Set(((follows.data ?? []) as Array<{ target_id: string }>).map((f) => f.target_id));
  const official = new Map<string, OfficialReply>();
  for (const r of (officials.data ?? []) as unknown as Array<OfficialReply & { post_id: string }>) {
    if (!official.has(r.post_id)) official.set(r.post_id, { id: r.id, body: r.body, created_at: r.created_at, author: r.author });
  }
  return rows.map((r) => ({ ...r, voted: voted.has(r.id), following: followed.has(r.id), official: official.get(r.id) ?? null }));
}

/**
 * What "Following" covers: posts on boards you follow (directly or through a hub),
 * posts by people you follow, and posts you follow (voting follows a post).
 * Returns null when you follow nothing, so the feed can say so without a query.
 */
async function followingFilter(viewerId: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from('follow').select('target, target_id').eq('user_id', viewerId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ target: 'board' | 'hub' | 'post' | 'user'; target_id: string }>;
  const of = (t: string) => rows.filter((r) => r.target === t).map((r) => r.target_id);
  const boards = new Set(of('board'));
  const hubs = of('hub');
  if (hubs.length) {
    const hb = await sb.from('board').select('id').in('hub_id', hubs);
    if (hb.error) throw hb.error;
    for (const b of (hb.data ?? []) as Array<{ id: string }>) boards.add(b.id);
  }
  const users = of('user');
  const posts = of('post');
  const parts = [
    boards.size ? `board_id.in.(${[...boards].join(',')})` : '',
    users.length ? `author_id.in.(${users.join(',')})` : '',
    posts.length ? `id.in.(${posts.join(',')})` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(',') : null;
}

export interface FeedParams {
  scope: FeedScope;
  sort: FeedSort;
  offset: number;
  viewerId: string | null;
}

/** One page of the home feed: live posts only (not hidden, not merged away). */
export async function fetchFeed({ scope, sort, offset, viewerId }: FeedParams): Promise<FeedPage> {
  let filter: string | null = null;
  if (scope === 'following') {
    if (!viewerId) return { items: [], next: null };
    filter = await followingFilter(viewerId);
    if (!filter) return { items: [], next: null };
  }
  let q = getSupabase().from('post').select(POST_SELECT).is('hidden_at', null).neq('status', 'merged');
  if (filter) q = q.or(filter);
  q =
    sort === 'new'
      ? q.order('created_at', { ascending: false }).order('id', { ascending: false })
      : q.order('vote_count', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });
  const { data, error } = await q.range(offset, offset + FEED_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PostRow[];
  const items = await decorate(rows, viewerId);
  return { items, next: rows.length < FEED_PAGE_SIZE ? null : offset + rows.length };
}

/** One post, or null when it does not exist or the viewer may not see it. */
export async function fetchPost(id: string, viewerId: string | null): Promise<Post | null> {
  if (!isPostId(id)) return null;
  const { data, error } = await getSupabase().from('post').select(POST_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [post] = await decorate([data as unknown as PostRow], viewerId);
  return post ?? null;
}

export interface RelatedPost {
  id: string;
  title: string;
  type: PostType;
  status: PostStatus;
  vote_count: number;
}

/** "More on {board}": its other most upvoted live posts. */
export async function fetchRelated(boardId: string, exceptId: string, limit = 3): Promise<RelatedPost[]> {
  const { data, error } = await getSupabase()
    .from('post')
    .select('id, title, type, status, vote_count')
    .eq('board_id', boardId)
    .neq('id', exceptId)
    .is('hidden_at', null)
    .neq('status', 'merged')
    .order('vote_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RelatedPost[];
}

/** Title of the post a merged post now lives in. */
export async function fetchPostTitle(id: string): Promise<{ id: string; title: string } | null> {
  const { data, error } = await getSupabase().from('post').select('id, title').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as { id: string; title: string } | null) ?? null;
}

export interface StatusEvent {
  id: string;
  from: PostStatus | null;
  to: PostStatus;
  note: string | null;
  actor_id: string | null;
  at: string;
}

export async function fetchStatusEvents(postId: string): Promise<StatusEvent[]> {
  const { data, error } = await getSupabase()
    .from('status_event')
    .select('id, from, to, note, actor_id, at')
    .eq('post_id', postId)
    .order('at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StatusEvent[];
}

export interface Reply {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string | null;
  body: string;
  is_official: boolean;
  hidden_at: string | null;
  edited_at: string | null;
  created_at: string;
  author: PersonRef | null;
}

export async function fetchReplies(postId: string): Promise<Reply[]> {
  const { data, error } = await getSupabase()
    .from('reply')
    .select(REPLY_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Reply[];
}

export interface ReplyThread {
  reply: Reply;
  children: Reply[];
}

/**
 * Group into one-level threads (the DB flattens deeper replies). Official replies
 * are pinned first, newest first; the rest follow `sort`: "top" puts the most
 * discussed threads first (replies have no votes in v2), "new" the newest.
 * Children always read oldest first.
 */
export function buildThreads(replies: Reply[], sort: FeedSort): { pinned: ReplyThread[]; threads: ReplyThread[] } {
  const byId = new Map<string, ReplyThread>();
  const roots: ReplyThread[] = [];
  for (const r of replies) {
    if (!r.parent_id) {
      const t = { reply: r, children: [] };
      byId.set(r.id, t);
      roots.push(t);
    }
  }
  for (const r of replies) {
    if (r.parent_id) byId.get(r.parent_id)?.children.push(r);
  }
  const time = (r: Reply) => new Date(r.created_at).getTime();
  for (const t of roots) t.children.sort((a, b) => time(a) - time(b));
  const pinned = roots.filter((t) => t.reply.is_official).sort((a, b) => time(b.reply) - time(a.reply));
  const threads = roots.filter((t) => !t.reply.is_official);
  threads.sort((a, b) =>
    sort === 'new' ? time(b.reply) - time(a.reply) : b.children.length - a.children.length || time(a.reply) - time(b.reply),
  );
  return { pinned, threads };
}

// ------------------------------------------------------------------ writes

export class ApiError extends Error {}

const failed = (msg: string) => new ApiError(msg);

/** Add or remove the viewer's upvote. */
export async function setVote(postId: string, viewerId: string, on: boolean): Promise<void> {
  const sb = getSupabase();
  if (on) {
    const { error } = await sb.from('vote').insert({ post_id: postId });
    // Already voted (another tab): the end state is what we wanted.
    if (error && error.code !== '23505') throw failed('We couldn’t save your upvote. Try again.');
  } else {
    const { error } = await sb.from('vote').delete().eq('post_id', postId).eq('user_id', viewerId);
    if (error) throw failed('We couldn’t remove your upvote. Try again.');
  }
}

/** Follow or unfollow a post. */
export async function setPostFollow(postId: string, viewerId: string, on: boolean): Promise<void> {
  const sb = getSupabase();
  if (on) {
    const { error } = await sb.from('follow').insert({ target: 'post', target_id: postId });
    if (error && error.code !== '23505') throw failed('We couldn’t follow this post. Try again.');
  } else {
    const { error } = await sb.from('follow').delete().eq('user_id', viewerId).eq('target', 'post').eq('target_id', postId);
    if (error) throw failed('We couldn’t unfollow this post. Try again.');
  }
}

/** Author edit. Only title, body and type are writable; the DB stamps edited_at. */
export async function updatePost(id: string, d: PostDraft): Promise<Pick<Post, 'id' | 'type' | 'title' | 'body' | 'edited_at'>> {
  const { data, error } = await getSupabase()
    .from('post')
    .update({ type: d.type, title: d.title.trim(), body: d.body.trim() })
    .eq('id', id)
    .select('id, type, title, body, edited_at')
    .maybeSingle();
  if (error || !data) throw failed('We couldn’t save your changes. Try again.');
  return data as Pick<Post, 'id' | 'type' | 'title' | 'body' | 'edited_at'>;
}

/** Author delete (hard delete; its votes, replies and follows go with it). */
export async function deletePost(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('post').delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) throw failed('We couldn’t delete this post. Try again.');
}

export async function createReply(postId: string, body: string, parentId: string | null): Promise<Reply> {
  const { data, error } = await getSupabase()
    .from('reply')
    .insert({ post_id: postId, parent_id: parentId, body: body.trim() })
    .select(REPLY_SELECT)
    .single();
  if (error || !data) {
    if (error?.code === '42501') throw failed('You can’t reply on this board.');
    throw failed('We couldn’t post your reply. Try again.');
  }
  return data as unknown as Reply;
}

export async function updateReply(id: string, body: string): Promise<Pick<Reply, 'id' | 'body' | 'edited_at'>> {
  const { data, error } = await getSupabase()
    .from('reply')
    .update({ body: body.trim() })
    .eq('id', id)
    .select('id, body, edited_at')
    .maybeSingle();
  if (error || !data) throw failed('We couldn’t save your reply. Try again.');
  return data as Pick<Reply, 'id' | 'body' | 'edited_at'>;
}

export async function deleteReply(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('reply').delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) throw failed('We couldn’t delete this reply. Try again.');
}
