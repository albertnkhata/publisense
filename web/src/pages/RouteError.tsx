import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { reportError } from '../lib/monitoring';
import { usePageTitle } from '../lib/usePageTitle';
import { BrandSymbol } from '../shell/BrandMark';
import { Button, EmptyState } from '../ui';

const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i;

function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return CHUNK_ERROR_RE.test(msg);
}

/**
 * Branded route error boundary for React Router. Replaces the default
 * "Unexpected Application Error!" screen on runtime errors or stale deploy
 * chunk loads with a recovery page matching Publisense's theme.
 */
export function RouteError() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const staleChunk = !is404 && isChunkError(error);

  usePageTitle(is404 ? 'Page not found' : staleChunk ? 'Update available' : 'Something went wrong');

  useEffect(() => {
    if (!is404 && !staleChunk && error) {
      reportError(error);
    }
  }, [error, is404, staleChunk]);

  const title = is404
    ? 'This page doesn’t exist'
    : staleChunk
      ? 'A new version of Publisense is available'
      : 'Something went wrong';

  const description = is404
    ? 'The link may be broken, or the page may have moved.'
    : staleChunk
      ? 'Reload the page to load the latest version.'
      : 'An unexpected error happened. Reloading usually fixes it.';

  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink">
      <meta name="robots" content="noindex" />
      <header className="flex h-9 w-full shrink-0 items-center border-b border-line bg-glass px-4 backdrop-blur-md">
        <a href="/" aria-label="Publisense home" className="flex items-center gap-2 text-lg font-bold text-ink no-underline">
          <BrandSymbol />
          <span>Publisense</span>
        </a>
      </header>
      <main className="mx-auto flex w-full max-w-content flex-1 flex-col justify-center px-4 py-10">
        <section aria-labelledby="page-title" className="rounded-md border border-line bg-card">
          <h1 id="page-title" className="sr-only">
            {title}
          </h1>
          <EmptyState
            icon={is404 ? 'search' : 'flag'}
            title={title}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!is404 ? (
                  <Button onClick={() => window.location.reload()}>Reload page</Button>
                ) : null}
                <a
                  href="/"
                  className="inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-4 text-base font-semibold text-ink no-underline transition-colors duration-120 hover:bg-subtle"
                >
                  Go home
                </a>
              </div>
            }
          >
            {description}
          </EmptyState>
        </section>
      </main>
    </div>
  );
}
