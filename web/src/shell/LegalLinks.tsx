import { Link } from 'react-router';
import { cx } from '../lib/cx';

const linkClass = 'text-xs text-ink-muted no-underline hover:text-ink';

/**
 * Terms · Privacy · ©. Lives at the foot of the right rail (above lg) and in
 * the TabBar's "You" sheet at sm; signed-in viewers also reach both from the
 * UserMenu. `inline` puts the © on the same row, for the rail's foot.
 */
export function LegalLinks({ inline = false, className }: { inline?: boolean; className?: string }) {
  return (
    <footer aria-label="Legal" className={cx('px-2', inline && 'flex flex-wrap items-baseline gap-x-3 gap-y-1', className)}>
      <nav aria-label="Legal links" className="flex flex-wrap gap-x-3 gap-y-1">
        <Link to="/terms" className={linkClass}>
          Terms
        </Link>
        <Link to="/privacy" className={linkClass}>
          Privacy
        </Link>
      </nav>
      <p className={cx('mb-0 text-xs text-ink-muted', inline ? 'mt-0' : 'mt-2')}>© 2026 Publisense</p>
    </footer>
  );
}
