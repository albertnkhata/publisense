import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFollowedUsers, fetchManaged, fetchProfileByHandle, fetchUserReplies, fetchUserStats, searchPeople, setUserFollow, type PublicProfile } from './people';
import { fetchUpvotedPosts, fetchUserPosts } from './posts';

/* TanStack Query hooks for step 8: profiles and following people. */

export const peopleKeys = {
  profile: (handle: string) => ['person', handle] as const,
  stats: (id: string) => ['person-stats', id] as const,
  // Under ['posts', …] so patchPost reaches the cards (votes, follows, merges).
  posts: (id: string, viewerId: string | null) => ['posts', 'user', id, viewerId ?? 'anon'] as const,
  upvoted: (viewerId: string | null) => ['posts', 'upvoted', viewerId ?? 'anon'] as const,
  replies: (id: string) => ['person-replies', id] as const,
  followed: (viewerId: string | null) => ['followed-users', viewerId ?? 'anon'] as const,
  managed: (viewerId: string | null) => ['managed', viewerId ?? 'anon'] as const,
  search: (q: string) => ['people-search', q] as const,
};

export function usePerson(handle: string | undefined) {
  return useQuery({ queryKey: peopleKeys.profile(handle ?? ''), queryFn: () => fetchProfileByHandle(handle ?? ''), enabled: Boolean(handle) });
}

export function usePersonStats(id: string | undefined) {
  return useQuery({ queryKey: peopleKeys.stats(id ?? ''), queryFn: () => fetchUserStats(id ?? ''), enabled: Boolean(id) });
}

export function useUserPosts(id: string | undefined, viewerId: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: peopleKeys.posts(id ?? '', viewerId),
    queryFn: ({ pageParam }) => fetchUserPosts(id ?? '', pageParam, viewerId),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: enabled && Boolean(id),
  });
}

export function useUpvotedPosts(viewerId: string | null, enabled = true) {
  return useQuery({ queryKey: peopleKeys.upvoted(viewerId), queryFn: () => fetchUpvotedPosts(viewerId ?? ''), enabled: enabled && Boolean(viewerId) });
}

export function useUserReplies(id: string | undefined, enabled = true) {
  return useQuery({ queryKey: peopleKeys.replies(id ?? ''), queryFn: () => fetchUserReplies(id ?? ''), enabled: enabled && Boolean(id) });
}

export function useFollowedUsers(viewerId: string | null) {
  return useQuery({ queryKey: peopleKeys.followed(viewerId), queryFn: () => fetchFollowedUsers(viewerId ?? ''), enabled: Boolean(viewerId), staleTime: 60_000 });
}

/** Follow or unfollow a person; their follower count moves at once. */
export function useFollowUser(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; on: boolean }) => setUserFollow(v.userId, viewerId ?? '', v.on),
    onMutate: async ({ userId, on }) => {
      const key = peopleKeys.followed(viewerId);
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Set<string>>(key);
      const next = new Set(before ?? []);
      if (on) next.add(userId);
      else next.delete(userId);
      qc.setQueryData(key, next);
      const people = qc.getQueriesData<PublicProfile | null>({ queryKey: ['person'] });
      for (const [k, p] of people) {
        if (p && p.id === userId) qc.setQueryData(k, { ...p, follower_count: Math.max(0, p.follower_count + (on ? 1 : -1)) });
      }
      return { before, people };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData(peopleKeys.followed(viewerId), ctx.before);
      for (const [k, p] of ctx.people) qc.setQueryData(k, p);
    },
  });
}

export function useManaged(viewerId: string | null, enabled = true) {
  return useQuery({ queryKey: peopleKeys.managed(viewerId), queryFn: () => fetchManaged(viewerId ?? ''), enabled: enabled && Boolean(viewerId) });
}

export function usePeopleSearch(q: string) {
  const term = q.trim();
  return useQuery({ queryKey: peopleKeys.search(term), queryFn: () => searchPeople(term), enabled: term.length >= 2, staleTime: 30_000 });
}
