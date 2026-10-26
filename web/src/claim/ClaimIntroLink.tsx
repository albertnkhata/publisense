import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { claimHref } from '../lib/claimLink';
import { useClaim } from './ClaimDialog';
import type { ClaimIntroTarget } from './ClaimIntro';

/**
 * A claim entry point for signed-out visitors (#157): a real link to the /claim
 * page, so it still opens in a new tab and works without JS, whose plain click
 * opens the claim intro modal instead of navigating.
 */
export function ClaimIntroLink({ target, className, children }: { target?: ClaimIntroTarget; className?: string; children: ReactNode }) {
  const { openClaimIntro } = useClaim();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openClaimIntro(target);
  };
  return (
    <Link to={claimHref(target)} onClick={onClick} aria-haspopup="dialog" className={className}>
      {children}
    </Link>
  );
}
