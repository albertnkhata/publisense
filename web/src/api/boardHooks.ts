import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBoard,
  fetchBoards,
  fetchFollowedScopes,
  fetchHub,
  fetchHubs,
  fetchIsBoardTeam,
  fetchPostCounts,
  fetchTrending,
  followKey,
  searchAll,
  setScopeFollow,
  SEARCH_MIN,
  type Board,
  type FollowTarget,
  type Hub,
} from './boards';
import { createPost, seedPost, fetchChangelog, fetchPostList, fetchRoadmap, fetchSimilar, fetchWanted, type NewPost, type PostListParams, type SeedPost } from './posts';
import { postKeys } from './postHooks';

/*
 * TanStack Query hooks for step 6. Lists that hold full Post objects (board and
 * hub feeds, similar posts) live under ['posts', …] so votes and edits patch
 * them through patchPost like the home feed.
 */

export const boardKeys = {
  boards: ['boards'] as const,
  board: (slug: string) => ['board', slug] as const,
  hubs: ['hubs'] as const,
  hub: (slug: string) => ['hub', slug] as const,
  counts: (ids: string[]) => ['post-counts', ids.join(',')] as const,
  roadmap: (ids: string[]) => ['roadmap', ids.join(',')] as const,
  changelog: (ids: string[]) => ['changelog', ids.join(',')] as const,
  trending: ['trending'] as const,
  wanted: ['wanted'] as const,
  team: (boardId: string, viewerId: string | null) => ['board-team', boardId, viewerId ?? 'anon'] as const,
  follows: (viewerId: string | null) => ['scope-follows', viewerId ?? 'anon'] as const,
};

export function useBoards() {
  return useQuery({ queryKey: boardKeys.boards, queryFn: fetchBoards, staleTime: 60_000 });
}

export function useBoard(slug: string | undefined) {
  return useQuery({ queryKey: boardKeys.board(slug ?? ''), queryFn: () => fetchBoard(slug ?? ''), enabled: Boolean(slug) });
}

export function useHubs() {
  return useQuery({ queryKey: boardKeys.hubs, queryFn: fetchHubs, staleTime: 60_000 });
}

export function useHub(slug: string | undefined) {
  return useQuery({ queryKey: boardKeys.hub(slug ?? ''), queryFn: () => fetchHub(slug ?? ''), enabled: Boolean(slug) });
}

export function usePostCounts(boardIds: string[]) {
  return useQuery({ queryKey: boardKeys.counts(boardIds), queryFn: () => fetchPostCounts(boardIds), enabled: boardIds.length > 0 });
}

export function useRoadmap(boardIds: string[], enabled = true) {
  return useQuery({ queryKey: boardKeys.roadmap(boardIds), queryFn: () => fetchRoadmap(boardIds), enabled: enabled && boardIds.length > 0 });
}

export function useChangelog(boardIds: string[], enabled = true) {
  return useQuery({ queryKey: boardKeys.changelog(boardIds), queryFn: () => fetchChangelog(boardIds), enabled: enabled && boardIds.length > 0 });
}

export function useTrending(boards: Board[] | undefined, limit = 4) {
  return useQuery({
    queryKey: [...boardKeys.trending, limit],
    queryFn: () => fetchTrending(boards ?? [], limit),
    enabled: Boolean(boards && boards.length),
    staleTime: 5 * 60_000,
  });
}

export function useWanted(enabled = true) {
  return useQuery({ queryKey: boardKeys.wanted, queryFn: () => fetchWanted(), enabled, staleTime: 60_000 });
}

export function useIsBoardTeam(boardId: string | undefined, viewerId: string | null) {
  return useQuery({
    queryKey: boardKeys.team(boardId ?? '', viewerId),
    queryFn: () => fetchIsBoardTeam(boardId ?? ''),
    enabled: Boolean(boardId && viewerId),
    staleTime: 5 * 60_000,
  });
}

/** A board's or hub's feed; keyed under ['posts'] so optimistic votes reach it. */
export function usePostList(params: Omit<PostListParams, 'offset'>, enabled = true) {
  const { boardIds, type = 'all', status = 'all', platform = 'all', sort, viewerId, excludeClosed = false } = params;
  const q = params.q?.trim() ?? '';
  return useInfiniteQuery({
    queryKey: ['posts', 'list', boardIds.join(','), type, status, platform, sort, excludeClosed, viewerId ?? 'anon', q],
    queryFn: ({ pageParam }) => fetchPostList({ boardIds, type, status, platform, sort, offset: pageParam, viewerId, excludeClosed, ...(q ? { q } : {}) }),
    placeholderData: q ? keepPreviousData : undefined,
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: enabled && boardIds.length > 0,
  });
}

// ------------------------------------------------------------------ following

export function useFollowedScopes(viewerId: string | null) {
  return useQuery({
    queryKey: boardKeys.follows(viewerId),
    queryFn: () => fetchFollowedScopes(viewerId ?? ''),
    enabled: Boolean(viewerId),
    staleTime: 60_000,
  });
}

/** Is `target:id` followed? False while signed out or loading. */
export function useIsFollowing(viewerId: string | null, target: FollowTarget, id: string | undefined): boolean {
  const follows = useFollowedScopes(viewerId);
  return Boolean(id && follows.data?.has(followKey(target, id)));
}

function bump<T extends { id: string; follower_count: number }>(row: T, id: string, d: number): T {
  return row.id === id ? { ...row, follower_count: Math.max(0, row.follower_count + d) } : row;
}

/** Optimistic follow / unfollow of a board or hub; the follower count moves with it. */
export function useScopeFollow(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, id, on }: { target: FollowTarget; id: string; on: boolean }) => setScopeFollow(target, id, viewerId ?? '', on),
    onMutate: async ({ target, id, on }) => {
      const key = boardKeys.follows(viewerId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Set<string>>(key);
      const next = new Set(prev ?? []);
      if (on) next.add(followKey(target, id));
      else next.delete(followKey(target, id));
      qc.setQueryData(key, next);
      const d = on ? 1 : -1;
      // Counts shown in headers and lists.
      const snapshots = [
        ...qc.getQueriesData({ queryKey: ['board'] }),
        ...qc.getQueriesData({ queryKey: ['hub'] }),
        ...qc.getQueriesData({ queryKey: boardKeys.boards }),
        ...qc.getQueriesData({ queryKey: boardKeys.hubs }),
      ];
      if (target === 'board') {
        qc.setQueriesData<Board | null>({ queryKey: ['board'] }, (b) => (b ? bump(b, id, d) : b));
        qc.setQueriesData<Board[]>({ queryKey: boardKeys.boards }, (list) => list?.map((b) => bump(b, id, d)));
        qc.setQueriesData<Hub | null>({ queryKey: ['hub'] }, (h) => (h ? { ...h, boards: h.boards.map((b) => bump(b, id, d)) } : h));
      } else {
        qc.setQueriesData<Hub | null>({ queryKey: ['hub'] }, (h) => (h ? bump(h, id, d) : h));
        qc.setQueriesData<Hub[]>({ queryKey: boardKeys.hubs }, (list) => list?.map((h) => bump(h, id, d)));
      }
      return { key, prev, snapshots };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData(ctx.key, ctx.prev);
      for (const [k, v] of ctx.snapshots) qc.setQueryData(k, v);
    },
    onSuccess: () => {
      // The Following feed covers followed boards and hubs.
      void qc.invalidateQueries({ queryKey: ['posts', 'feed', 'following'] });
    },
  });
}

// ------------------------------------------------------------------ search and composer

/** Search results; keyed under ['posts'] because they hold full posts that votes patch. */
export function useSearch(q: string, viewerId: string | null, opts: { postLimit?: number } = {}) {
  const term = q.trim();
  const boards = useBoards();
  const hubs = useHubs();
  return useQuery({
    queryKey: ['posts', 'search', term.toLowerCase(), opts.postLimit ?? 30, viewerId ?? 'anon'],
    queryFn: () => searchAll(term, { postLimit: opts.postLimit ?? 30, boards: boards.data, hubs: hubs.data, viewerId }),
    enabled: term.length >= SEARCH_MIN && boards.isSuccess && hubs.isSuccess,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useSimilarPosts(title: string, boardIds: string[], viewerId: string | null) {
  const t = title.trim();
  return useQuery({
    queryKey: ['posts', 'similar', boardIds.join(','), t.toLowerCase(), viewerId ?? 'anon'],
    queryFn: () => fetchSimilar(t, boardIds, viewerId),
    enabled: t.length >= 8 && boardIds.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreatePost(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: NewPost | SeedPost) => ('sourceUrl' in d ? seedPost(d, viewerId) : createPost(d, viewerId)),
    onSuccess: (post) => {
      qc.setQueryData(postKeys.detail(post.id, viewerId), post);
      // New posts show up in every feed, count and list that could hold them.
      void qc.invalidateQueries({ queryKey: ['posts', 'feed'] });
      void qc.invalidateQueries({ queryKey: ['posts', 'list'] });
      void qc.invalidateQueries({ queryKey: ['post-counts'] });
      void qc.invalidateQueries({ queryKey: boardKeys.wanted });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: boardKeys.boards });
    },
  });
}
