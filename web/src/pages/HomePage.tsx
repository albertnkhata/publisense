import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { isLive, isProductFamily, useBoards, useFollowedScopes, useHubs, useTrending, type Board, type Hub } from '../api';
import {
  CategoriesSection,
  DiscoveryBoardsSection,
  HubsSection,
  PopularPostsSection,
  RecentlyAddedSection,
  YourProductsSection,
} from '../discovery/DiscoverySections';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { LoadError } from '../posts/PostList';
import { AddProductLink } from '../products/AddProductDialog';
import { SearchWell } from '../shell/SearchWell';
import { SkeletonBlock } from '../ui';
import { LandingPage } from './LandingPage';

/**
 * Home (`/`): signed-out visitors see LandingPage; signed-in members see the
 * unified discovery directory (Search, Your products when following ≥1 board
 * or hub, Trending, Popular posts by status, Recently added, Hubs, Categories,
 * and Add a product).
 * Legacy `/?scope=following` links redirect to `/feed?scope=following`.
 */
export function HomePage() {
  const { viewer, ready } = useViewer();
  const [params] = useSearchParams();

  if (params.get('scope') === 'following') {
    const next = new URLSearchParams(params);
    next.set('scope', 'following');
    return <Navigate to={`/feed?${next.toString()}`} replace />;
  }

  if (!viewer) {
    return ready ? <LandingPage /> : null;
  }

  return <SignedInHome viewerId={viewer.id} />;
}

function SignedInHome({ viewerId }: { viewerId: string }) {
  usePageTitle(null);
  const boards = useBoards();
  const hubs = useHubs();
  const follows = useFollowedScopes(viewerId);

  const liveBoards = useMemo(() => (boards.data ?? []).filter(isLive), [boards.data]);
  const liveHubs = useMemo(() => (hubs.data ?? []).filter((h) => isProductFamily(h.boards.length)), [hubs.data]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <h1 id="page-title" className="sr-only">
        Home
      </h1>
      <SearchWell className="mb-6" triggerClassName="h-9 border-line-strong text-md" />
      {boards.isPending || hubs.isPending ? (
        <HomeSkeleton />
      ) : boards.isError || hubs.isError ? (
        <LoadError
          title="We couldn’t load the products"
          onRetry={() => {
            void boards.refetch();
            void hubs.refetch();
          }}
          retrying={boards.isRefetching || hubs.isRefetching}
        />
      ) : (
        <Discover boards={liveBoards} hubs={liveHubs} followed={follows.data} />
      )}
      {boards.isSuccess && hubs.isSuccess ? <MissingProduct /> : null}
    </section>
  );
}

function Discover({ boards, hubs, followed }: { boards: Board[]; hubs: Hub[]; followed: Set<string> | undefined }) {
  const trending = useTrending(boards, 6);
  const now = useMemo(() => new Date(), []);

  return (
    <>
      <YourProductsSection id="home-your-products" boards={boards} hubs={hubs} followed={followed} />
      <DiscoveryBoardsSection id="home-trending" boards={boards} trending={trending.data ?? []} now={now} />
      <PopularPostsSection id="home-popular" />
      <RecentlyAddedSection id="home-recent" boards={boards} trending={trending.data ?? []} now={now} />
      <HubsSection id="home-hubs" hubs={hubs} />
      <CategoriesSection id="home-categories" boards={boards} />
    </>
  );
}

/** Bottom of Home: the way to add a product that isn't here yet. */
function MissingProduct() {
  return (
    <p className="m-0 rounded-md border border-dashed border-line-strong bg-card px-4 py-4 text-center text-base text-ink-secondary">
      Can’t find a product you use? <AddProductLink>Add it</AddProductLink>
    </p>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="h-3 w-1/5" />
        </div>
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="size-9 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <SkeletonBlock className="h-3 w-1/2" />
                  <SkeletonBlock className="h-3 w-3/4" />
                </div>
              </div>
              <SkeletonBlock className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <SkeletonBlock className="h-4 w-1/4" />
          <SkeletonBlock className="h-3 w-1/4" />
        </div>
        <div className="divide-y divide-line rounded-md border border-line bg-card px-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-3">
              <SkeletonBlock className="size-7 rounded-sm" />
              <div className="flex flex-1 flex-col gap-2">
                <SkeletonBlock className="h-3 w-2/5" />
                <SkeletonBlock className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
