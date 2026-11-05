import { getSupabase, hasSupabaseConfig } from './supabase';
import { ApiError, type PersonRef } from './posts';

/*
 * Direct messages (0058, Albert 2026-11-05): open DMs on X's model. A first message
 * from someone the recipient doesn't follow is a Request, which carries one message
 * until the recipient accepts or replies. Every rule lives in the database RPCs; this
 * layer only calls them and words their answers.
 *
 * Rollout: staff-only through steps 2-4b; on for every signed-in person since step 4c
 * (useMessagesEnabled).
 */

export type DmState = 'inbox' | 'request';
export type DmPolicy = 'everyone' | 'following' | 'nobody';

export interface Conversation {
  id: string;
  state: DmState;
  muted: boolean;
  other: PersonRef;
  last_body: string;
  last_sender: string | null;
  last_at: string;
  unread: number;
  /** The viewer blocks the other person. */
  blocked: boolean;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender: string | null;
  body: string;
  created_at: string;
}

interface ConversationRow {
  id: string;
  state: DmState;
  muted: boolean;
  other_id: string;
  other_handle: string;
  other_name: string;
  other_avatar_path: string | null;
  last_body: string;
  last_sender: string | null;
  last_at: string;
  unread: number;
  blocked: boolean;
}

export const DM_MAX = 2000;

const DM_ERRORS: Record<string, string> = {
  sign_in: 'Sign in to send messages.',
  empty: 'Write a message first.',
  too_long: `Messages can be up to ${DM_MAX.toLocaleString('en')} characters.`,
  invalid: 'You can’t message yourself.',
  not_found: 'That conversation isn’t available.',
  not_allowed: 'You can’t message this person.',
  awaiting_accept: 'You can send more once they accept your request.',
  confirm_email: 'Confirm your email address to start a conversation.',
};

/** Words for an RPC's refusal (0058 errors, plus rate_limited with its hint). */
export function dmErrorMessage(res: { error?: string; hint?: string } | null | undefined): string {
  const e = res?.error ?? '';
  if (e === 'rate_limited') {
    return res?.hint === 'conversations'
      ? 'You’ve started a lot of conversations today. Try again tomorrow.'
      : res?.hint === 'day'
        ? 'You’ve sent a lot of messages today. Try again later.'
        : 'You’re sending messages quickly. Wait a moment and try again.';
  }
  return DM_ERRORS[e] ?? 'Something went wrong. Try again.';
}

type RpcResult = { ok: boolean; error?: string; hint?: string; conversation?: string; id?: string; created_at?: string };

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw new ApiError('Something went wrong. Try again.');
  const res = (data ?? { ok: false }) as RpcResult;
  if (!res.ok) throw new ApiError(dmErrorMessage(res));
  return res;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await getSupabase().rpc('dm_conversations');
  if (error) throw error;
  return ((data ?? []) as ConversationRow[]).map((r) => ({
    id: r.id,
    state: r.state,
    muted: r.muted,
    other: { id: r.other_id, handle: r.other_handle, name: r.other_name, avatar_path: r.other_avatar_path },
    last_body: r.last_body,
    last_sender: r.last_sender,
    last_at: r.last_at,
    unread: r.unread,
    blocked: r.blocked,
  }));
}

/** A conversation's messages, oldest first. RLS hides what the viewer cleared. */
export async function fetchMessages(conversationId: string): Promise<DmMessage[]> {
  const { data, error } = await getSupabase()
    .from('dm_message')
    .select('id, conversation_id, sender, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as DmMessage[]).reverse();
}

export async function startConversation(recipientId: string, body: string): Promise<string> {
  const res = await rpc('dm_start', { p_recipient: recipientId, p_body: body });
  return res.conversation ?? '';
}
export async function sendMessage(conversationId: string, body: string): Promise<void> {
  await rpc('dm_send', { p_conversation: conversationId, p_body: body });
}
export async function acceptRequest(conversationId: string): Promise<void> {
  await rpc('dm_accept', { p_conversation: conversationId });
}
export async function deleteConversation(conversationId: string): Promise<void> {
  await rpc('dm_delete', { p_conversation: conversationId });
}
export async function markConversationRead(conversationId: string): Promise<void> {
  await rpc('dm_mark_read', { p_conversation: conversationId });
}
export async function setPersonBlocked(userId: string, on: boolean): Promise<void> {
  await rpc(on ? 'block_user' : 'unblock_user', { p_user: userId });
}
/** Muting stops the unread badge and (step 4) the email for this conversation; messages still arrive. */
export async function muteConversation(conversationId: string, muted: boolean): Promise<void> {
  await rpc('dm_mute', { p_conversation: conversationId, p_muted: muted });
}

/** Who may start a conversation with this person. Public on profile, so the Message button can respect it. */
export async function fetchDmPolicy(userId: string): Promise<DmPolicy> {
  const { data, error } = await getSupabase().from('profile').select('dm_policy').eq('id', userId).maybeSingle();
  if (error) throw error;
  const v = (data as { dm_policy?: unknown } | null)?.dm_policy;
  return v === 'following' || v === 'nobody' ? v : 'everyone';
}
export async function setDmPolicy(policy: DmPolicy): Promise<void> {
  await rpc('set_dm_policy', { p_policy: policy });
}

export interface BlockedPerson extends PersonRef {
  blocked_at: string;
}
/** People the viewer has blocked, newest first. Only the blocker can see this list. */
export async function fetchBlockedPeople(): Promise<BlockedPerson[]> {
  const { data, error } = await getSupabase().rpc('blocked_users');
  if (error) throw error;
  return (data ?? []) as BlockedPerson[];
}

/**
 * Step 3: Realtime. One channel on INSERTs into dm_message. There is no filter:
 * the table's RLS ("v2 dm_message member") limits each socket to the viewer's
 * own conversations, so the server never sends a row the viewer cannot select.
 * Returns the unsubscribe. `onReconnect` fires when the channel (re)joins, so
 * the caller can refetch anything missed while the socket was down.
 */
export function subscribeToDmMessages(
  viewerId: string,
  onInsert: (row: { conversation_id: string }) => void,
  onReconnect: () => void,
): () => void {
  if (!hasSupabaseConfig) return () => {};
  const sb = getSupabase();
  let joinedOnce = false;
  const channel = sb
    .channel(`dm:${viewerId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_message' }, (payload) => {
      const row = payload.new as { conversation_id?: unknown };
      if (typeof row.conversation_id === 'string') onInsert({ conversation_id: row.conversation_id });
    })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (joinedOnce) onReconnect();
      joinedOnce = true;
    });
  return () => {
    void sb.removeChannel(channel);
  };
}
