import { Link, useNavigate } from 'react-router';
import { useMyRequests } from '../api';
import { useClaim } from '../claim/ClaimDialog';
import { useViewer } from '../lib/viewer';
import { Button, Dialog, Icon, VerifiedBadge } from '../ui';

const verifiedDateFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function formatVerifiedSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Verified since ${verifiedDateFormat.format(date)}.`;
}

/** Interactive trigger wrapping the header VerifiedBadge on product and hub pages. */
export function VerifiedBadgeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 transition-opacity duration-120 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <VerifiedBadge size="lg" />
    </button>
  );
}

/**
 * Modal shown when clicking the verified badge on a product or hub page:
 * explains who manages it, the verified domain, when it was verified, and
 * offers a one-tap path to manage or request to join the team.
 */
export function VerifiedTeamDialog({
  open,
  onClose,
  kind,
  requestScope = kind,
  requestScopeId,
  slug,
  orgName,
  domain,
  claimedAt,
  isTeam,
  managePath,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'board' | 'hub';
  /** The claimed scope queried for pending join requests ('hub' when a board is verified via its hub). */
  requestScope?: 'board' | 'hub';
  requestScopeId: string;
  /** Board or hub slug for opening the claim/join dialog. */
  slug: string;
  /** Name of the verified product or company hub managing this page. */
  orgName: string;
  domain?: string | null;
  claimedAt: string | null | undefined;
  isTeam: boolean;
  managePath: string;
}) {
  const { viewer } = useViewer();
  const { openClaim } = useClaim();
  const navigate = useNavigate();
  const mine = useMyRequests(requestScope, requestScopeId, viewer?.id ?? null, open && !isTeam);
  const since = formatVerifiedSince(claimedAt);
  const pendingJoin = Boolean(mine.data?.join);

  return (
    <Dialog open={open} onClose={onClose} title="Verified team">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <VerifiedBadge size="md" decorative className="mt-1" />
            <p className="m-0 text-base text-ink-secondary">
              This {kind === 'hub' ? 'hub' : 'product'} is managed by <b className="font-semibold text-ink">{orgName}</b>’s verified team.{' '}
              <Link to="/about" onClick={onClose} className="font-medium text-brand no-underline underline-offset-2 hover:underline">
                Learn more
              </Link>
            </p>
          </div>
          {domain ? (
            <div className="flex items-center gap-3 text-base text-ink-secondary">
              <Icon name="globe" size={16} className="shrink-0 text-ink-muted" />
              <span>
                Domain verified on <b className="font-semibold text-ink">{domain}</b>.
              </span>
            </div>
          ) : null}
          {since ? (
            <div className="flex items-center gap-3 text-base text-ink-secondary">
              <Icon name="calendar" size={16} className="shrink-0 text-ink-muted" />
              <span>{since}</span>
            </div>
          ) : null}
        </div>
        {isTeam ? (
          <Button
            className="w-full"
            onClick={() => {
              onClose();
              void navigate(managePath);
            }}
          >
            Manage {kind === 'hub' ? 'hub' : 'board'}
          </Button>
        ) : pendingJoin ? (
          <p className="m-0 rounded-md border border-line bg-subtle px-3 py-2 text-center text-sm text-ink-muted">
            Your request to join this team is pending.
          </p>
        ) : (
          <Button
            className="w-full"
            onClick={() => {
              onClose();
              openClaim(kind === 'hub' ? { hub: slug } : { board: slug });
            }}
          >
            Work at {orgName}? Request to join
          </Button>
        )}
      </div>
    </Dialog>
  );
}
