import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { PersonRef } from './posts';
import {
  acceptRequest,
  deleteConversation,
  fetchBlockedPeople,
  fetchConversations,
  fetchDmPolicy,
  fetchMessages,
  markConversationRead,
  muteConversation,
  sendMessage,
  setDmPolicy,
  setPersonBlocked,
  startConversation,
  subscribeToDmMessages,
  type Conversation,
  type DmMessage,
  type DmRealtimeRow,
  type StartedConversation,
} from './messages';

/* TanStack Query hooks for direct messages (0058). */

export const dmKeys = {
  all: ['dm'] as const,
  list: (viewerId: string | null) => ['dm', 'list', viewerId ?? 'none'] as const,
  thread: (conversationId: string) => ['dm', 'thread', conversationId] as const,
  policy: (userId: string) => ['dm', 'policy', userId] as const,
  blocked: (viewerId: string) => ['dm', 'blocked', viewerId] as const,
};

/** Messages is on for every signed-in person (step 4c). Kept as one switch so it can be gated again. */
export function useMessagesEnabled(viewerId: string | null): boolean {
  return Boolean(viewerId);
}

let optimisticSeq = 0;

function mergeRealtimeRow(qc: QueryClient, viewerId: string, row: DmRealtimeRow): void {
  const threadKey = dmKeys.thread(row.conversation_id);
  const listKey = dmKeys.list(viewerId);

  if (row.id && typeof row.body === 'string' && typeof row.created_at === 'string') {
    const incoming: DmMessage = {
      id: row.id,
      conversation_id: row.conversation_id,
      sender: row.sender ?? null,
      body: row.body,
      created_at: row.created_at,
    };
    const existingThread = qc.getQueryData<DmMessage[]>(threadKey);
    let matchedLocalOptimistic = false;

    if (existingThread) {
      if (existingThread.some((m) => m.id === incoming.id)) {
        // Already reconciled from our own send; no extra refetch needed.
        return;
      }
      if (incoming.sender === viewerId) {
        const pendingIdx = existingThread.findIndex((m) => m.pending && m.sender === viewerId && m.body === incoming.body);
        if (pendingIdx !== -1) {
          matchedLocalOptimistic = true;
          const next = existingThread.slice();
          next[pendingIdx] = incoming;
          qc.setQueryData<DmMessage[]>(threadKey, next);
        } else {
          qc.setQueryData<DmMessage[]>(threadKey, [...existingThread, incoming]);
        }
      } else {
        qc.setQueryData<DmMessage[]>(threadKey, [...existingThread, incoming]);
      }
    }

    if (!matchedLocalOptimistic) {
      void qc.invalidateQueries({ queryKey: listKey });
    }
    return;
  }

  void qc.invalidateQueries({ queryKey: listKey });
  void qc.invalidateQueries({ queryKey: threadKey });
}

/*
 * Realtime (step 3). Several components read the list at once (nav rail, tab
 * bar, the inbox), so the channel is shared and reference-counted: the first
 * reader opens it, the last one closes it. A new message merges directly into
 * any open thread cache (avoiding redundant refetches on our own sends) and
 * refreshes the list when another person writes. Polling stays as a slow safety
 * net for changes Realtime doesn't carry (reads and accepts on another device)
 * and for a socket that drops without telling us.
 */
const live = { viewerId: null as string | null, count: 0, stop: null as null | (() => void) };

function retainDmLive(viewerId: string, qc: QueryClient): () => void {
  if (live.viewerId !== viewerId) {
    live.stop?.();
    live.viewerId = viewerId;
    live.count = 0;
    live.stop = subscribeToDmMessages(
      viewerId,
      (row) => mergeRealtimeRow(qc, viewerId, row),
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

/** Unread conversations in the Inbox, for the nav badge (requests and muted conversations don't badge, as on X). */
export function useDmUnread(viewerId: string | null): number {
  const enabled = useMessagesEnabled(viewerId);
  const list = useConversations(viewerId, enabled);
  return (list.data ?? []).filter((c) => c.state === 'inbox' && !c.muted && c.unread > 0).length;
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: dmKeys.thread(conversationId ?? 'none'),
    queryFn: () => fetchMessages(conversationId ?? ''),
    enabled: Boolean(conversationId),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function usePrefetchMessages() {
  const qc = useQueryClient();
  return useCallback(
    (conversationId: string) => {
      void qc.prefetchQuery({
        queryKey: dmKeys.thread(conversationId),
        queryFn: () => fetchMessages(conversationId),
        staleTime: 15_000,
      });
    },
    [qc],
  );
}

function useInvalidateDm() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: dmKeys.all });
}

export function useSendMessage(conversationId: string, viewerId: string | null = null) {
  const qc = useQueryClient();
  const threadKey = dmKeys.thread(conversationId);
  const listKey = dmKeys.list(viewerId);

  return useMutation({
    mutationFn: (body: string) => sendMessage(conversationId, body),
    onMutate: (body) => {
      const tempId = `optimistic:${++optimisticSeq}:${Date.now()}`;
      const createdAt = new Date().toISOString();
      void qc.cancelQueries({ queryKey: threadKey });

      const optimistic: DmMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender: viewerId,
        body,
        created_at: createdAt,
        pending: true,
      };
      qc.setQueryData<DmMessage[]>(threadKey, (prev) => [...(prev ?? []), optimistic]);

      const prevList = viewerId ? qc.getQueryData<Conversation[]>(listKey) : undefined;
      if (viewerId) {
        qc.setQueryData<Conversation[]>(listKey, (prev) => {
          if (!prev) return prev;
          const idx = prev.findIndex((c) => c.id === conversationId);
          if (idx === -1) return prev;
          const updated: Conversation = {
            ...prev[idx]!,
            state: 'inbox',
            last_body: body,
            last_sender: viewerId,
            last_at: createdAt,
            unread: 0,
          };
          const rest = prev.filter((_, i) => i !== idx);
          return [updated, ...rest];
        });
      }

      return { tempId, createdAt, prevList };
    },
    onSuccess: (sent, _body, ctx) => {
      if (sent?.id) {
        qc.setQueryData<DmMessage[]>(threadKey, (prev) => {
          if (!prev) return prev;
          const alreadyMerged = prev.some((m) => m.id === sent.id);
          if (alreadyMerged) return prev.filter((m) => m.id !== ctx?.tempId);
          return prev.map((m) => (m.id === ctx?.tempId ? { ...m, id: sent.id, created_at: sent.created_at, pending: false } : m));
        });
        if (viewerId) {
          qc.setQueryData<Conversation[]>(listKey, (prev) =>
            prev?.map((c) => (c.id === conversationId && c.last_at === ctx?.createdAt ? { ...c, last_at: sent.created_at } : c)),
          );
        }
        return;
      }

      // Fallback when a caller/mock returns no message metadata.
      qc.setQueryData<DmMessage[]>(threadKey, (prev) => prev?.map((m) => (m.id === ctx?.tempId ? { ...m, pending: false } : m)));
      void qc.invalidateQueries({ queryKey: threadKey });
      if (viewerId) void qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (_err, _body, ctx) => {
      qc.setQueryData<DmMessage[]>(threadKey, (prev) => prev?.filter((m) => m.id !== ctx?.tempId));
      if (viewerId) {
        const stillPending = (qc.getQueryData<DmMessage[]>(threadKey) ?? []).some((m) => m.pending);
        if (!stillPending && ctx?.prevList) {
          qc.setQueryData<Conversation[]>(listKey, ctx.prevList);
        } else {
          void qc.invalidateQueries({ queryKey: listKey });
        }
      }
    },
  });
}

export function useStartConversation(viewerId: string | null = null) {
  const qc = useQueryClient();
  const listKey = dmKeys.list(viewerId);

  return useMutation({
    mutationFn: async (v: { recipientId: string; body: string; recipient?: PersonRef }): Promise<StartedConversation> => {
      const res = (await startConversation(v.recipientId, v.body)) as StartedConversation | string;
      return typeof res === 'string' ? { conversation: res } : res;
    },
    onSuccess: (res, v) => {
      const convId = res.conversation;
      const createdAt = res.created_at ?? new Date().toISOString();
      const msgId = res.id ?? `sent:${++optimisticSeq}:${Date.now()}`;

      if (convId) {
        const threadKey = dmKeys.thread(convId);
        const first: DmMessage = {
          id: msgId,
          conversation_id: convId,
          sender: viewerId,
          body: v.body,
          created_at: createdAt,
        };
        qc.setQueryData<DmMessage[]>(threadKey, (prev) => {
          if (!prev) return [first];
          if (prev.some((m) => m.id === first.id)) return prev;
          return [...prev, first];
        });

        if (viewerId && v.recipient) {
          const seeded: Conversation = {
            id: convId,
            state: 'inbox',
            muted: false,
            other: v.recipient,
            last_body: v.body,
            last_sender: viewerId,
            last_at: createdAt,
            unread: 0,
            blocked: false,
          };
          qc.setQueryData<Conversation[]>(listKey, (prev) => {
            const rest = (prev ?? []).filter((c) => c.id !== convId);
            return [seeded, ...rest];
          });
          return;
        }
      }

      if (viewerId) void qc.invalidateQueries({ queryKey: listKey });
      else void qc.invalidateQueries({ queryKey: dmKeys.all });
    },
  });
}

export function useAcceptRequest() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: acceptRequest, onSuccess: done });
}
export function useDeleteConversation() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: deleteConversation, onSuccess: done });
}
export function useMarkConversationRead(viewerId: string | null = null) {
  const qc = useQueryClient();
  const listKey = dmKeys.list(viewerId);
  return useMutation({
    mutationFn: markConversationRead,
    onMutate: (conversationId) => {
      if (!viewerId) return;
      qc.setQueryData<Conversation[]>(listKey, (prev) => prev?.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)));
    },
    onSuccess: () => {
      if (viewerId) void qc.invalidateQueries({ queryKey: listKey });
      else void qc.invalidateQueries({ queryKey: dmKeys.all });
    },
  });
}
export function useSetPersonBlocked() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: (v: { userId: string; on: boolean }) => setPersonBlocked(v.userId, v.on), onSuccess: done });
}
export function useMuteConversation() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: (v: { conversationId: string; muted: boolean }) => muteConversation(v.conversationId, v.muted), onSuccess: done });
}

export function useDmPolicy(userId: string | null) {
  return useQuery({
    queryKey: dmKeys.policy(userId ?? 'none'),
    queryFn: () => fetchDmPolicy(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
export function useSetDmPolicy() {
  const done = useInvalidateDm();
  return useMutation({ mutationFn: setDmPolicy, onSuccess: done });
}
export function useBlockedPeople(viewerId: string | null, enabled = true) {
  return useQuery({
    queryKey: dmKeys.blocked(viewerId ?? 'none'),
    queryFn: fetchBlockedPeople,
    enabled: Boolean(viewerId) && enabled,
  });
}
