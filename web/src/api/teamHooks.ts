import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { patchPost } from './postHooks';
import type { PostStatus } from './posts';
import {
  addMember,
  claimBoard,
  claimHub,
  decideJoinRequest,
  fetchJoinRequests,
  fetchManageStats,
  fetchMyRequests,
  fetchPendingDns,
  fetchScopeRole,
  fetchTeam,
  fetchVerifiedDomains,
  openDispute,
  removeBoardLogo,
  removeMember,
  requestJoin,
  setMemberRole,
  setPostStatus,
  updateBoardTagline,
  updateHub,
  uploadBoardLogo,
  type ApproveRole,
  type JoinRequest,
  type Role,
  type Scope,
} from './teams';

/* TanStack Query hooks for step 7: claiming, teams, join requests, Manage. */

export const teamKeys = {
  verified: (viewerId: string | null) => ['verified-domains', viewerId ?? 'anon'] as const,
  pendingDns: (viewerId: string | null) => ['pending-dns', viewerId ?? 'anon'] as const,
  myRequests: (scope: Scope, id: string, viewerId: string | null) => ['own-requests', scope, id, viewerId ?? 'anon'] as const,
  team: (scope: Scope, id: string) => ['team', scope, id] as const,
  role: (scope: Scope, id: string, viewerId: string | null) => ['scope-role', scope, id, viewerId ?? 'anon'] as const,
  joinRequests: (ids: string[]) => ['join-requests', ids.join(',')] as const,
  stats: (ids: string[]) => ['manage-stats', ids.join(',')] as const,
};

export function useVerifiedDomains(viewerId: string | null) {
  return useQuery({ queryKey: teamKeys.verified(viewerId), queryFn: () => fetchVerifiedDomains(viewerId ?? ''), enabled: Boolean(viewerId), staleTime: 60_000 });
}

export function usePendingDns(viewerId: string | null) {
  return useQuery({ queryKey: teamKeys.pendingDns(viewerId), queryFn: fetchPendingDns, enabled: Boolean(viewerId), staleTime: 60_000 });
}

export function useMyRequests(scope: Scope, id: string | undefined, viewerId: string | null, enabled = true) {
  return useQuery({
    queryKey: teamKeys.myRequests(scope, id ?? '', viewerId),
    queryFn: () => fetchMyRequests(scope, id ?? '', viewerId ?? ''),
    enabled: enabled && Boolean(id && viewerId),
  });
}

export function useScopeRole(scope: Scope, id: string | undefined, viewerId: string | null) {
  return useQuery({
    queryKey: teamKeys.role(scope, id ?? '', viewerId),
    queryFn: () => fetchScopeRole(scope, id ?? ''),
    enabled: Boolean(id && viewerId),
    staleTime: 60_000,
  });
}

export function useTeam(scope: Scope, id: string | undefined, enabled = true) {
  return useQuery({ queryKey: teamKeys.team(scope, id ?? ''), queryFn: () => fetchTeam(scope, id ?? ''), enabled: enabled && Boolean(id) });
}

export function useJoinRequests(scopes: Array<{ scope: Scope; id: string }>, enabled = true) {
  const ids = scopes.map((s) => `${s.scope}:${s.id}`);
  return useQuery({ queryKey: teamKeys.joinRequests(ids), queryFn: () => fetchJoinRequests(scopes), enabled: enabled && scopes.length > 0 });
}

export function useManageStats(boardIds: string[], enabled = true) {
  return useQuery({ queryKey: teamKeys.stats(boardIds), queryFn: () => fetchManageStats(boardIds), enabled: enabled && boardIds.length > 0 });
}

/** Everything a claim, a join or a role change can alter. */
function invalidateTeamState(qc: QueryClient) {
  for (const key of [['board'], ['boards'], ['hub'], ['hubs'], ['board-team'], ['scope-role'], ['team'], ['join-requests'], ['own-requests'], ['verified-domains'], ['pending-dns']]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

export function useClaimBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name: string; domain: string | null }) => claimBoard(v.id, { name: v.name, domain: v.domain }),
    onSuccess: () => invalidateTeamState(qc),
  });
}

export function useClaimHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name: string; domain: string | null }) => claimHub(v.id, { name: v.name, domain: v.domain }),
    onSuccess: () => invalidateTeamState(qc),
  });
}

export function useRequestJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scope: Scope; id: string; email: string; domain: string | null; message?: string }) => requestJoin(v.scope, v.id, v.email, v.domain, v.message),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['own-requests'] }),
  });
}

export function useOpenDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scope: Scope; id: string; reason: string; email: string; domain: string | null }) => openDispute(v.scope, v.id, v.reason, v.email, v.domain),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['own-requests'] }),
  });
}

export function useDecideJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decideJoinRequest(v.id, v.approve),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['join-requests'] });
      void qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

/**
 * Approve a join request with a role (#188). Existing RPCs only: approve (which adds
 * them as Member), then, for Admin, set_member_role, which re-checks the approver's
 * permission. `roleSet: false` means they joined but stayed Member.
 */
export function useApproveJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { request: Pick<JoinRequest, 'id' | 'scope' | 'scope_id' | 'user_id'>; role: ApproveRole }) => {
      await decideJoinRequest(v.request.id, true);
      if (v.role === 'member') return { roleSet: true };
      try {
        await setMemberRole(v.request.scope, v.request.scope_id, v.request.user_id, v.role);
        return { roleSet: true };
      } catch {
        return { roleSet: false };
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['join-requests'] });
      void qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scope: Scope; id: string; who: string; domain: string | null; role?: Role }) => addMember(v.scope, v.id, v.who, v.domain, v.role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      void qc.invalidateQueries({ queryKey: ['join-requests'] });
    },
  });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scope: Scope; id: string; userId: string; role: Role }) => setMemberRole(v.scope, v.id, v.userId, v.role),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      void qc.invalidateQueries({ queryKey: ['scope-role'] });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scope: Scope; id: string; userId: string }) => removeMember(v.scope, v.id, v.userId),
    onSuccess: () => invalidateTeamState(qc),
  });
}

/** Team status change; the post moves everywhere it is cached. */
export function useSetPostStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; to: PostStatus; note?: string }) => (v.note?.trim() ? setPostStatus(v.postId, v.to, v.note) : setPostStatus(v.postId, v.to)),
    onSuccess: (_d, v) => {
      patchPost(qc, v.postId, (p) => ({ ...p, status: v.to }));
      for (const key of [['posts', 'list'], ['post-counts'], ['roadmap'], ['changelog'], ['manage-stats'], ['status_events', v.postId], ['related'], ['wanted']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateBoardTagline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; tagline: string }) => updateBoardTagline(v.id, v.tagline),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: ['boards'] });
      void qc.invalidateQueries({ queryKey: ['hub'] });
    },
  });
}

export function useBoardLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; file: File | null; previous: string | null }) =>
      v.file ? uploadBoardLogo(v.id, v.file, v.previous) : removeBoardLogo(v.id, v.previous).then(() => null),
    onSuccess: () => {
      for (const key of [['board'], ['boards'], ['hub'], ['hubs'], ['posts']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUpdateHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name: string; description: string }) => updateHub(v.id, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hub'] });
      void qc.invalidateQueries({ queryKey: ['hubs'] });
    },
  });
}
