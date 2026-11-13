import { Link, NavLink } from 'react-router';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { Button, Icon } from '../ui';
import { BrandSymbol } from './BrandMark';
import { useAuthDialog } from './auth';

const legalLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'text-sm no-underline transition-colors duration-120 hover:text-ink',
    isActive ? 'font-semibold text-ink' : 'text-ink-secondary',
  );

/**
 * The website header for `chrome: 'site'` pages (shell/layout.ts), in place of
 * the app's nav rail, top bar and tab bar: brand home link, About · Terms · Privacy,
 * and Sign in (signed out) or a way back into the app (signed in).
 */
export function SiteHeader() {
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-glass px-7 backdrop-blur-md max-sm:px-3">
      <div className="mx-auto flex h-9 w-full max-w-content items-center gap-6 max-sm:gap-3">
        <Link to="/" aria-label="Publisense home" className="flex items-center gap-2 text-md font-bold text-ink no-underline">
          <BrandSymbol />
          <span className="max-sm:hidden">Publisense</span>
        </Link>
        <nav aria-label="Legal links" className="flex items-center gap-4 max-sm:gap-3">
          <NavLink to="/about" className={legalLink}>
            About
          </NavLink>
          <NavLink to="/terms" className={legalLink}>
            Terms
          </NavLink>
          <NavLink to="/privacy" className={legalLink}>
            Privacy
          </NavLink>
        </nav>
        <span className="ml-auto flex items-center gap-2">
          {viewer ? (
            <Link
              to="/"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong bg-card px-3 text-sm font-semibold whitespace-nowrap text-ink no-underline transition-colors duration-120 hover:bg-subtle"
            >
              <span className="max-sm:hidden">Back to Publisense</span>
              <span className="hidden max-sm:inline">Open app</span>
              <Icon name="chevron-right" size={14} strokeWidth={2} />
            </Link>
          ) : ready ? (
            <Button size="sm" variant="secondary" onClick={() => openAuth('signin')}>
              Sign in
            </Button>
          ) : null}
        </span>
      </div>
    </header>
  );
}

/** The site frame's footer: navigation links above the centered © line. */
export function SiteFooter() {
  return (
    <footer aria-label="Site footer" className="border-t border-line px-7 max-sm:px-3">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-2 py-5">
        <nav aria-label="Footer links" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          <Link to="/about" className="text-xs text-ink-muted no-underline hover:text-ink">
            About
          </Link>
          <Link to="/terms" className="text-xs text-ink-muted no-underline hover:text-ink">
            Terms
          </Link>
          <Link to="/privacy" className="text-xs text-ink-muted no-underline hover:text-ink">
            Privacy
          </Link>
          <Link to="/explore" className="text-xs text-ink-muted no-underline hover:text-ink">
            Explore
          </Link>
        </nav>
        <p className="m-0 text-center text-xs text-ink-muted">© 2026 Publisense</p>
      </div>
    </footer>
  );
}
