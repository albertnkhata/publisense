import { Link } from 'react-router';
import { usePageTitle } from '../lib/usePageTitle';
import { EmptyState } from '../ui';

export function NotFound() {
  usePageTitle('Page not found');
  return (
    <section aria-labelledby="page-title" className="rounded-md border border-line bg-card">
      {/* React 19 hoists this into <head>: keep missing boards/posts out of search results. */}
      <meta name="robots" content="noindex" />
      <h1 id="page-title" className="sr-only">
        Page not found
      </h1>
      <EmptyState
        icon="search"
        title="This page doesn’t exist"
        action={
          <Link
            to="/"
            className="inline-flex h-8 items-center rounded-md bg-brand px-4 text-base font-semibold text-on-brand no-underline hover:bg-brand-hover"
          >
            Go home
          </Link>
        }
      >
        The link may be broken, or the page may have moved.
      </EmptyState>
    </section>
  );
}
