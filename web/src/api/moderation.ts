import { getSupabase } from './supabase';
import { ApiError, type PersonRef, type PostStatus, type PostType } from './posts';
import type { CommandCentreData, CommandCentreWindow } from './analytics';
import type { Role, Scope } from './teams';

/*
 * Moderation (FOUNDATION §6–8, step 8): merge and unmerge, hide, report, block,
 * release a board or hub, and the platform-admin queues and team.
 *
 * Writes go through the SECURITY DEFINER RPCs in 0017/0022 that return
 * { ok, error?, … } (merge, unmerge, decide, appoint, release) or through the
 * narrow table grants 0017 already gives (report insert, block insert/delete).
 * RLS decides every read: reports and disputes are readable by their filer and by
 * platform admins only; blocks by the scope's team.
 */

// ------------------------------------------------------------------ RPC plumbing

interface RpcResult {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

const MESSAGES: Record<string, string> = {
  sign_in: 'Sign in first.',
  not_allowed: 'You don’t have permission to do that.',
  not_found: 'We couldn’t find that.',
  same_post: 'Pick a different post to merge into.',
  merged: 'This post was already merged.',
  target_unavailable: 'That post is closed or hidden. Pick another one.',
  not_merged: 'This post isn’t merged any more.',
  too_late: 'Merges can only be undone for 10 minutes.',
  target_merged: 'The post it went into was merged too, so this can’t be undone.',
  decided: 'Someone already decided this.',
  not_verified: 'They no longer have a verified address on the domain.',
  already_admin: 'They’re already an admin.',
  not_admin: 'They aren’t an admin.',
  last_admin: 'Publisense always keeps at least one admin. Appoint another admin first.',
  owners_only: 'Only an owner can do that.',
  invalid_action: 'Something went wrong. Try again.',
};

export function moderationMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || 'Something went wrong. Try again.';
}

export class ModerationError extends ApiError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function rpc<T extends RpcResult = RpcResult>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new ModerationError('network', 'Something went wrong. Try again.');
  const res = (data ?? { ok: false }) as T;
  if (!res.ok) throw new ModerationError(res.error ?? 'unknown', moderationMessage(res.error));
  return res;
}

// ------------------------------------------------------------------ platform admin

/** Load the /admin Command Centre metrics (0053, platform_admin only). */
export async function fetchCommandCentre(days: CommandCentreWindow = 30): Promise<CommandCentreData> {
  const res = await rpc<RpcResult & CommandCentreData>('admin_command_centre', { p_days: days });
  return res;
}

/** Is the viewer Publisense staff? (platform_admin: you can read your own row.) */
export async function fetchIsPlatformAdmin(viewerId: string): Promise<boolean> {
  const { data, error } = await getSupabase().from('platform_admin').select('user_id').eq('user_id', viewerId).maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// ------------------------------------------------------------------ merge

export const UNMERGE_WINDOW_MS = 10 * 60_000;

/** Merge a duplicate into another post. Returns how many votes moved. */
export async function mergePost(sourceId: string, targetId: string): Promise<{ moved: number }> {
  const res = await rpc<RpcResult & { moved: number }>('merge_post', { p_source: sourceId, p_target: targetId });
  return { moved: Number(res.moved ?? 0) };
}

/** Undo the latest merge of a post (within 10 minutes). Returns the status it went back to. */
export async function unmergePost(sourceId: string): Promise<{ status: PostStatus }> {
  const res = await rpc<RpcResult & { status: PostStatus }>('unmerge_post', { p_source: sourceId });
  return { status: res.status };
}

export interface MergeCandidate {
  id: string;
  board_id: string;
  title: string;
  status: PostStatus;
  vote_count: number;
  reply_count: number;
}

/** Live posts on these boards to merge into: matching `q` in the title, most upvoted first. */
export async function fetchMergeCandidates(boardIds: string[], q: string, exceptId: string, limit = 8): Promise<MergeCandidate[]> {
  if (boardIds.length === 0) return [];
  let query = getSupabase()
    .from('post')
    .select('id, board_id, title, status, vote_count, reply_count')
    .in('board_id', boardIds)
    .neq('id', exceptId)
    .is('hidden_at', null)
    .neq('status', 'merged');
  const term = q.replace(/[%_\\,()]/g, ' ').trim();
  if (term) query = query.ilike('title', `%${term}%`);
  const { data, error } = await query.order('vote_count', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as MergeCandidate[];
}

/** Still inside the unmerge window? `mergedAt` is the status_event time of the merge. */
export function canUnmerge(mergedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!mergedAt) return false;
  return now - new Date(mergedAt).getTime() < UNMERGE_WINDOW_MS;
}

// ------------------------------------------------------------------ hide

/** Team members and platform admins hide or unhide a post (0017 set_post_hidden). */
export async function setPostHidden(postId: string, hidden: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_post_hidden', { p_post: postId, p_hidden: hidden });
  if (error) {
    if (error.code === '42501') throw new ApiError('Only the board’s team can do that.');
    throw new ApiError(hidden ? 'We couldn’t hide this post. Try again.' : 'We couldn’t unhide this post. Try again.');
  }
}

export async function setReplyHidden(replyId: string, hidden: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_reply_hidden', { p_reply: replyId, p_hidden: hidden });
  if (error) {
    if (error.code === '42501') throw new ApiError('Only the board’s team can do that.');
    throw new ApiError(hidden ? 'We couldn’t hide this reply. Try again.' : 'We couldn’t unhide this reply. Try again.');
  }
}

// ------------------------------------------------------------------ report

export type ReportTarget = 'post' | 'reply' | 'user';

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'abuse', label: 'Harassment or hate' },
  { value: 'off_topic', label: 'Off-topic or not feedback' },
  { value: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];
export const REPORT_DETAILS_MAX = 900;

/** The text stored in report.reason (3–1000 characters): the choice, then any details. */
export function reportText(reason: ReportReason, details: string): string {
  const label = REPORT_REASONS.find((r) => r.value === reason)?.label ?? 'Something else';
  const more = details.trim().slice(0, REPORT_DETAILS_MAX);
  return more ? `${label}: ${more}` : label;
}

export function reportError(reason: ReportReason | null, details: string): string | null {
  if (!reason) return 'Pick a reason.';
  if (reason === 'other' && details.trim().length < 3) return 'Tell us what’s wrong.';
  if (details.trim().length > REPORT_DETAILS_MAX) return `Keep it to ${REPORT_DETAILS_MAX} characters.`;
  return null;
}

/** File a report. Reporting the same thing twice is not an error: the report already stands. */
export async function reportContent(target: ReportTarget, targetId: string, reason: string): Promise<'filed' | 'already'> {
  const { error } = await getSupabase().from('report').insert({ target, target_id: targetId, reason });
  if (!error) return 'filed';
  if (error.code === '23505') return 'already';
  throw new ApiError('We couldn’t send your report. Try again.');
}

// ------------------------------------------------------------------ block (FOUNDATION §6: a team blocks a user from its boards)

export interface AdminScope {
  scope: Scope;
  scope_id: string;
  role: Role;
  name: string;
  slug: string;
}

/** Boards and hubs the viewer can block on: where they are an owner or admin. */
export async function fetchAdminScopes(viewerId: string): Promise<AdminScope[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from('membership').select('scope, scope_id, role').eq('user_id', viewerId).in('role', ['owner', 'admin']);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ scope: Scope; scope_id: string; role: Role }>;
  return attachScopeNames(rows);
}

async function attachScopeNames<T extends { scope: Scope; scope_id: string }>(rows: T[]): Promise<Array<T & { name: string; slug: string }>> {
  if (rows.length === 0) return [];
  const sb = getSupabase();
  const boardIds = rows.filter((r) => r.scope === 'board').map((r) => r.scope_id);
  const hubIds = rows.filter((r) => r.scope === 'hub').map((r) => r.scope_id);
  const [boards, hubs] = await Promise.all([
    boardIds.length ? sb.from('board').select('id, name, slug').in('id', boardIds) : Promise.resolve({ data: [], error: null }),
    hubIds.length ? sb.from('hub').select('id, name, slug').in('id', hubIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (boards.error) throw boards.error;
  if (hubs.error) throw hubs.error;
  const names = new Map<string, { name: string; slug: string }>();
  for (const b of (boards.data ?? []) as Array<{ id: string; name: string; slug: string }>) names.set(`board:${b.id}`, b);
  for (const h of (hubs.data ?? []) as Array<{ id: string; name: string; slug: string }>) names.set(`hub:${h.id}`, h);
  return rows
    .map((r) => ({ ...r, name: names.get(`${r.scope}:${r.scope_id}`)?.name ?? '', slug: names.get(`${r.scope}:${r.scope_id}`)?.slug ?? '' }))
    .filter((r) => r.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Which of these scopes block this user (block rows are readable by the scope's team). */
export async function fetchBlocksFor(userId: string, scopeIds: string[]): Promise<Set<string>> {
  if (scopeIds.length === 0) return new Set();
  const { data, error } = await getSupabase().from('block').select('scope, scope_id').eq('user_id', userId).in('scope_id', scopeIds);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ scope: Scope; scope_id: string }>).map((b) => `${b.scope}:${b.scope_id}`));
}

export interface BlockedUser {
  user_id: string;
  created_at: string;
  profile: PersonRef | null;
}

/** People this scope's team has blocked. */
export async function fetchBlocked(scope: Scope, scopeId: string): Promise<BlockedUser[]> {
  const { data, error } = await getSupabase()
    .from('block')
    .select('user_id, created_at, profile:profile!user_id(id, handle, name, avatar_path)')
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BlockedUser[];
}

export async function setBlocked(scope: Scope, scopeId: string, userId: string, on: boolean): Promise<void> {
  const sb = getSupabase();
  if (on) {
    const { error } = await sb.from('block').insert({ scope, scope_id: scopeId, user_id: userId });
    if (error && error.code !== '23505') throw new ApiError(error.code === '42501' ? 'Only owners and admins can block people.' : 'We couldn’t block them. Try again.');
  } else {
    const { data, error } = await sb.from('block').delete().eq('scope', scope).eq('scope_id', scopeId).eq('user_id', userId).select('user_id');
    if (error || !data || data.length === 0) throw new ApiError('We couldn’t unblock them. Try again.');
  }
}

// ------------------------------------------------------------------ release a board or hub

export async function releaseScope(scope: Scope, scopeId: string): Promise<void> {
  await rpc('release_scope', { p_scope: scope, p_scope_id: scopeId });
}

// ------------------------------------------------------------------ admin: reports queue

export interface ReportRow {
  id: string;
  target: ReportTarget;
  target_id: string;
  reason: string;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  decided_at: string | null;
  reporter: PersonRef | null;
}

export interface ReportedPost {
  id: string;
  title: string;
  body: string;
  type: PostType;
  hidden_at: string | null;
  author: PersonRef | null;
  board: { id: string; slug: string; name: string; color: string } | null;
}

export interface ReportedReply {
  id: string;
  post_id: string;
  body: string;
  hidden_at: string | null;
  author: PersonRef | null;
  post: { id: string; title: string } | null;
}

/** One queue row: every report on the same thing, newest first. */
export interface ReportGroup {
  key: string;
  target: ReportTarget;
  target_id: string;
  reports: ReportRow[];
  latest: string;
  post?: ReportedPost | null;
  reply?: ReportedReply | null;
  user?: PersonRef | null;
}

const PERSON = 'id, handle, name, avatar_path';

export function groupReports(rows: ReportRow[]): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const r of rows) {
    const key = `${r.target}:${r.target_id}`;
    const g = map.get(key) ?? { key, target: r.target, target_id: r.target_id, reports: [], latest: r.created_at };
    g.reports.push(r);
    if (r.created_at > g.latest) g.latest = r.created_at;
    map.set(key, g);
  }
  const out = [...map.values()];
  for (const g of out) g.reports.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  // Most reported first, then the most recent.
  return out.sort((a, b) => b.reports.length - a.reports.length || (a.latest < b.latest ? 1 : -1));
}

/** The reports queue (RLS: platform admins only), grouped by target with what was reported. */
export async function fetchReportQueue(status: 'open' | 'closed'): Promise<ReportGroup[]> {
  const sb = getSupabase();
  let q = sb.from('report').select(`id, target, target_id, reason, status, created_at, decided_at, reporter:profile!reporter(${PERSON})`);
  q = status === 'open' ? q.eq('status', 'open') : q.neq('status', 'open');
  const { data, error } = await q.order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  const groups = groupReports((data ?? []) as unknown as ReportRow[]);
  const ids = (t: ReportTarget) => groups.filter((g) => g.target === t).map((g) => g.target_id);
  const [posts, replies, users] = await Promise.all([
    ids('post').length
      ? sb.from('post').select(`id, title, body, type, hidden_at, author:profile!author_id(${PERSON}), board:board!board_id(id, slug, name, color)`).in('id', ids('post'))
      : Promise.resolve({ data: [], error: null }),
    ids('reply').length
      ? sb.from('reply').select(`id, post_id, body, hidden_at, author:profile!author_id(${PERSON}), post:post!post_id(id, title)`).in('id', ids('reply'))
      : Promise.resolve({ data: [], error: null }),
    ids('user').length ? sb.from('profile').select(PERSON).in('id', ids('user')) : Promise.resolve({ data: [], error: null }),
  ]);
  if (posts.error) throw posts.error;
  if (replies.error) throw replies.error;
  if (users.error) throw users.error;
  const byId = <T extends { id: string }>(rows: unknown) => new Map(((rows ?? []) as T[]).map((r) => [r.id, r]));
  const p = byId<ReportedPost>(posts.data);
  const r = byId<ReportedReply>(replies.data);
  const u = byId<PersonRef>(users.data);
  return groups.map((g) =>
    g.target === 'post' ? { ...g, post: p.get(g.target_id) ?? null } : g.target === 'reply' ? { ...g, reply: r.get(g.target_id) ?? null } : { ...g, user: u.get(g.target_id) ?? null },
  );
}

export type ReportAction = 'resolve' | 'hide' | 'dismiss';

export async function decideReports(target: ReportTarget, targetId: string, action: ReportAction): Promise<number> {
  const res = await rpc<RpcResult & { decided: number }>('decide_reports', { p_target: target, p_target_id: targetId, p_action: action });
  return Number(res.decided ?? 0);
}

// ------------------------------------------------------------------ admin: ownership disputes

export interface DisputeRow {
  id: string;
  user_id: string;
  scope: Scope;
  scope_id: string;
  reason: string;
  work_email: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  created_at: string;
  decided_at: string | null;
  filer: PersonRef | null;
  name: string;
  slug: string;
  owners: PersonRef[];
}

export async function fetchDisputes(status: 'pending' | 'closed'): Promise<DisputeRow[]> {
  const sb = getSupabase();
  let q = sb.from('ownership_dispute').select(`id, user_id, scope, scope_id, reason, work_email, status, created_at, decided_at, filer:profile!user_id(${PERSON})`);
  q = status === 'pending' ? q.eq('status', 'pending') : q.neq('status', 'pending');
  const { data, error } = await q.order('created_at', { ascending: status === 'pending' }).limit(200);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Omit<DisputeRow, 'name' | 'slug' | 'owners'>>;
  if (rows.length === 0) return [];
  const named = await attachScopeNames(rows);
  const scopeIds = [...new Set(rows.map((r) => r.scope_id))];
  const owners = await sb.from('membership').select(`scope, scope_id, profile:profile!user_id(${PERSON})`).eq('role', 'owner').in('scope_id', scopeIds);
  if (owners.error) throw owners.error;
  const byScope = new Map<string, PersonRef[]>();
  for (const o of (owners.data ?? []) as unknown as Array<{ scope: Scope; scope_id: string; profile: PersonRef | null }>) {
    if (!o.profile) continue;
    const k = `${o.scope}:${o.scope_id}`;
    byScope.set(k, [...(byScope.get(k) ?? []), o.profile]);
  }
  return named.map((r) => ({ ...r, owners: byScope.get(`${r.scope}:${r.scope_id}`) ?? [] }));
}

export async function decideDispute(id: string, approve: boolean): Promise<void> {
  await rpc('decide_dispute', { p_dispute: id, p_approve: approve });
}

// ------------------------------------------------------------------ admin: team

export interface PlatformAdmin {
  user_id: string;
  granted_at: string;
  profile: PersonRef | null;
}

export async function fetchPlatformAdmins(): Promise<PlatformAdmin[]> {
  const { data, error } = await getSupabase()
    .from('platform_admin')
    .select(`user_id, granted_at, profile:profile!user_id(${PERSON})`)
    .order('granted_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PlatformAdmin[];
}

export interface AdminEvent {
  id: string;
  action: 'grant' | 'revoke';
  at: string;
  user: PersonRef | null;
  actor: PersonRef | null;
}

export async function fetchAdminEvents(limit = 50): Promise<AdminEvent[]> {
  const { data, error } = await getSupabase()
    .from('platform_admin_event')
    .select(`id, action, at, user:profile!user_id(${PERSON}), actor:profile!actor_id(${PERSON})`)
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AdminEvent[];
}

export interface FoundUser extends PersonRef {
  is_admin: boolean;
}

/** Look someone up by @handle or email (admins only; others learn nothing). */
export async function findUser(who: string): Promise<FoundUser> {
  const res = await rpc<RpcResult & { user: FoundUser }>('admin_find_user', { p_who: who.trim() });
  return res.user;
}

export async function grantPlatformAdmin(userId: string): Promise<void> {
  await rpc('grant_platform_admin', { p_user: userId });
}

export async function revokePlatformAdmin(userId: string): Promise<void> {
  await rpc('revoke_platform_admin', { p_user: userId });
}
