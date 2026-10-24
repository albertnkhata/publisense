import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { patchPost, postKeys } from './postHooks';
import type { Reply } from './posts';
import {
  decideDispute,
  decideReports,
  fetchAdminEvents,
  fetchAdminScopes,
  fetchBlocked,
  fetchBlocksFor,
  fetchDisputes,
  fetchIsPlatformAdmin,
  fetchMergeCandidates,
  fetchPlatformAdmins,
  fetchReportQueue,
  findUser,
  grantPlatformAdmin,
  mergePost,
  releaseScope,
  reportContent,
  revokePlatformAdmin,
  setBlocked,
  setPostHidden,
  setReplyHidden,
  unmergePost,
  type ReportAction,
  type ReportTarget,
} from './moderation';
import type { Scope } from './teams';

/* TanStack Query hooks for step 8: moderation and the platform-admin screens. */

export const moderationKeys = {
  isAdmin: (viewerId: string | null) => ['platform-admin', viewerId ?? 'anon'] as const,
  adminScopes: (viewerId: string | null) => ['admin-scopes', viewerId ?? 'anon'] as const,
  blocksFor: (userId: string, ids: string[]) => ['blocks-for', userId, ids.join(',')] as const,
  blocked: (scope: Scope, id: string) => ['blocked', scope, id] as const,
  reports: (status: 'open' | 'closed') => ['admin-reports', status] as const,
  disputes: (status: 'pending' | 'closed') => ['admin-disputes', status] as const,
  admins: ['platform-admins'] as const,
  events: ['platform-admin-events'] as const,
};

export function useIsPlatformAdmin(viewerId: string | null) {
  return useQuery({ queryKey: moderationKeys.isAdmin(viewerId), queryFn: () => fetchIsPlatformAdmin(viewerId ?? ''), enabled: Boolean(viewerId), staleTime: 5 * 60_000 });
}

/** Lists that show live posts only: a merge or hide changes what they hold. */
function invalidateLists(qc: QueryClient) {
  for (const key of [['posts', 'feed'], ['posts', 'list'], ['posts', 'user'], ['post-counts'], ['roadmap'], ['changelog'], ['manage-stats'], ['related'], ['wanted'], ['search'], ['similar']]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

// ------------------------------------------------------------------ merge

export function useMergePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sourceId: string; targetId: string }) => mergePost(v.sourceId, v.targetId),
    onSuccess: (_r, v) => {
      patchPost(qc, v.sourceId, (p) => ({ ...p, status: 'merged', merged_into: v.targetId }));
      void qc.invalidateQueries({ queryKey: ['posts', 'detail', v.targetId] });
      void qc.invalidateQueries({ queryKey: postKeys.status(v.sourceId) });
      invalidateLists(qc);
    },
  });
}

export function useUnmergePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sourceId: string; targetId: string | null }) => unmergePost(v.sourceId),
    onSuccess: (r, v) => {
      patchPost(qc, v.sourceId, (p) => ({ ...p, status: r.status, merged_into: null }));
      if (v.targetId) void qc.invalidateQueries({ queryKey: ['posts', 'detail', v.targetId] });
      void qc.invalidateQueries({ queryKey: postKeys.status(v.sourceId) });
      invalidateLists(qc);
    },
  });
}

export function useMergeCandidates(boardIds: string[], q: string, exceptId: string, enabled = true) {
  const term = q.trim().toLowerCase();
  return useQuery({
    queryKey: ['merge-candidates', boardIds.join(','), term, exceptId],
    queryFn: () => fetchMergeCandidates(boardIds, term, exceptId, term ? 8 : 6),
    enabled: enabled && boardIds.length > 0,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

// ------------------------------------------------------------------ hide

export function useHidePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; hidden: boolean }) => setPostHidden(v.postId, v.hidden),
    onSuccess: (_d, v) => {
      patchPost(qc, v.postId, (p) => ({ ...p, hidden_at: v.hidden ? new Date().toISOString() : null }));
      invalidateLists(qc);
    },
  });
}

export function useHideReply(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { replyId: string; hidden: boolean }) => setReplyHidden(v.replyId, v.hidden),
    onSuccess: (_d, v) => {
      qc.setQueryData<Reply[]>(postKeys.replies(postId), (old) =>
        (old ?? []).map((r) => (r.id === v.replyId ? { ...r, hidden_at: v.hidden ? new Date().toISOString() : null } : r)),
      );
      // The card quotes the latest visible official reply.
      void qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

// ------------------------------------------------------------------ report

export function useReport() {
  return useMutation({ mutationFn: (v: { target: ReportTarget; id: string; reason: string }) => reportContent(v.target, v.id, v.reason) });
}

// ------------------------------------------------------------------ block

export function useAdminScopes(viewerId: string | null, enabled = true) {
  return useQuery({ queryKey: moderationKeys.adminScopes(viewerId), queryFn: () => fetchAdminScopes(viewerId ?? ''), enabled: enabled && Boolean(viewerId), staleTime: 60_000 });
}

export function useBlocksFor(userId: string | undefined, scopeIds: string[]) {
  return useQuery({
    queryKey: moderationKeys.blocksFor(userId ?? '', scopeIds),
    queryFn: () => fetchBlocksFor(userId ?? '', scopeIds),
    enabled: Boolean(userId) && scopeIds.length > 0,
  });
}

export function useBlocked(scope: Scope, id: string | undefined, enabled = true) {
  return useQuery({ queryKey: moderationKeys.blocked(scope, id ?? ''), queryFn: () => fetchBlocked(scope, id ?? ''), enabled: enabled && Boolean(id) });
}

export function useSetBlocked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scope: Scope; id: string; userId: string; on: boolean }) => setBlocked(v.scope, v.id, v.userId, v.on),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['blocks-for'] });
      void qc.invalidateQueries({ queryKey: ['blocked'] });
    },
  });
}

// ------------------------------------------------------------------ release

export function useReleaseScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scope: Scope; id: string }) => releaseScope(v.scope, v.id),
    onSuccess: () => {
      for (const key of [['board'], ['boards'], ['hub'], ['hubs'], ['board-team'], ['scope-role'], ['team'], ['join-requests'], ['own-requests'], ['admin-scopes'], ['managed'], ['blocked']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ------------------------------------------------------------------ admin queues and team

export function useReportQueue(status: 'open' | 'closed', enabled = true) {
  return useQuery({ queryKey: moderationKeys.reports(status), queryFn: () => fetchReportQueue(status), enabled });
}

export function useDecideReports() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { target: ReportTarget; id: string; action: ReportAction }) => decideReports(v.target, v.id, v.action),
    onSuccess: (_n, v) => {
      void qc.invalidateQueries({ queryKey: ['admin-reports'] });
      if (v.action === 'hide') {
        if (v.target === 'post') patchPost(qc, v.id, (p) => ({ ...p, hidden_at: new Date().toISOString() }));
        invalidateLists(qc);
        void qc.invalidateQueries({ queryKey: ['replies'] });
      }
    },
  });
}

export function useDisputes(status: 'pending' | 'closed', enabled = true) {
  return useQuery({ queryKey: moderationKeys.disputes(status), queryFn: () => fetchDisputes(status), enabled });
}

export function useDecideDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decideDispute(v.id, v.approve),
    onSuccess: () => {
      for (const key of [['admin-disputes'], ['board'], ['boards'], ['hub'], ['hubs'], ['team'], ['scope-role']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function usePlatformAdmins(enabled = true) {
  return useQuery({ queryKey: moderationKeys.admins, queryFn: fetchPlatformAdmins, enabled });
}

export function useAdminEvents(enabled = true) {
  return useQuery({ queryKey: moderationKeys.events, queryFn: () => fetchAdminEvents(), enabled });
}

export function useFindUser() {
  return useMutation({ mutationFn: (who: string) => findUser(who) });
}

function invalidateAdmins(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: moderationKeys.admins });
  void qc.invalidateQueries({ queryKey: moderationKeys.events });
  void qc.invalidateQueries({ queryKey: ['platform-admin'] });
}

export function useGrantAdmin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (userId: string) => grantPlatformAdmin(userId), onSuccess: () => invalidateAdmins(qc) });
}

export function useRevokeAdmin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (userId: string) => revokePlatformAdmin(userId), onSuccess: () => invalidateAdmins(qc) });
}
