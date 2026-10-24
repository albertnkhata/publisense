import { forwardRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { cx } from '../lib/cx';
import { Icon } from '../ui';

/**
 * The search field used in the right rail and the top bar. Submitting goes to
 * /search?q=… (the SearchPopover with quick results arrives in step 6).
 */
export const SearchWell = forwardRef<HTMLInputElement, { className?: string; onSubmitted?: () => void }>(function SearchWell(
  { className, onSubmitted },
  ref,
) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
    onSubmitted?.();
  };
  return (
    <form role="search" onSubmit={submit} className={cx('w-full', className)}>
      <label className="flex h-8 cursor-text items-center gap-3 rounded-md border border-line bg-card px-3 text-ink-muted transition-colors duration-120 focus-within:border-line-strong">
        <Icon name="search" size={15} />
        <input
          ref={ref}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products, posts, people"
          aria-label="Search products, posts and people"
          className="w-full min-w-0 appearance-none border-0 bg-transparent text-base text-ink outline-none focus-visible:outline-none max-md:text-md"
        />
      </label>
    </form>
  );
});
