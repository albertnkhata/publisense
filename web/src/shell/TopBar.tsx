import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { Button, IconButton } from '../ui';
import { BrandSymbol } from './BrandMark';
import { SearchWell } from './SearchWell';

/**
 * Top bar below lg, where the right rail (and its search) is hidden.
 * At sm the search collapses behind an icon and expands with a Cancel.
 */
export function TopBar() {
  const { viewer } = useViewer();
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  return (
    <header className="sticky top-0 z-20 hidden h-9 items-center gap-3 border-b border-line bg-glass px-5 backdrop-blur-md max-lg:flex max-sm:px-3">
      <Link
        to="/"
        aria-label="Publisense home"
        className={cx('hidden items-center gap-2 text-md font-bold text-ink no-underline', !searching && 'max-sm:flex')}
      >
        <BrandSymbol />
        <span>Publisense</span>
      </Link>
      <SearchWell
        ref={inputRef}
        onSubmitted={() => setSearching(false)}
        className={cx('max-w-dialog flex-1', searching ? 'max-sm:block max-sm:max-w-none' : 'max-sm:hidden')}
      />
      {searching ? (
        <button
          type="button"
          onClick={() => setSearching(false)}
          className="hidden border-0 bg-transparent px-1 text-base font-medium text-ink-secondary max-sm:block"
        >
          Cancel
        </button>
      ) : null}
      <span className={cx('ml-auto flex items-center gap-2', searching && 'max-sm:hidden')}>
        <span className="hidden max-sm:contents">
          <IconButton icon="search" label="Search" onClick={() => setSearching(true)} />
        </span>
        {!viewer ? (
          <Button size="sm" disabled>
            Sign in
          </Button>
        ) : null}
      </span>
    </header>
  );
}
