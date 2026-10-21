import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';

/**
 * The router used to answer every unknown path with a redirect to the homepage. A
 * link that is shared, mistyped or stale therefore looked like the front page of a
 * working site rather than a dead end, which hides exactly the kind of breakage
 * worth reporting. This says what happened and offers a way back.
 */
export const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-4">
        <Compass className="w-4 h-4" />
        <span className="mono text-xs tracking-wider uppercase">404 · page not found</span>
      </div>

      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
        That page does not exist.
      </h1>

      <p className="text-zinc-600 dark:text-zinc-400 mb-8">
        The link may be mistyped, or whatever used to be here may have moved. Nothing has
        been hidden from you — this address simply does not resolve.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold no-underline hover:opacity-90"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to the index
        </Link>
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold no-underline hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Browse products
        </Link>
      </div>
    </div>
  );
};
