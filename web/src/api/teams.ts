import { getSupabase, publicStorageUrl } from './supabase';
import { ApiError, type PersonRef, type PostStatus } from './posts';
import { cropAvatar, validateAvatarFile, AVATAR_MAX_BYTES, AVATAR_TYPES, type AvatarType } from './profile';

/*
 * Claiming, teams, join requests and ownership disputes (FOUNDATION §6–8, step 7).
 *
 * Every write goes through a SECURITY DEFINER RPC in 0021_v2_claims_and_teams.sql
 * that returns { ok, error?, … }; membership has no client write grant at all.
 * Reads are plain selects that RLS already scopes: your own verified domains and
 * requests, and, for team members, the scope's memberships and join requests.
 */

export type Scope = 'board' | 'hub';
export type Role = 'owner' | 'admin' | 'member';

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

// ------------------------------------------------------------------ domains (pure)

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const EMAIL_RE = /^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** "figma.com/figjam" -> "figma.com"; "www.arc.net" -> "arc.net". Mirrors v2_site_domain(). */
export function siteDomain(site: string | null | undefined): string | null {
  const host = (site ?? '').trim().toLowerCase().split('/')[0]?.replace(/^www\./, '') ?? '';
  return DOMAIN_RE.test(host) ? host : null;
}

/** Does a verified domain cover the target (itself or a subdomain)? Mirrors v2_domain_covers(). */
export function domainCovers(verified: string, target: string): boolean {
  return Boolean(verified && target) && (target === verified || target.endsWith(`.${verified}`));
}

export const emailDomain = (email: string) => email.trim().toLowerCase().split('@')[1] ?? '';

export const isWorkEmail = (v: string) => EMAIL_RE.test(v.trim().toLowerCase());

/** The mockup's client-side check before a code is sent: valid, and on the product's domain. */
export function workEmailError(email: string, domain: string): string | null {
  const v = email.trim().toLowerCase();
  if (!isWorkEmail(v)) return 'Enter a valid email address.';
  if (!domainCovers(domain, emailDomain(v))) return `That isn’t an @${domain} address. Use your work email, or verify with DNS.`;
  return null;
}

export const covered = (verified: string[] | undefined, target: string | null) =>
  Boolean(target && verified?.some((d) => domainCovers(d, target)));

// ------------------------------------------------------------------ RPC plumbing

interface RpcResult {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

/** What each refusal means to a person (mockup wording where it has one). */
export function teamErrorMessage(code: string | undefined, ctx: { domain?: string | null; name?: string } = {}): string {
  const at = ctx.domain ? `@${ctx.domain}` : 'work';
  switch (code) {
    case 'sign_in':
      return 'Sign in first.';
    case 'invalid_email':
      return 'Enter a valid email address.';
    case 'invalid_domain':
      return 'That doesn’t look like a domain.';
    case 'shared_domain':
      return 'That’s a shared email or hosting domain, so it can’t prove a company. Use your work email, or verify with DNS.';
    case 'wrong_domain':
      return `Use an ${at} address.`;
    case 'rate_limited':
      return 'Too many codes in the last hour. Try again later.';
    case 'email_unavailable':
      return 'We couldn’t send the code just now. Try again in a minute, or verify with DNS.';
    case 'expired':
      return 'That code has expired. Send a new one.';
    case 'wrong_code':
      return 'That code isn’t right. Check the email and try again.';
    case 'too_many_attempts':
      return 'Too many wrong tries. Send a new code.';
    case 'no_challenge':
      return 'Start again: add the TXT record first.';
    case 'not_found':
      return ctx.domain === undefined ? 'We couldn’t find that.' : 'No account uses that handle or email yet. Ask them to sign up, then add them.';
    case 'dns_unavailable':
    case 'dns_failed':
      return 'We couldn’t check DNS just now. Try again in a minute.';
    case 'claimed':
      return `${ctx.name ?? 'This board'} is already claimed.`;
    case 'hub_claimed':
      return `${ctx.name ?? 'This board'} is managed by its hub’s team. Ask them to add you.`;
    case 'no_domain':
      return 'This board has no website to verify yet.';
    case 'not_verified':
      return `Verify ${ctx.domain ?? 'the domain'} first.`;
    case 'not_claimed':
      return 'No team has claimed this yet. You can claim it instead.';
    case 'already_member':
      return 'They’re already on the team.';
    case 'not_allowed':
      return 'Only admins can do that.';
    case 'owners_only':
      return 'Only owners can change an owner, or make someone an owner.';
    case 'last_owner':
      return 'Add another owner first. A claimed board always keeps an owner.';
    case 'decided':
      return 'Someone already answered this request.';
    case 'reason_length':
      return 'Tell us a little more (at least 10 characters).';
    default:
      return 'Something went wrong. Try again.';
  }
}

export class TeamError extends ApiError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function rpc<T extends RpcResult = RpcResult>(fn: string, args: Record<string, unknown>, ctx?: Parameters<typeof teamErrorMessage>[1]): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new TeamError('network', 'Something went wrong. Try again.');
  const res = (data ?? { ok: false }) as T;
  if (!res.ok) throw new TeamError(res.error ?? 'unknown', teamErrorMessage(res.error, ctx));
  return res;
}

// ------------------------------------------------------------------ proving a domain

/** Domains the viewer has proved (verified_domain rows are readable by their owner). */
export async function fetchVerifiedDomains(viewerId: string): Promise<string[]> {
  const { data, error } = await getSupabase().from('verified_domain').select('domain').eq('verified_by', viewerId);
  if (error) throw error;
  return ((data ?? []) as Array<{ domain: string }>).map((d) => d.domain);
}

/** Domains with a DNS check in progress ("Claim pending · check DNS"). */
export async function fetchPendingDns(): Promise<string[]> {
  const { data, error } = await getSupabase().rpc('my_pending_dns');
  if (error) return [];
  return (data ?? []) as string[];
}

export async function startEmailCode(email: string, domain: string): Promise<void> {
  await rpc('start_domain_email', { p_email: email.trim().toLowerCase(), p_domain: domain }, { domain });
}

export async function verifyEmailCode(email: string, code: string, domain?: string): Promise<string> {
  const res = await rpc<RpcResult & { domain: string }>('verify_domain_email', { p_email: email.trim().toLowerCase(), p_code: code }, { domain: domain ?? null });
  return res.domain;
}

export async function startDnsCheck(domain: string): Promise<string> {
  const res = await rpc<RpcResult & { token: string }>('start_domain_dns', { p_domain: domain }, { domain });
  return res.token;
}

export type DnsCheck = 'verified' | 'pending';

/** One look at DNS. pg_net is asynchronous: 'pending' means ask again shortly. */
export async function checkDnsOnce(domain: string): Promise<DnsCheck> {
  const res = await rpc<RpcResult & { verified?: boolean }>('check_domain_dns', { p_domain: domain }, { domain });
  return res.verified ? 'verified' : 'pending';
}

/** Poll check_domain_dns until it answers (about 10 s). Throws TeamError('not_found') when the record isn't there. */
export async function checkDns(domain: string, { tries = 8, delayMs = 1300, sleep = defaultSleep } = {}): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if ((await checkDnsOnce(domain)) === 'verified') return;
    await sleep(delayMs);
  }
  throw new TeamError('dns_slow', 'DNS hasn’t answered yet. Changes can take a few minutes; check again soon.');
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const DNS_NOT_FOUND = 'We couldn’t find the record yet. DNS changes can take a few minutes to show up.';

// ------------------------------------------------------------------ claiming

/** Claim a board whose domain the viewer proved. Returns the hub slug to offer, if any. */
export async function claimBoard(boardId: string, ctx: { name: string; domain: string | null }): Promise<{ hub: string | null }> {
  const res = await rpc<RpcResult & { hub: string | null }>('claim_board', { p_board: boardId }, ctx);
  return { hub: res.hub ?? null };
}

export async function claimHub(hubId: string, ctx: { name: string; domain: string | null }): Promise<void> {
  await rpc('claim_hub', { p_hub: hubId }, ctx);
}

// ------------------------------------------------------------------ "Work here?" and "Report the wrong owner"

export interface MyRequests {
  join: { id: string; created_at: string } | null;
  dispute: { id: string; created_at: string } | null;
}

/** The viewer's own pending join request and dispute on a scope. */
export async function fetchMyRequests(scope: Scope, scopeId: string, viewerId: string): Promise<MyRequests> {
  const sb = getSupabase();
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [join, dispute] = await Promise.all([
    sb.from('join_request').select('id, created_at').eq('user_id', viewerId).eq('scope', scope).eq('scope_id', scopeId).eq('status', 'pending').gte('created_at', since).maybeSingle(),
    sb.from('ownership_dispute').select('id, created_at').eq('user_id', viewerId).eq('scope', scope).eq('scope_id', scopeId).eq('status', 'pending').maybeSingle(),
  ]);
  if (join.error) throw join.error;
  if (dispute.error) throw dispute.error;
  return { join: (join.data as MyRequests['join']) ?? null, dispute: (dispute.data as MyRequests['dispute']) ?? null };
}

export async function requestJoin(scope: Scope, scopeId: string, workEmail: string, domain: string | null): Promise<void> {
  await rpc('request_join', { p_scope: scope, p_scope_id: scopeId, p_work_email: workEmail.trim().toLowerCase() }, { domain });
}

export const REASON_MIN = 10;
export const REASON_MAX = 2000;

export async function openDispute(scope: Scope, scopeId: string, reason: string, workEmail: string, domain: string | null): Promise<void> {
  await rpc('open_dispute', { p_scope: scope, p_scope_id: scopeId, p_reason: reason.trim(), p_work_email: workEmail.trim().toLowerCase() }, { domain });
}

// ------------------------------------------------------------------ team

export interface Member {
  user_id: string;
  scope: Scope;
  scope_id: string;
  role: Role;
  created_at: string;
  profile: PersonRef | null;
}

const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

export function sortMembers(list: Member[], viewerId: string | null): Member[] {
  return [...list].sort(
    (a, b) =>
      Number(b.user_id === viewerId) - Number(a.user_id === viewerId) ||
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      (a.profile?.handle ?? '').localeCompare(b.profile?.handle ?? ''),
  );
}

/** Members of one exact scope (RLS: only its team reads them). */
export async function fetchTeam(scope: Scope, scopeId: string): Promise<Member[]> {
  const { data, error } = await getSupabase()
    .from('membership')
    .select('user_id, scope, scope_id, role, created_at, profile:profile!user_id(id, handle, name, avatar_path)')
    .eq('scope', scope)
    .eq('scope_id', scopeId);
  if (error) throw error;
  return (data ?? []) as unknown as Member[];
}

/** The viewer's effective role (a hub role counts on its boards), or null. */
export async function fetchScopeRole(scope: Scope, scopeId: string): Promise<Role | null> {
  const { data, error } = await getSupabase().rpc('v2_scope_role', { p_scope: scope, p_id: scopeId });
  if (error) return null;
  return (data as Role | null) ?? null;
}

export async function addMember(scope: Scope, scopeId: string, who: string, domain: string | null, role: Role = 'member'): Promise<{ handle: string }> {
  const res = await rpc<RpcResult & { handle: string }>('add_team_member', { p_scope: scope, p_scope_id: scopeId, p_who: who.trim(), p_role: role }, { domain });
  return { handle: res.handle };
}

export async function setMemberRole(scope: Scope, scopeId: string, userId: string, role: Role): Promise<void> {
  await rpc('set_member_role', { p_scope: scope, p_scope_id: scopeId, p_user: userId, p_role: role });
}

export async function removeMember(scope: Scope, scopeId: string, userId: string): Promise<void> {
  await rpc('remove_team_member', { p_scope: scope, p_scope_id: scopeId, p_user: userId });
}

// ------------------------------------------------------------------ join requests (admins)

export interface JoinRequest {
  id: string;
  user_id: string;
  scope: Scope;
  scope_id: string;
  work_email: string;
  created_at: string;
  profile: PersonRef | null;
}

/** Pending requests on these scopes from the last 14 days (RLS: the scope's admins). */
export async function fetchJoinRequests(scopes: Array<{ scope: Scope; id: string }>): Promise<JoinRequest[]> {
  if (scopes.length === 0) return [];
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const ids = scopes.map((s) => s.id);
  const { data, error } = await getSupabase()
    .from('join_request')
    .select('id, user_id, scope, scope_id, work_email, created_at, profile:profile!user_id(id, handle, name, avatar_path)')
    .in('scope_id', ids)
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const wanted = new Set(scopes.map((s) => `${s.scope}:${s.id}`));
  return ((data ?? []) as unknown as JoinRequest[]).filter((r) => wanted.has(`${r.scope}:${r.scope_id}`));
}

export async function decideJoinRequest(id: string, approve: boolean): Promise<void> {
  await rpc('decide_join_request', { p_request: id, p_approve: approve });
}

// ------------------------------------------------------------------ inbox

/**
 * Change a post's status. One RPC, one transaction (0044): it writes the status_event
 * with the optional note (shown on the post's status timeline) and sends followers and
 * voters ONE notification that carries the note. The note is never a reply.
 */
export async function setPostStatus(postId: string, to: PostStatus, note?: string): Promise<void> {
  const trimmed = note?.trim();
  const { error } = await getSupabase().rpc('set_post_status', { p_post: postId, p_to: to, ...(trimmed ? { p_note: trimmed } : {}) });
  if (error) {
    if (error.code === '42501') throw new ApiError('Only the team can change status.');
    if (error.hint === 'note_without_change') throw new ApiError('Pick a new status to add a timeline note.');
    throw new ApiError('We couldn’t update the status. Try again.');
  }
}

export interface ManageStats {
  waiting: number;
  newThisWeek: number;
  upvotes: number;
  shipped: number;
}

/** The Manage tiles, counted from the boards' live posts (at most 2000 rows; plenty today). */
export async function fetchManageStats(boardIds: string[], now: Date = new Date()): Promise<ManageStats> {
  if (boardIds.length === 0) return { waiting: 0, newThisWeek: 0, upvotes: 0, shipped: 0 };
  const { data, error } = await getSupabase()
    .from('post')
    .select('status, vote_count, created_at')
    .in('board_id', boardIds)
    .is('hidden_at', null)
    .neq('status', 'merged')
    .limit(2000);
  if (error) throw error;
  return countStats((data ?? []) as Array<{ status: PostStatus; vote_count: number; created_at: string }>, now);
}

export function countStats(rows: Array<{ status: PostStatus; vote_count: number; created_at: string }>, now: Date = new Date()): ManageStats {
  const weekAgo = now.getTime() - 7 * 86400_000;
  return {
    waiting: rows.filter((r) => r.status === 'open').length,
    newThisWeek: rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length,
    upvotes: rows.reduce((n, r) => n + r.vote_count, 0),
    shipped: rows.filter((r) => r.status === 'shipped').length,
  };
}

// ------------------------------------------------------------------ settings

export const TAGLINE_MAX = 120;
export const HUB_NAME_MAX = 60;
export const HUB_DESC_MAX = 280;

export async function updateBoardTagline(boardId: string, tagline: string): Promise<void> {
  const { data, error } = await getSupabase().from('board').update({ tagline: tagline.trim() }).eq('id', boardId).select('id');
  if (error || !data || data.length === 0) throw new ApiError('We couldn’t save. Try again.');
}

export async function updateHub(hubId: string, d: { name: string; description: string }): Promise<void> {
  const { data, error } = await getSupabase()
    .from('hub')
    .update({ name: d.name.trim(), description: d.description.trim() })
    .eq('id', hubId)
    .select('id');
  if (error || !data || data.length === 0) throw new ApiError('We couldn’t save. Try again.');
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

/** board-logos/{board_id}/{uuid}.{ext} (0018_v2_storage.sql). */
export const logoPath = (boardId: string, type: AvatarType) => `${boardId}/${uuid()}.${AVATAR_TYPES[type]}`;

export const validateLogoFile = validateAvatarFile;

/**
 * Crop to a square, upload, point the board at it, then remove the old object
 * through the Storage API. Owners and admins only (Storage policy + board grant).
 */
export async function uploadBoardLogo(boardId: string, file: File, previous: string | null): Promise<string> {
  const bad = validateLogoFile(file);
  if (bad) throw new ApiError(bad);
  const type = file.type as AvatarType;
  const blob = await cropAvatar(file);
  if (blob.size > AVATAR_MAX_BYTES) throw new ApiError('That image is over 1 MB after cropping. Pick a smaller one.');
  const sb = getSupabase();
  const path = logoPath(boardId, type);
  const up = await sb.storage.from('board-logos').upload(path, blob, { contentType: type, upsert: false });
  if (up.error) throw new ApiError('We couldn’t upload that image. Try again.');
  const { data, error } = await sb.from('board').update({ logo_path: path }).eq('id', boardId).select('id');
  if (error || !data || data.length === 0) {
    await sb.storage.from('board-logos').remove([path]);
    throw new ApiError('We couldn’t save the logo. Try again.');
  }
  if (previous && previous !== path) await sb.storage.from('board-logos').remove([previous]);
  return path;
}

export async function removeBoardLogo(boardId: string, previous: string | null): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.from('board').update({ logo_path: null }).eq('id', boardId).select('id');
  if (error || !data || data.length === 0) throw new ApiError('We couldn’t remove the logo. Try again.');
  if (previous) await sb.storage.from('board-logos').remove([previous]);
}

export const memberAvatar = (p: PersonRef | null) => publicStorageUrl('avatars', p?.avatar_path);
