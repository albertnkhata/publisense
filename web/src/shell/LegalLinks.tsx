import { Link } from 'react-router';
import { cx } from '../lib/cx';
import { Icon, Menu, MenuItem } from '../ui';

const linkClass = 'text-xs text-ink-muted no-underline hover:text-ink';

/**
 * Terms · Privacy · ©. Lives at the foot of the nav rail above sm (on every
 * page, rail or not) and in the TabBar's "You" sheet at sm.
 * `inline` puts the © on the same row, for the nav rail's narrow foot.
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

/**
 * The collapsed nav rail's stand-in for LegalLinks: no room for words in a
 * 64px column, so a small ⋯ menu with Terms and Privacy.
 */
export function LegalMenu() {
  return (
    <Menu
      side="top"
      align="start"
      label="Terms and privacy"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label="Terms and privacy"
          title="Terms · Privacy"
          className="grid h-7 w-gutter place-items-center rounded-md border-0 bg-transparent text-ink-muted transition-colors duration-120 hover:bg-subtle hover:text-ink aria-expanded:bg-subtle"
        >
          <Icon name="more" size={16} strokeWidth={1.75} />
        </button>
      )}
    >
      <MenuItem to="/terms">Terms</MenuItem>
      <MenuItem to="/privacy">Privacy</MenuItem>
    </Menu>
  );
}
