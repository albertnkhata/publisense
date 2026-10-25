import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import {
  createReply,
  deletePost,
  deleteReply,
  fetchFeed,
  fetchPost,
  fetchPostTitle,
  fetchRelated,
  fetchReplies,
  fetchStatusEvents,
  setPostFollow,
  setVote,
  updatePost,
  editSeededPost,
  deleteSeededPost,
  type SeededDraft,
  updateReply,
  type FeedPage,
  type FeedScope,
  type FeedSort,
  type Post,
  type PostDraft,
  type Reply,
} from './posts';

/*
 * TanStack Query hooks for step 5. Every cache that holds a Post lives under
 * ['posts', …] so one helper can patch a post wherever it is shown (feed pages,
 * the post page) for optimistic votes, follows and edits, and roll it back.
 */

export const postKeys = {
  all: ['posts'] as const,
  feed: (scope: FeedScope, sort: FeedSort, viewerId: string | null) => ['posts', 'feed', scope, sort, viewerId ?? 'anon'] as const,
  detail: (id: string, viewerId: string | null) => ['posts', 'detail', id, viewerId ?? 'anon'] as const,
  related: (boardId: string, id: string) => ['related', boardId, id] as const,
  title: (id: string) => ['post-title', id] as const,
  replies: (postId: string) => ['replies', postId] as const,
  status: (postId: string) => ['status_events', postId] as const,
};

type PostCache = InfiniteData<FeedPage, number> | Post | Post[] | { posts: Post[] } | null | undefined;

function isInfinite(v: PostCache): v is InfiniteData<FeedPage, number> {
  return Boolean(v && typeof v === 'object' && 'pages' in v);
}

/** Apply `fn` to post `id` in every cached feed page, post list and post page. `fn` returning null removes it from feeds. */
export function patchPost(qc: QueryClient, id: string, fn: (p: Post) => Post | null) {
  qc.setQueriesData<PostCache>({ queryKey: postKeys.all }, (old) => {
    if (!old) return old;
    if (isInfinite(old)) {
      let changed = false;
      const pages = old.pages.map((page) => {
        if (!page.items.some((p) => p.id === id)) return page;
        changed = true;
        const items: Post[] = [];
        for (const p of page.items) {
          if (p.id !== id) items.push(p);
          else {
            const next = fn(p);
            if (next) items.push(next);
          }
        }
        return { ...page, items };
      });
      return changed ? { ...old, pages } : old;
    }
    const patchList = (list: Post[]) =>
      list.some((p) => p.id === id)
        ? list.flatMap((p) => {
            if (p.id !== id) return [p];
            const next = fn(p);
            return next ? [next] : [];
          })
        : list;
    // Plain lists (the composer's similar posts) and search results ({ posts }).
    if (Array.isArray(old)) return patchList(old);
    if ('posts' in old && Array.isArray(old.posts)) {
      const posts = patchList(old.posts);
      return posts === old.posts ? old : { ...old, posts };
    }
    if ('id' in old && old.id === id) return fn(old);
    return old;
  });
}

type Snapshot = Array<[readonly unknown[], unknown]>;

async function snapshotPosts(qc: QueryClient): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: postKeys.all });
  return qc.getQueriesData({ queryKey: postKeys.all });
}

function restore(qc: QueryClient, snap: Snapshot | undefined) {
  for (const [key, data] of snap ?? []) qc.setQueryData(key, data);
}

// ------------------------------------------------------------------ reads

export function useFeed(scope: FeedScope, sort: FeedSort, viewerId: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: postKeys.feed(scope, sort, viewerId),
    queryFn: ({ pageParam }) => fetchFeed({ scope, sort, offset: pageParam, viewerId }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled,
  });
}

export function usePost(id: string | undefined, viewerId: string | null) {
  return useQuery({
    queryKey: postKeys.detail(id ?? '', viewerId),
    queryFn: () => fetchPost(id ?? '', viewerId),
    enabled: Boolean(id),
  });
}

export function useRelated(boardId: string | undefined, id: string) {
  return useQuery({
    queryKey: postKeys.related(boardId ?? '', id),
    queryFn: () => fetchRelated(boardId ?? '', id),
    enabled: Boolean(boardId),
    staleTime: 60_000,
  });
}

export function usePostTitle(id: string | null | undefined) {
  return useQuery({ queryKey: postKeys.title(id ?? ''), queryFn: () => fetchPostTitle(id ?? ''), enabled: Boolean(id) });
}

export function useReplies(postId: string | undefined) {
  return useQuery({ queryKey: postKeys.replies(postId ?? ''), queryFn: () => fetchReplies(postId ?? ''), enabled: Boolean(postId) });
}

export function useStatusEvents(postId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: postKeys.status(postId ?? ''),
    queryFn: () => fetchStatusEvents(postId ?? ''),
    enabled: Boolean(postId) && enabled,
  });
}

// ------------------------------------------------------------------ votes and follows

/**
 * Optimistic upvote: the count and state flip at once and roll back if the write
 * is refused. Upvoting also follows the post (the DB trigger does the same).
 */
export function useVote(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ post, on }: { post: Post; on: boolean }) => setVote(post.id, viewerId ?? '', on),
    onMutate: async ({ post, on }) => {
      const snap = await snapshotPosts(qc);
      patchPost(qc, post.id, (p) => ({
        ...p,
        voted: on,
        vote_count: Math.max(0, p.vote_count + (on ? 1 : -1)),
        following: on ? true : p.following,
      }));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
  });
}

export function useFollowPost(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ post, on }: { post: Post; on: boolean }) => setPostFollow(post.id, viewerId ?? '', on),
    onMutate: async ({ post, on }) => {
      const snap = await snapshotPosts(qc);
      patchPost(qc, post.id, (p) => ({ ...p, following: on }));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
  });
}

// ------------------------------------------------------------------ author edit and delete

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: PostDraft }) => updatePost(id, draft),
    onSuccess: (saved) => {
      patchPost(qc, saved.id, (p) => ({ ...p, ...saved }));
      void qc.invalidateQueries({ queryKey: ['related'] });
    },
  });
}

/** Staff correcting a seeded post (no author): source link and original date too (0031). */
export function useEditSeededPost(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: SeededDraft }) => editSeededPost(id, draft, viewerId),
    onSuccess: (saved) => {
      const { type, title, body, platform, source_url, source_author, created_at, edited_at } = saved;
      patchPost(qc, saved.id, (p) => ({ ...p, type, title, body, platform, source_url, source_author, created_at, edited_at }));
      // A new original date can move it in date-sorted lists.
      void qc.invalidateQueries({ queryKey: ['posts', 'feed'] });
      void qc.invalidateQueries({ queryKey: ['posts', 'list'] });
      void qc.invalidateQueries({ queryKey: ['related'] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: string | { id: string; seeded: true }) => (typeof v === 'string' ? deletePost(v) : deleteSeededPost(v.id)),
    onSuccess: (_d, v) => {
      const id = typeof v === 'string' ? v : v.id;
      // Drop it from every feed; the post page shows "not found" if it is still open.
      patchPost(qc, id, () => null);
      qc.setQueriesData<PostCache>({ queryKey: ['posts', 'detail', id] }, () => null);
      qc.removeQueries({ queryKey: postKeys.replies(id) });
      void qc.invalidateQueries({ queryKey: ['related'] });
    },
  });
}

// ------------------------------------------------------------------ replies

export function useCreateReply(post: Post | null | undefined, viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, parentId, official = false }: { body: string; parentId: string | null; official?: boolean }) => {
      const reply = await createReply(post?.id ?? '', body, parentId, official);
      // Replying follows the post (mockup). Best effort: the reply already landed.
      let followed = false;
      if (post && viewerId && !post.following) {
        try {
          await setPostFollow(post.id, viewerId, true);
          followed = true;
        } catch {
          /* keep the reply; following can be done from the menu */
        }
      }
      return { reply, followed };
    },
    onSuccess: ({ reply, followed }) => {
      qc.setQueryData<Reply[]>(postKeys.replies(reply.post_id), (old) => [...(old ?? []), reply]);
      patchPost(qc, reply.post_id, (p) => ({
        ...p,
        reply_count: p.reply_count + 1,
        following: followed ? true : p.following,
        // An official reply is quoted on the card straight away.
        official: reply.is_official && !reply.parent_id ? { id: reply.id, body: reply.body, created_at: reply.created_at, author: reply.author } : p.official,
      }));
    },
  });
}

export function useUpdateReply(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => updateReply(id, body),
    onSuccess: (saved) => {
      qc.setQueryData<Reply[]>(postKeys.replies(postId), (old) => (old ?? []).map((r) => (r.id === saved.id ? { ...r, ...saved } : r)));
    },
  });
}

export function useDeleteReply(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReply(id),
    onSuccess: (_d, id) => {
      let removed = 0;
      qc.setQueryData<Reply[]>(postKeys.replies(postId), (old) => {
        const next = (old ?? []).filter((r) => r.id !== id && r.parent_id !== id);
        removed = (old ?? []).length - next.length;
        return next;
      });
      patchPost(qc, postId, (p) => ({ ...p, reply_count: Math.max(0, p.reply_count - Math.max(removed, 1)) }));
    },
  });
}
