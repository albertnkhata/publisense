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
