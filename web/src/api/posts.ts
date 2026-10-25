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
  /** Seeded posts: who first raised it at the source ("@jeff_weinstein"), credited as "@jeff_weinstein on X" (0032). */
  source_author: string | null;
  /** The device it is about, when the poster said (0033). */
  platform: Platform | null;
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
  'id, board_id, author_id, source_url, source_author, platform, type, status, title, body, merged_into, hidden_at, edited_at, created_at, vote_count, reply_count, ' +
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

/**
 * The original poster, when the source link names them: "@handle" for an X post,
 * "u/name" for a Reddit profile link. Reddit threads and GitHub issues don't carry
 * the author in the link, so staff type those.
 */
export function sourceAuthorFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^(www|mobile)\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    if ((host === 'x.com' || host === 'twitter.com') && parts[1] === 'status' && parts[0] !== 'i' && /^\w{1,15}$/.test(parts[0] ?? '')) return `@${parts[0]}`;
    if ((host === 'reddit.com' || host.endsWith('.reddit.com')) && (parts[0] === 'user' || parts[0] === 'u') && parts[1]) return `u/${parts[1]}`;
    return null;
  } catch {
    return null;
  }
}

/** "@jeff_weinstein on X" when the original poster is known, else "from X" (0032). */
export function sourceCredit(p: Pick<Post, 'source_url' | 'source_author'>): string {
  const where = sourceLabel(p.source_url);
  return p.source_author ? `${p.source_author} on ${where}` : `from ${where}`;
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

export type Platform = 'ios' | 'android' | 'web' | 'desktop';
export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'web', label: 'Web' },
  { value: 'desktop', label: 'Desktop' },
];
export const platformLabel = (p: Platform | null | undefined) => PLATFORMS.find((x) => x.value === p)?.label ?? null;

export interface PostDraft {
  type: PostType;
  title: string;
  body: string;
  /** Optional device (0033); null or absent means not about one device. */
  platform?: Platform | null;
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
export async function updatePost(id: string, d: PostDraft): Promise<Pick<Post, 'id' | 'type' | 'title' | 'body' | 'platform' | 'edited_at'>> {
  const { data, error } = await getSupabase()
    .from('post')
    .update({ type: d.type, title: d.title.trim(), body: d.body.trim(), platform: d.platform ?? null })
    .eq('id', id)
    .select('id, type, title, body, platform, edited_at')
    .maybeSingle();
  if (error || !data) throw failed('We couldn’t save your changes. Try again.');
  return data as Pick<Post, 'id' | 'type' | 'title' | 'body' | 'platform' | 'edited_at'>;
}

/** Author delete (hard delete; its votes, replies and follows go with it). */
export async function deletePost(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('post').delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) throw failed('We couldn’t delete this post. Try again.');
}

/** `official`: a team member replying as the board (the DB refuses it from anyone else). */
export async function createReply(postId: string, body: string, parentId: string | null, official = false): Promise<Reply> {
  const { data, error } = await getSupabase()
    .from('reply')
    .insert({ post_id: postId, parent_id: parentId, body: body.trim(), ...(official ? { is_official: true } : {}) })
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

// ------------------------------------------------------------------ step 6: boards, hubs, composer

export type TypeFilter = 'all' | PostType;
export type StatusFilter = 'all' | Exclude<PostStatus, 'merged'>;
export type PlatformFilter = 'all' | Platform;

export interface PostListParams {
  /** One board, or every board of a hub. */
  boardIds: string[];
  type?: TypeFilter;
  status?: StatusFilter;
  platform?: PlatformFilter;
  sort: FeedSort;
  offset: number;
  viewerId: string | null;
  /** The hub feed leaves closed posts out (mockup). */
  excludeClosed?: boolean;
}

/** A page of a board's (or hub's) feed, with the board page's filters. */
export async function fetchPostList({ boardIds, type = 'all', status = 'all', platform = 'all', sort, offset, viewerId, excludeClosed }: PostListParams): Promise<FeedPage> {
  if (boardIds.length === 0) return { items: [], next: null };
  let q = getSupabase().from('post').select(POST_SELECT).is('hidden_at', null).neq('status', 'merged');
  q = boardIds.length === 1 ? q.eq('board_id', boardIds[0] ?? '') : q.in('board_id', boardIds);
  if (type !== 'all') q = q.eq('type', type);
  if (platform !== 'all') q = q.eq('platform', platform);
  if (status !== 'all') q = q.eq('status', status);
  else if (excludeClosed) q = q.neq('status', 'closed');
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

/** A compact post row for the roadmap, changelog, Explore lists and search. */
export interface PostSummary {
  id: string;
  board_id: string;
  title: string;
  type: PostType;
  status: PostStatus;
  vote_count: number;
  reply_count: number;
  created_at: string;
  board: BoardRef | null;
}

const SUMMARY_SELECT = `id, board_id, title, type, status, vote_count, reply_count, created_at, board:board!board_id(${BOARD})`;

export const ROADMAP_STATUSES = ['planned', 'in_progress', 'shipped'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];
export type Roadmap = Record<RoadmapStatus, PostSummary[]>;

/** Planned, In progress and Shipped columns, most upvoted first. */
export async function fetchRoadmap(boardIds: string[], perColumn = 50): Promise<Roadmap> {
  const empty: Roadmap = { planned: [], in_progress: [], shipped: [] };
  if (boardIds.length === 0) return empty;
  const { data, error } = await getSupabase()
    .from('post')
    .select(SUMMARY_SELECT)
    .in('board_id', boardIds)
    .in('status', [...ROADMAP_STATUSES])
    .is('hidden_at', null)
    .order('vote_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(perColumn * ROADMAP_STATUSES.length);
  if (error) throw error;
  for (const p of (data ?? []) as unknown as PostSummary[]) {
    const col = empty[p.status as RoadmapStatus];
    if (col && col.length < perColumn) col.push(p);
  }
  return empty;
}

export interface ChangelogEntry {
  /** Day the requests shipped, YYYY-MM-DD in the viewer's time zone. */
  day: string;
  /** Latest ship time that day (for the date label). */
  at: string;
  posts: Array<PostSummary & { shipped_at: string }>;
}

/** Local calendar day of an ISO time, so a changelog groups by the reader's day. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Shipped requests grouped by the day they shipped, newest first. v2 has no
 * release-notes table, so the changelog is what the status timeline already
 * records: each post's latest move to Shipped (status_event).
 */
export async function fetchChangelog(boardIds: string[], limit = 100): Promise<ChangelogEntry[]> {
  if (boardIds.length === 0) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('post')
    .select(SUMMARY_SELECT)
    .in('board_id', boardIds)
    .eq('status', 'shipped')
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const posts = (data ?? []) as unknown as PostSummary[];
  if (posts.length === 0) return [];
  const ev = await sb
    .from('status_event')
    .select('post_id, at')
    .eq('to', 'shipped')
    .in(
      'post_id',
      posts.map((p) => p.id),
    )
    .order('at', { ascending: false });
  if (ev.error) throw ev.error;
  const shippedAt = new Map<string, string>();
  for (const e of (ev.data ?? []) as Array<{ post_id: string; at: string }>) {
    if (!shippedAt.has(e.post_id)) shippedAt.set(e.post_id, e.at);
  }
  return groupChangelog(posts.map((p) => ({ ...p, shipped_at: shippedAt.get(p.id) ?? p.created_at })));
}

export function groupChangelog(posts: Array<PostSummary & { shipped_at: string }>): ChangelogEntry[] {
  const byDay = new Map<string, ChangelogEntry>();
  for (const p of posts) {
    const day = localDay(p.shipped_at);
    const entry = byDay.get(day) ?? { day, at: p.shipped_at, posts: [] };
    if (p.shipped_at > entry.at) entry.at = p.shipped_at;
    entry.posts.push(p);
    byDay.set(day, entry);
  }
  const out = [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  for (const e of out) e.posts.sort((a, b) => b.vote_count - a.vote_count);
  return out;
}

/** Most upvoted open and under-review requests across every board (Explore "Most wanted"). */
export async function fetchWanted(limit = 20): Promise<PostSummary[]> {
  const { data, error } = await getSupabase()
    .from('post')
    .select(SUMMARY_SELECT)
    .in('status', ['open', 'under_review'])
    .is('hidden_at', null)
    .order('vote_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PostSummary[];
}

// ------------------------------------------------------------------ similar posts (composer)

const SIM_STOP = new Set(
  'the a an and or of to in on for with is are be it not when after into from this that does dont cant can have has should would add support'.split(' '),
);

/** Meaningful words of a title, roughly stemmed, as the mockup's similarity check does. */
export function simTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SIM_STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, ''));
}

/**
 * Score a candidate against what is being typed: shared words anywhere plus
 * extra weight for shared title words. Mockup rule: at least one title word in
 * common and a score of 2.5 or more.
 */
export function similarityScore(query: string, candidate: { title: string; body?: string }): number {
  const q = new Set(simTokens(query));
  if (q.size === 0) return 0;
  const all = new Set(simTokens(`${candidate.title} ${candidate.body ?? ''}`));
  const hit = [...all].filter((w) => q.has(w)).length;
  const inTitle = simTokens(candidate.title).filter((w) => q.has(w)).length;
  if (inTitle < 1) return 0;
  const score = hit + inTitle * 1.5;
  return score >= 2.5 ? score : 0;
}

/** The to_tsquery text for "any of these words" (prefix match), or null if nothing is searchable. */
export function anyWordQuery(text: string): string | null {
  const words = [...new Set(simTokens(text))].filter((w) => /^[a-z0-9]+$/.test(w)).slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(' | ') : null;
}

/**
 * Posts on these boards that look like the title being typed, so people upvote
 * instead of posting a duplicate. Postgres full-text search finds candidates
 * (FOUNDATION §10); the mockup's score decides which are close enough.
 */
export async function fetchSimilar(title: string, boardIds: string[], viewerId: string | null, limit = 3): Promise<Post[]> {
  const tsq = anyWordQuery(title);
  if (!tsq || boardIds.length === 0 || title.trim().length < 8) return [];
  const { data, error } = await getSupabase()
    .from('post')
    .select(POST_SELECT)
    .in('board_id', boardIds)
    .is('hidden_at', null)
    .neq('status', 'merged')
    .textSearch('search', tsq, { config: 'english' })
    .order('vote_count', { ascending: false })
    .limit(25);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as PostRow[])
    .map((r) => ({ r, s: similarityScore(title, r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.r.vote_count - a.r.vote_count)
    .slice(0, limit)
    .map((x) => x.r);
  return decorate(rows, viewerId);
}

// ------------------------------------------------------------------ create a post

export interface NewPost extends PostDraft {
  boardId: string;
}

const isRlsReadBack = (e: { code?: string; message?: string } | null) =>
  Boolean(e && e.code === '42501' && /row-level security/i.test(e.message ?? ''));

/**
 * The composer's insert. Only board_id, type, title and body are writable; the
 * server sets the author, status and counters, and the author follows the post.
 *
 * It asks for the row back (insert + select). Before migration 0020 the post
 * SELECT policy could not see a row inside its own INSERT, so PostgREST refused
 * the whole statement (nothing was written). In that case, and only then, it
 * inserts without RETURNING and reads the newest matching post back.
 */
export async function createPost(d: NewPost, viewerId: string | null): Promise<Post> {
  const sb = getSupabase();
  const row = { board_id: d.boardId, type: d.type, title: d.title.trim(), body: d.body.trim(), ...(d.platform ? { platform: d.platform } : {}) };
  const first = await sb.from('post').insert(row).select(POST_SELECT).single();
  let data: unknown = first.data;
  let error = first.error;
  if (isRlsReadBack(error)) {
    const plain = await sb.from('post').insert(row);
    error = plain.error;
    if (!error) {
      const back = await sb
        .from('post')
        .select(POST_SELECT)
        .eq('board_id', row.board_id)
        .eq('title', row.title)
        .eq('author_id', viewerId ?? '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = back.data;
      error = back.error;
    }
  }
  if (error || !data) {
    if (error?.code === '42501') throw failed('You can’t post on this board.');
    if (error?.code === '23514') throw failed('Check the title and details, then try again.');
    throw failed('We couldn’t post this. Try again.');
  }
  const [post] = await decorate([data as PostRow], viewerId);
  if (!post) throw failed('We couldn’t post this. Try again.');
  // The server follows the author to their post (trigger); mirror it without a round trip.
  return { ...post, following: viewerId ? true : post.following };
}

export interface SeedPost extends NewPost {
  /** The public post this came from (https). */
  sourceUrl: string;
  /** When it was originally posted (YYYY-MM-DD); defaults to now. */
  postedOn?: string | null;
  /** Who first raised it at the source ("@handle"); optional (0032). */
  sourceAuthor?: string | null;
}

/** Is this an https link a seeded post can point back to? */
export function isSourceUrl(v: string): boolean {
  const t = v.trim();
  if (!/^https:\/\//i.test(t) || /\s/.test(t) || t.length > 2000) return false;
  try {
    return new URL(t).hostname.includes('.');
  } catch {
    return false;
  }
}

const SEED_ERRORS: Record<string, string> = {
  not_allowed: 'Only Publisense staff can add posts from a source.',
  not_found: 'That product isn’t live or waiting for review.',
  invalid_type: 'Choose a type.',
  title_length: 'Titles are 3 to 140 characters.',
  body_length: 'Details are too long.',
  invalid_source: 'Use the full https link to the original post.',
  invalid_date: 'The original date can’t be in the future.',
  duplicate: 'That source is already on this board.',
  author_length: 'The original poster’s name is too long.',
  invalid_platform: 'Choose iOS, Android, Web or Desktop.',
};

/**
 * Staff only (0028 seed_post): a post from a public source, with no author and a
 * link back to the original. It renders as the board's own card, "from GitHub".
 */
export async function seedPost(d: SeedPost, viewerId: string | null): Promise<Post> {
  const sb = getSupabase();
  const at = d.postedOn ? new Date(`${d.postedOn}T12:00:00Z`) : null;
  const { data, error } = await sb.rpc('seed_post', {
    p_board: d.boardId,
    p_type: d.type,
    p_title: d.title.trim(),
    p_body: d.body.trim(),
    p_source_url: d.sourceUrl.trim(),
    p_posted_at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
    p_source_author: d.sourceAuthor?.trim() || null,
    p_platform: d.platform ?? null,
  });
  if (error) throw failed('We couldn’t post this. Try again.');
  const res = (data ?? { ok: false }) as { ok: boolean; id?: string; error?: string };
  if (!res.ok || !res.id) throw failed(SEED_ERRORS[res.error ?? ''] ?? 'We couldn’t post this. Try again.');
  const post = await fetchPost(res.id, viewerId);
  if (!post) throw failed('Posted, but we couldn’t load it. Refresh to see it.');
  return post;
}

/**
 * Staff only (0031 edit_seeded_post): correct a seeded post, including its source
 * link and original date. Posts with an author are never touched.
 */
export async function editSeededPost(id: string, d: SeededDraft, viewerId: string | null): Promise<Post> {
  const at = d.postedOn ? new Date(`${d.postedOn}T12:00:00Z`) : null;
  const { data, error } = await getSupabase().rpc('edit_seeded_post', {
    p_post: id,
    p_type: d.type,
    p_title: d.title.trim(),
    p_body: d.body.trim(),
    p_source_url: d.sourceUrl.trim(),
    p_posted_at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
    p_source_author: d.sourceAuthor?.trim() || null,
    p_platform: d.platform ?? null,
  });
  if (error) throw failed('We couldn’t save your changes. Try again.');
  const res = (data ?? { ok: false }) as { ok: boolean; error?: string };
  if (!res.ok) throw failed(SEED_ERRORS[res.error ?? ''] ?? 'We couldn’t save your changes. Try again.');
  const post = await fetchPost(id, viewerId);
  if (!post) throw failed('Saved, but we couldn’t load it. Refresh to see it.');
  return post;
}

export interface SeededDraft extends PostDraft {
  sourceUrl: string;
  /** YYYY-MM-DD, or null to keep the date it has. */
  postedOn?: string | null;
  /** Who first raised it; empty clears it (0032). */
  sourceAuthor?: string | null;
}

/** Staff only (0031 delete_seeded_post): remove a seeded post. */
export async function deleteSeededPost(id: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('delete_seeded_post', { p_post: id });
  const res = (data ?? { ok: false }) as { ok: boolean };
  if (error || !res.ok) throw failed('We couldn’t delete this post. Try again.');
}

// ------------------------------------------------------------------ search

/**
 * Posts matching a search: Postgres full-text search over title and body
 * (`websearch` syntax: words, "quoted phrases", -exclusions), most upvoted first.
 */
export async function searchPosts(q: string, viewerId: string | null, limit = 30): Promise<Post[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const { data, error } = await getSupabase()
    .from('post')
    .select(POST_SELECT)
    .is('hidden_at', null)
    .neq('status', 'merged')
    .textSearch('search', term, { type: 'websearch', config: 'english' })
    .order('vote_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return decorate((data ?? []) as unknown as PostRow[], viewerId);
}

// ------------------------------------------------------------------ step 8: people

/** A person's live posts, newest first (their profile's Posts tab). */
export async function fetchUserPosts(authorId: string, offset: number, viewerId: string | null): Promise<FeedPage> {
  const { data, error } = await getSupabase()
    .from('post')
    .select(POST_SELECT)
    .eq('author_id', authorId)
    .is('hidden_at', null)
    .neq('status', 'merged')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + FEED_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PostRow[];
  const items = await decorate(rows, viewerId);
  return { items, next: rows.length < FEED_PAGE_SIZE ? null : offset + rows.length };
}

/** Posts the viewer upvoted, most recent vote first (only they can see this). */
export async function fetchUpvotedPosts(viewerId: string, limit = 50): Promise<Post[]> {
  const sb = getSupabase();
  const votes = await sb.from('vote').select('post_id, created_at').eq('user_id', viewerId).order('created_at', { ascending: false }).limit(limit);
  if (votes.error) throw votes.error;
  const ids = ((votes.data ?? []) as Array<{ post_id: string }>).map((v) => v.post_id);
  if (ids.length === 0) return [];
  const { data, error } = await sb.from('post').select(POST_SELECT).in('id', ids).is('hidden_at', null).neq('status', 'merged');
  if (error) throw error;
  const order = new Map(ids.map((id, i) => [id, i]));
  const rows = ((data ?? []) as unknown as PostRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return decorate(rows, viewerId);
}
