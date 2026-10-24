import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from './supabase';

/** v2_notification_kind, in the order Settings lists them. */
export const NOTIFICATION_KINDS = [
  'reply',
  'mention',
  'followed_post',
  'status_change',
  'upvote_milestone',
  'follow',
  'claim',
  'join',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const CHANNELS = ['in_app', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

export const KIND_COPY: Record<NotificationKind, { label: string; hint: string }> = {
  reply: { label: 'Replies', hint: 'Someone replies to your post or reply' },
  mention: { label: 'Mentions', hint: 'Someone mentions your @handle' },
  followed_post: { label: 'Posts you follow', hint: 'New activity on posts you follow or upvoted' },
  status_change: { label: 'Status changes', hint: 'A post you follow moves to Planned, Shipped and so on' },
  upvote_milestone: { label: 'Upvote milestones', hint: 'Your post reaches 10, 50, 100 upvotes and up' },
  follow: { label: 'New followers', hint: 'Someone follows you' },
  claim: { label: 'Board claims', hint: 'Updates on boards you claim or manage' },
  join: { label: 'Team requests', hint: 'Requests to join your team, and answers to yours' },
};

export interface PrefRow {
  kind: NotificationKind;
  channel: Channel;
  enabled: boolean;
}

/** Absent row = enabled (0016_v2_schema.sql). */
export type PrefMap = Record<`${NotificationKind}:${Channel}`, boolean>;

export function toPrefMap(rows: PrefRow[]): PrefMap {
  const map = {} as PrefMap;
  for (const k of NOTIFICATION_KINDS) for (const c of CHANNELS) map[`${k}:${c}`] = true;
  for (const r of rows) map[`${r.kind}:${r.channel}`] = r.enabled;
  return map;
}

export const prefsKey = (userId: string | null | undefined) => ['notification_pref', userId ?? 'none'] as const;

export async function fetchPrefs(): Promise<PrefRow[]> {
  const { data, error } = await getSupabase().from('notification_pref').select('kind, channel, enabled');
  if (error) throw error;
  return (data ?? []) as PrefRow[];
}

export async function savePref(userId: string, row: PrefRow): Promise<void> {
  const { error } = await getSupabase()
    .from('notification_pref')
    .upsert({ user_id: userId, ...row }, { onConflict: 'user_id,kind,channel' });
  if (error) throw error;
}

export function useNotificationPrefs(userId: string | null | undefined) {
  return useQuery({ queryKey: prefsKey(userId), queryFn: fetchPrefs, enabled: Boolean(userId), select: toPrefMap });
}

/** Optimistic toggle; rolls back if the write is refused. */
export function useSetNotificationPref(userId: string) {
  const qc = useQueryClient();
  const key = prefsKey(userId);
  return useMutation({
    mutationFn: (row: PrefRow) => savePref(userId, row),
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<PrefRow[]>(key);
      const rest = (before ?? []).filter((r) => !(r.kind === row.kind && r.channel === row.channel));
      qc.setQueryData<PrefRow[]>(key, [...rest, row]);
      return { before };
    },
    onError: (_e, _row, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.before);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ------------------------------------------------------------------ unsubscribe

export type UnsubscribeOutcome = 'done' | 'invalid' | 'offline';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One-click unsubscribe from every email (FOUNDATION §9). The RPC answers a quiet
 * `false` for an unknown token; a malformed one gets the same answer without a
 * round trip, so the page never says which tokens exist.
 */
export async function unsubscribeAll(token: string | null): Promise<UnsubscribeOutcome> {
  if (!token || !UUID_RE.test(token.trim())) return 'invalid';
  try {
    const { data, error } = await getSupabase().rpc('unsubscribe', { p_token: token.trim() });
    if (error) return /fetch|network/i.test(error.message) ? 'offline' : 'invalid';
    return data === true ? 'done' : 'invalid';
  } catch {
    return 'offline';
  }
}

// ------------------------------------------------------------------ the notification list (step 8)

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  target_type: 'post' | 'reply' | 'board' | 'hub' | 'user';
  target_id: string;
  post_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor: { id: string; handle: string; name: string; avatar_path: string | null } | null;
  post: {
    id: string;
    title: string;
    author_id: string | null;
    board: { id: string; slug: string; name: string; color: string; logo_path: string | null } | null;
  } | null;
  /** The reply's text, for reply and mention notifications. */
  quote: string | null;
  /** Board or hub named by a claim or join notification. */
  scope: { name: string; slug: string; color: string | null } | null;
}

export const NOTIFICATION_PAGE = 50;

const NOTIF_SELECT =
  'id, kind, target_type, target_id, post_id, data, read_at, created_at, ' +
  'actor:profile!actor(id, handle, name, avatar_path), ' +
  'post:post!post_id(id, title, author_id, board:board!board_id(id, slug, name, color, logo_path))';

type NotifRow = Omit<AppNotification, 'quote' | 'scope'>;

/** The viewer's newest notifications (RLS: only their own), with what each points at. */
export async function fetchNotifications(limit = NOTIFICATION_PAGE): Promise<AppNotification[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from('notification').select(NOTIF_SELECT).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as NotifRow[];
  const replyIds = rows.filter((r) => r.target_type === 'reply').map((r) => r.target_id);
  const boardIds = rows.filter((r) => r.target_type === 'board').map((r) => r.target_id);
  const hubIds = rows.filter((r) => r.target_type === 'hub').map((r) => r.target_id);
  const [replies, boards, hubs] = await Promise.all([
    replyIds.length ? sb.from('reply').select('id, body').in('id', replyIds) : Promise.resolve({ data: [], error: null }),
    boardIds.length ? sb.from('board').select('id, slug, name, color').in('id', boardIds) : Promise.resolve({ data: [], error: null }),
    hubIds.length ? sb.from('hub').select('id, slug, name').in('id', hubIds) : Promise.resolve({ data: [], error: null }),
  ]);
  // Extras are best effort: a deleted reply or board just loses its quote or name.
  const quotes = new Map(((replies.data ?? []) as Array<{ id: string; body: string }>).map((r) => [r.id, r.body]));
  const scopes = new Map<string, { name: string; slug: string; color: string | null }>();
  for (const b of (boards.data ?? []) as Array<{ id: string; slug: string; name: string; color: string }>) scopes.set(b.id, { name: b.name, slug: b.slug, color: b.color });
  for (const h of (hubs.data ?? []) as Array<{ id: string; slug: string; name: string }>) scopes.set(h.id, { name: h.name, slug: h.slug, color: null });
  return rows.map((r) => ({ ...r, quote: quotes.get(r.target_id) ?? null, scope: scopes.get(r.target_id) ?? null }));
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await getSupabase().from('notification').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationsRead(ids: string[] | 'all', viewerId: string): Promise<void> {
  let q = getSupabase().from('notification').update({ read_at: new Date().toISOString() }).eq('recipient', viewerId).is('read_at', null);
  if (ids !== 'all') {
    if (ids.length === 0) return;
    q = q.in('id', ids);
  }
  const { error } = await q;
  if (error) throw error;
}

export type NotificationGroup = 'Today' | 'This week' | 'Earlier';

export function notificationGroup(iso: string, now: Date = new Date()): NotificationGroup {
  const d = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return 'Today';
  if (d.getTime() >= start - 6 * 86400_000) return 'This week';
  return 'Earlier';
}

/** Mockup tabs: Replies (reply, mention) and Activity (everything else). */
export const notificationTab = (k: NotificationKind): 'replies' | 'activity' => (k === 'reply' || k === 'mention' ? 'replies' : 'activity');
