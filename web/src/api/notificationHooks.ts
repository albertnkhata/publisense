import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotifications, fetchUnreadCount, markNotificationsRead, type AppNotification } from './notifications';

/* TanStack Query hooks for the notification list and the unread badge (step 8). */

export const notificationKeys = {
  list: (viewerId: string | null) => ['notifications', 'list', viewerId ?? 'none'] as const,
  unread: (viewerId: string | null) => ['notifications', 'unread', viewerId ?? 'none'] as const,
};

export function useNotifications(viewerId: string | null) {
  return useQuery({ queryKey: notificationKeys.list(viewerId), queryFn: () => fetchNotifications(), enabled: Boolean(viewerId) });
}

export function useUnreadCount(viewerId: string | null) {
  return useQuery({
    queryKey: notificationKeys.unread(viewerId),
    queryFn: fetchUnreadCount,
    enabled: Boolean(viewerId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Mark some (or all) read; the list and the badge update at once. */
export function useMarkRead(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | 'all') => markNotificationsRead(ids, viewerId ?? ''),
    onMutate: async (ids) => {
      const listKey = notificationKeys.list(viewerId);
      const unreadKey = notificationKeys.unread(viewerId);
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const before = { list: qc.getQueryData<AppNotification[]>(listKey), unread: qc.getQueryData<number>(unreadKey) };
      const now = new Date().toISOString();
      let cleared = 0;
      qc.setQueryData<AppNotification[]>(listKey, (old) =>
        (old ?? []).map((n) => {
          if (n.read_at || (ids !== 'all' && !ids.includes(n.id))) return n;
          cleared += 1;
          return { ...n, read_at: now };
        }),
      );
      qc.setQueryData<number>(unreadKey, (old) => (ids === 'all' ? 0 : Math.max(0, (old ?? 0) - (cleared || ids.length))));
      return before;
    },
    onError: (_e, _v, before) => {
      if (!before) return;
      qc.setQueryData(notificationKeys.list(viewerId), before.list);
      qc.setQueryData(notificationKeys.unread(viewerId), before.unread);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: notificationKeys.unread(viewerId) }),
  });
}
