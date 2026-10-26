import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { claimHref } from '../lib/claimLink';
import { useAuthDialog } from '../shell/auth';
import type { AuthMode } from '../shell/AuthDialog';
import { Button, Dialog } from '../ui';
import { CLAIM_ACTIONS, useClaimTarget, type ClaimTarget } from './claimTarget';

/*
 * Claim intro (#157 follow-up): the short "how claiming works" modal that
 * signed-out claim entry points open instead of navigating to /claim. It says
 * who can claim, how, and what the team gets, then offers sign-up, sign-in, or
 * "Learn more" (the full /claim page, which stays public and crawlable).
 *
 * Every line is a shortened copy of something the /claim page already says
 * (src/pages/ClaimPage.tsx, CLAIM_COPY), which in turn describes the claim flow
 * as built. Change both together.
 */

export interface ClaimIntroTarget {
  board?: string;
  hub?: string;
}

export const CLAIM_INTRO = {
  title: 'Claim your product’s board',
  lines: [
    { lead: 'Who can claim:', text: 'anyone at the company who can prove the domain of the product’s website. Shared domains like gmail.com don’t count.' },
    { lead: 'How:', text: 'enter the 6-digit code we send to your work email, or add a TXT record to the domain’s DNS.' },
    {
      lead: 'Your team gets:',
      text: 'the Verified team badge, official replies pinned above the rest, post statuses, and the board’s roadmap and changelog.',
    },
    { lead: 'Teammates:', text: 'add coworkers who have an address on your domain.' },
  ],
  account: 'Claiming needs a Publisense account.',
  learnMore: 'Learn more',
  signUp: CLAIM_ACTIONS.signUp,
  signIn: CLAIM_ACTIONS.signIn,
  signupReason: CLAIM_ACTIONS.signupReason,
};

/**
 * Owns the intro modal's state. Rendered by ClaimProvider, so every page that
 * can start a claim can also open the intro. Sign-up and sign-in wait for the
 * intro to close (and focus to go back to the entry point) before opening the
 * AuthDialog, so closing that dialog returns focus to the entry point too.
 */
export function useClaimIntroHost(): { openIntro: (target?: ClaimIntroTarget) => void; host: ReactNode } {
  const { openAuth } = useAuthDialog();
  const [state, setState] = useState<{ open: boolean; target: ClaimIntroTarget; key: number }>({ open: false, target: {}, key: 0 });
  const pendingAuth = useRef<AuthMode | null>(null);

  const openIntro = useCallback((target?: ClaimIntroTarget) => {
    pendingAuth.current = null;
    const clean: ClaimIntroTarget = target?.board ? { board: target.board } : target?.hub ? { hub: target.hub } : {};
    setState((s) => ({ open: true, target: clean, key: s.key + 1 }));
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const toAuth = useCallback((mode: AuthMode) => {
    pendingAuth.current = mode;
    setState((s) => ({ ...s, open: false }));
  }, []);

  // Runs after the Dialog's own cleanup has put focus back on the entry point.
  useEffect(() => {
    if (state.open || !pendingAuth.current) return;
    const mode = pendingAuth.current;
    pendingAuth.current = null;
    openAuth(mode, CLAIM_INTRO.signupReason);
  }, [state.open, openAuth]);

  const host = state.open ? <ClaimIntroDialog key={state.key} target={state.target} onClose={close} onAuth={toAuth} /> : null;
  return useMemo(() => ({ openIntro, host }), [openIntro, host]);
}

function ClaimIntroDialog({ target, onClose, onAuth }: { target: ClaimIntroTarget; onClose: () => void; onAuth: (mode: AuthMode) => void }) {
  const t = useClaimTarget(target);
  const c = CLAIM_INTRO;
  return (
    <Dialog
      open
      onClose={onClose}
      title={c.title}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => onAuth('signin')}>
            {c.signIn}
          </Button>
          <Button size="sm" onClick={() => onAuth('signup')}>
            {c.signUp}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {t ? <ClaimIntroNote target={t} /> : null}
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-base text-ink-secondary">
          {c.lines.map((l) => (
            <li key={l.lead}>
              <b className="font-semibold text-ink">{l.lead}</b> {l.text}
            </li>
          ))}
        </ul>
        <p className="m-0 text-sm text-ink-muted">
          {c.account}{' '}
          <Link to={claimHref(target)} onClick={onClose} className="font-semibold text-ink-secondary underline underline-offset-2 hover:text-brand">
            {c.learnMore}
          </Link>
        </p>
      </div>
    </Dialog>
  );
}

/** The board- or hub-specific line, in the same three cases as the /claim page. */
function ClaimIntroNote({ target: t }: { target: ClaimTarget }) {
  const name = <b className="font-semibold text-ink">{t.name}</b>;
  return (
    <p data-testid="claim-intro-note" className="m-0 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">
      {t.claimed ? (
        <>{name} is already claimed by a verified team. With an account you can ask to join it, or report it if you think the wrong people have it.</>
      ) : t.domain ? (
        <>
          To claim {name}, you’ll prove you can use the <b className="font-semibold text-ink">{t.domain}</b> domain.
        </>
      ) : (
        <>{name} has no website to verify yet, so it can’t be claimed for now.</>
      )}
    </p>
  );
}
