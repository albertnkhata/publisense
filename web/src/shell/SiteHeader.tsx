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
 * the app's nav rail, top bar and tab bar: brand home link, Terms · Privacy,
 * and Sign in (signed out) or a way back into the app (signed in).
 */
export function SiteHeader() {
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-glass backdrop-blur-md">
      <div className="flex h-9 w-full items-center gap-6 px-7 max-sm:gap-4 max-sm:px-3">
        <Link to="/" aria-label="Publisense home" className="flex items-center gap-2 text-md font-bold text-ink no-underline">
          <BrandSymbol />
          <span className="max-sm:hidden">Publisense</span>
        </Link>
        <nav aria-label="Legal links" className="flex items-center gap-4">
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
            <Button size="sm" onClick={() => openAuth('signin')}>
              Sign in
            </Button>
          ) : null}
        </span>
      </div>
    </header>
  );
}

/** The site frame's footer: the © line under the page (Terms · Privacy are in the header). */
export function SiteFooter() {
  return (
    <footer aria-label="Site footer" className="border-t border-line">
      <p className="mx-auto my-0 w-full max-w-wide px-7 py-5 text-center text-xs text-ink-muted max-sm:px-3">© 2026 Publisense</p>
    </footer>
  );
}
