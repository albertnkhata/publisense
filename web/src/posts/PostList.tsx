import { useEffect, useRef, type ReactNode } from 'react';
import type { Post } from '../api';
import { Button, EmptyState, Skeleton, Spinner } from '../ui';
import { PostCard } from './PostCard';

/**
 * A list of PostCards that loads the next page as its end nears (an
 * IntersectionObserver sentinel 600px ahead, mockup value), with "Show more"
 * when the observer is missing and a retry when a page fails. Shared by the
 * home feed, board pages and hub pages.
 */
export interface PostListProps {
  posts: Post[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: () => unknown;
  label?: string;
  /** Shown after the last page. */
  endText?: ReactNode;
  /** Board pages: leave the board crumb off each card. */
  hideBoard?: boolean;
}

export function PostList({ posts, hasNextPage, isFetchingNextPage, isError, fetchNextPage, label = 'Posts', endText = 'You’re all caught up', hideBoard = false }: PostListProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const canObserve = typeof window !== 'undefined' && 'IntersectionObserver' in window;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canObserve || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage && !isError) void fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canObserve, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label={label}>
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} hideBoard={hideBoard} />
          </li>
        ))}
      </ul>
      {hasNextPage ? (
        <div ref={sentinel} className="flex justify-center pt-4 pb-2">
          {isFetchingNextPage ? (
            <span role="status" aria-label="Loading more posts" className="text-ink-muted">
              <Spinner />
            </span>
          ) : isError ? (
            <Button variant="secondary" size="sm" onClick={() => void fetchNextPage()}>
              Couldn’t load more. Try again
            </Button>
          ) : !canObserve ? (
            <Button variant="secondary" size="sm" onClick={() => void fetchNextPage()}>
              Show more
            </Button>
          ) : null}
        </div>
      ) : endText ? (
        <p className="m-0 pt-2 pb-6 text-center text-sm text-ink-muted">{endText}</p>
      ) : null}
    </>
  );
}

/**
 * Placeholder cards while a feed loads: one status for the whole list (never
 * painted, see Skeleton) and decorative cards, so first paint shows only
 * skeletons and no "Loading" text (#158).
 */
export function PostListSkeleton({ count = 3, label = 'Loading posts' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} label={null} />
      ))}
    </div>
  );
}

/** A bordered "couldn't load" block with Try again. */
export function LoadError({ title, onRetry, retrying }: { title: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-card">
      <EmptyState
        icon="flag"
        title={title}
        action={
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        }
      >
        Check your connection, then try again.
      </EmptyState>
    </div>
  );
}
