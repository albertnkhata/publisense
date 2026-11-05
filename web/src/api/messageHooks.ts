import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptRequest,
  deleteConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  sendMessage,
  setPersonBlocked,
  startConversation,
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

export function useConversations(viewerId: string | null, enabled = true) {
  return useQuery({
    queryKey: dmKeys.list(viewerId),
    queryFn: fetchConversations,
    enabled: Boolean(viewerId) && enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
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
    refetchInterval: 10_000,
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
