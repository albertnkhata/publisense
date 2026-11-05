import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  acceptRequest,
  deleteConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  sendMessage,
  setPersonBlocked,
  startConversation,
  subscribeToDmMessages,
} from './messages';
import { useIsPlatformAdmin } from './moderationHooks';

/* TanStack Query hooks for direct messages (0058). */


export const dmKeys = {
  all: ['dm'] as const,
  list: (viewerId: string | null) => ['dm', 'list', viewerId ?? 'none'] as const,
  thread: (conversationId: string) => ['dm', 'thread', conversationId] as const,
};

/** Step 2 rollout: Messages is visible to platform staff only. */
export function useMessagesEnabled(viewerId: string | null): boolean {
  return useIsPlatformAdmin(viewerId).data ?? false;
}

/*
 * Realtime (step 3). Several components read the list at once (nav rail, tab
 * bar, the inbox), so the channel is shared and reference-counted: the first
 * reader opens it, the last one closes it. A new message refreshes the list
 * and that conversation's thread. Polling stays as a slow safety net for
 * changes Realtime doesn't carry (reads and accepts on another device) and for
 * a socket that drops without telling us.
 */
const live = { viewerId: null as string | null, count: 0, stop: null as null | (() => void) };

function retainDmLive(viewerId: string, qc: QueryClient): () => void {
  if (live.viewerId !== viewerId) {
    live.stop?.();
    live.viewerId = viewerId;
    live.count = 0;
    live.stop = subscribeToDmMessages(
      viewerId,
      (row) => {
        void qc.invalidateQueries({ queryKey: dmKeys.list(viewerId) });
        void qc.invalidateQueries({ queryKey: dmKeys.thread(row.conversation_id) });
      },
      () => void qc.invalidateQueries({ queryKey: dmKeys.all }),
    );
  }
  live.count += 1;
  return () => {
    live.count -= 1;
    if (live.count <= 0 && live.viewerId === viewerId) {
      live.stop?.();
      live.viewerId = null;
      live.stop = null;
      live.count = 0;
    }
  };
}

/** Test seam: drop the shared channel between tests. */
export function resetDmLiveForTests(): void {
  live.stop?.();
  live.viewerId = null;
  live.stop = null;
  live.count = 0;
}

export function useDmLive(viewerId: string | null, enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!viewerId || !enabled) return;
    return retainDmLive(viewerId, qc);
  }, [viewerId, enabled, qc]);
}

export function useConversations(viewerId: string | null, enabled = true) {
  useDmLive(viewerId, enabled);
  return useQuery({
    queryKey: dmKeys.list(viewerId),
    queryFn: fetchConversations,
    enabled: Boolean(viewerId) && enabled,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/** Unread conversations in the Inbox, for the nav badge (requests don't badge, as on X). */
export function useDmUnread(viewerId: string | null): number {
  const enabled = useMessagesEnabled(viewerId);
  const list = useConversations(viewerId, enabled);
  return (list.data ?? []).filter((c) => c.state === 'inbox' && c.unread > 0).length;
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: dmKeys.thread(conversationId ?? 'none'),
    queryFn: () => fetchMessages(conversationId ?? ''),
    enabled: Boolean(conversationId),
    refetchInterval: 60_000,
  });
}

function useInvalidateDm() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: dmKeys.all });
}

export function useSendMessage(conversationId: string) {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: (body: string) => sendMessage(conversationId, body), onSuccess: done });
}
export function useStartConversation() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: (v: { recipientId: string; body: string }) => startConversation(v.recipientId, v.body), onSuccess: done });
}
export function useAcceptRequest() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: acceptRequest, onSuccess: done });
}
export function useDeleteConversation() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: deleteConversation, onSuccess: done });
}
export function useMarkConversationRead() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: markConversationRead, onSuccess: done });
}
export function useSetPersonBlocked() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: (v: { userId: string; on: boolean }) => setPersonBlocked(v.userId, v.on), onSuccess: done });
}
