import { Link } from 'react-router';
import { ClaimIntroLink } from '../claim/ClaimIntroLink';
import { CLAIM_PATH } from '../lib/claimLink';
import { useViewer } from '../lib/viewer';

const footLink = 'text-xs text-ink-muted no-underline hover:text-ink';

export function LegalLinks() {
  const { viewer } = useViewer();
  return (
    <footer aria-label="Legal" className="px-2">
      <nav className="flex flex-wrap gap-x-3 gap-y-1">
        {viewer ? (
          <Link to={CLAIM_PATH} className={footLink}>
            Claim your board
          </Link>
        ) : (
          // Signed out: the claim intro modal, with "Learn more" on to /claim (#157).
          <ClaimIntroLink className={footLink}>Claim your board</ClaimIntroLink>
        )}
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
