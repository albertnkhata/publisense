import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { isLive, isProductFamily, useBoards, useHubs, useTrending } from '../api';
import { useClaim } from '../claim/ClaimDialog';
import { CategoriesSection, DiscoveryBoardsSection, HubsSection, PopularPostsSection, RecentlyAddedSection } from '../discovery/DiscoverySections';
import { usePageTitle } from '../lib/usePageTitle';
import { LoadError } from '../posts/PostList';
import { BrandSymbol } from '../shell/BrandMark';
import { SearchWell } from '../shell/SearchWell';
import { useAuthDialog } from '../shell/auth';
import { useComposer } from '../shell/composer';
import { Button, SkeletonBlock } from '../ui';

/**
 * Signed-out Landing Header: sticky brand mark, scroll-revealed compact search
 * trigger, and Sign in. No Explore link (this surface IS discovery).
 */
export function LandingHeader() {
  const { openAuth } = useAuthDialog();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setScrolled(false);
    if (typeof IntersectionObserver !== 'function') return;
    const target = document.getElementById('hero-search-anchor');
    if (!target) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setScrolled(!entry.isIntersecting);
      },
      { rootMargin: '-54px 0px 0px 0px', threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-glass backdrop-blur-md">
      <div className="mx-auto flex h-9 w-full max-w-landing items-center gap-4 px-7 max-sm:gap-2 max-sm:px-3">
        <Link to="/" aria-label="Publisense home" className="flex shrink-0 items-center gap-2 text-md font-bold text-ink no-underline">
          <BrandSymbol />
          <span>Publisense</span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-center max-md:hidden">
          {scrolled ? (
            <SearchWell
              className="max-w-dialog"
              triggerClassName="h-7 rounded-pill text-sm"
            />
          ) : null}
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => openAuth('signin')}>
            Sign in
          </Button>
        </span>
      </div>
    </header>
  );
}

/**
 * Signed-out Landing Footer: legal links and copyright.
 */
export function LandingFooter() {
  return (
    <footer aria-label="Site footer" className="border-t border-line py-6">
      <div className="mx-auto flex w-full max-w-wide flex-wrap items-center justify-center gap-4 px-6 text-sm text-ink-muted max-sm:px-3">
        <nav aria-label="Footer links" className="flex flex-wrap items-center gap-4">
          <Link to="/about" className="text-ink-muted no-underline transition-colors duration-120 hover:text-ink">
            About
          </Link>
          <Link to="/terms" className="text-ink-muted no-underline transition-colors duration-120 hover:text-ink">
            Terms
          </Link>
          <Link to="/privacy" className="text-ink-muted no-underline transition-colors duration-120 hover:text-ink">
            Privacy
          </Link>
        </nav>
        <span>© 2026 Publisense</span>
      </div>
    </footer>
  );
}

/**
 * Signed-out `/` discovery landing page.
 */
export function LandingPage() {
  usePageTitle(null);
  const { openClaim } = useClaim();
  const { openComposer } = useComposer();
  const boards = useBoards();
  const hubs = useHubs();
  const now = useMemo(() => new Date(), []);

  const liveBoards = useMemo(() => (boards.data ?? []).filter(isLive), [boards.data]);
  const liveHubs = useMemo(() => (hubs.data ?? []).filter((h) => isProductFamily(h.boards.length)), [hubs.data]);
  const trending = useTrending(liveBoards, 6);

  return (
    <div className="flex flex-col">
      <section
        aria-labelledby="page-title"
        className="relative isolate mb-8 overflow-hidden rounded-lg border border-line hero-glow px-6 py-9 max-sm:px-4 max-sm:py-7"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hero-dots" />
        <div className="mx-auto flex w-full flex-col items-center text-center">
          <h1 id="page-title" className="m-0 max-w-hero text-hero font-bold text-balance text-ink">
            Find any product. Shape what ships next.
          </h1>
          <p className="mt-3 mb-6 max-w-hero text-md text-balance text-ink-secondary">
            Public feedback boards for the products you use. Report issues, upvote requests, and follow updates in one place.
          </p>
          <div id="hero-search-anchor" className="w-full max-w-dialog-lg">
            <SearchWell triggerClassName="h-9 border-line-strong text-md" />
          </div>
          <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-2 rounded-pill border border-line bg-card px-4 py-2 text-sm text-ink-secondary">
            <span>Have feedback on a product?</span>
            <button
              type="button"
              onClick={() => openComposer()}
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand hover:underline"
            >
              Post it →
            </button>
          </div>
        </div>
      </section>

      <div className="flex w-full flex-col">
        {boards.isPending || hubs.isPending ? (
          <div className="mb-6 grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1" aria-busy="true">
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
        ) : boards.isError || hubs.isError ? (
          <div className="mb-6">
            <LoadError
              title="We couldn’t load the products"
              onRetry={() => {
                void boards.refetch();
                void hubs.refetch();
              }}
              retrying={boards.isRefetching || hubs.isRefetching}
            />
          </div>
        ) : (
          <DiscoveryBoardsSection
            boards={liveBoards}
            trending={trending.data ?? []}
            now={now}
            showMostActiveFallback
          />
        )}

        <PopularPostsSection />

        <section
          aria-labelledby="landing-claim-title"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-subtle px-6 py-5 max-sm:px-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="landing-claim-title" className="m-0 text-md font-semibold text-ink">
              Building one of these products?
            </h2>
            <p className="m-0 text-base text-ink-secondary">
              Claim its board for free to reply as the verified team, set statuses and show what shipped.
            </p>
          </div>
          <Button variant="secondary" onClick={() => openClaim()}>
            Claim your product
          </Button>
        </section>

        {boards.isSuccess && hubs.isSuccess ? (
          <>
            <RecentlyAddedSection id="landing-recent" boards={liveBoards} trending={trending.data ?? []} now={now} />
            <HubsSection hubs={liveHubs} />
            <CategoriesSection boards={liveBoards} />
          </>
        ) : null}
      </div>
    </div>
  );
}
