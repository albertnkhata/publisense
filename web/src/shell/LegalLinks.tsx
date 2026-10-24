import { Link } from 'react-router';

export function LegalLinks() {
  return (
    <footer aria-label="Legal" className="px-2">
      <nav className="flex flex-wrap gap-x-3 gap-y-1">
        <Link to="/terms" className="text-xs text-ink-muted no-underline hover:text-ink">
          Terms
        </Link>
        <Link to="/privacy" className="text-xs text-ink-muted no-underline hover:text-ink">
          Privacy
        </Link>
      </nav>
      <p className="mt-2 mb-0 text-xs text-ink-muted">© 2026 Publisense</p>
    </footer>
  );
}
