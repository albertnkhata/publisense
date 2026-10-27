import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  checkDns,
  covered,
  DNS_NOT_FOUND,
  isPostable,
  logoSrc,
  REASON_MAX,
  REASON_MIN,
  onHubDomain,
  siteDomain,
  startDnsCheck,
  startEmailCode,
  TeamError,
  useAddMember,
  useBoards,
  useClaimBoard,
  useClaimHub,
  useHubs,
  useOpenDispute,
  usePendingDns,
  useRequestJoin,
  useVerifiedDomains,
  verifyEmailCode,
  workEmailError,
  type Board,
  type Hub,
  type Scope,
} from '../api';
import { useQueryClient } from '@tanstack/react-query';
import { copyText } from '../lib/share';
import { useViewer } from '../lib/viewer';
import { useAuthDialog } from '../shell/auth';
import { BoardAvatar, Button, Dialog, Field, HubAvatar, Icon, Input, Textarea, useToast } from '../ui';

const CLAIM_AUTH_REASON = 'claim your product’s board';

/**
 * Sign-up can send a confirmation email whose link opens a new tab. Remember
 * where the visitor was heading so the claim picks up again after they return.
 * Stored in localStorage (the link opens in a new tab) and good for an hour,
 * the lifetime of the email link.
 */
const CLAIM_INTENT_KEY = 'publisense:claim-intent';
const CLAIM_INTENT_TTL_MS = 60 * 60 * 1000;

function rememberClaimIntent(opts: Pick<ClaimOptions, 'board' | 'hub'>) {
  try {
    localStorage.setItem(CLAIM_INTENT_KEY, JSON.stringify({ board: opts.board, hub: opts.hub, at: Date.now() }));
  } catch { /* storage unavailable: the claim just starts over after confirmation */ }
}

function clearClaimIntent() {
  try { localStorage.removeItem(CLAIM_INTENT_KEY); } catch { /* ignore */ }
}

function readClaimIntent(): ClaimOptions | null {
  try {
    const raw = localStorage.getItem(CLAIM_INTENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { board?: unknown; hub?: unknown; at?: unknown };
    if (typeof v.at !== 'number' || Date.now() - v.at > CLAIM_INTENT_TTL_MS) {
      clearClaimIntent();
      return null;
    }
    return {
      board: typeof v.board === 'string' ? v.board : undefined,
      hub: typeof v.hub === 'string' ? v.hub : undefined,
      resume: true,
    };
  } catch {
    return null;
  }
}

/**
 * ClaimFlow (FOUNDATION §5, §7 Claim): unclaimed → verifying (work-email code or
 * DNS TXT) → claimed, then "Claim all of {hub}?" when the hub's domain is proved,
 * then add teammates. On a board that is already claimed: "Request to join the
 * team" or "Report the wrong owner", both proved by the same work-email code.
 * Signed-out visitors can open the dialog to pick a product, read what claiming
 * unlocks and how verification works, then create an account or sign in without
 * losing their place. Wording and steps follow the mockup's claim modal.
 */
export interface ClaimOptions {
  /** Board slug. Omit to start with the general claim explanation. */
  board?: string;
  /** Hub slug, for "Work here?" on a claimed hub. */
  hub?: string;
  /** Jump straight to the DNS step (the board header's "Claim pending · check DNS"). */
  dns?: boolean;
  /** Signed-in visitor continuing after sign-up: skip the explanation and go to the next step. */
  resume?: boolean;
}

interface ClaimCtx {
  openClaim: (opts?: ClaimOptions) => void;
}

const ClaimContext = createContext<ClaimCtx | null>(null);

export function ClaimProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: ClaimOptions; key: number }>({ open: false, opts: {}, key: 0 });
  const opener = useRef<HTMLElement | null>(null);
  const openClaim = useCallback((opts?: ClaimOptions) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const clean: ClaimOptions = opts && typeof opts === 'object' && !('nativeEvent' in opts) ? { board: opts.board, hub: opts.hub, dns: opts.dns, resume: opts.resume } : {};
    setState((s) => ({ open: true, opts: clean, key: s.key + 1 }));
  }, []);
  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    // Auth temporarily unmounts the panel; retain the original trigger across it.
    queueMicrotask(() => { if (opener.current?.isConnected) opener.current.focus(); });
  }, []);
  const value = useMemo(() => ({ openClaim }), [openClaim]);
  const { viewer } = useViewer();
  const resumed = useRef(false);
  // Back from the confirmation email: pick the claim up where the visitor left it.
  useEffect(() => {
    if (!viewer || resumed.current) return;
    resumed.current = true;
    const intent = readClaimIntent();
    if (!intent) return;
    clearClaimIntent();
    setState((s) => (s.open ? s : { open: true, opts: intent, key: s.key + 1 }));
  }, [viewer]);
  return (
    <ClaimContext.Provider value={value}>
      {children}
      {state.open ? <ClaimDialog key={state.key} opts={state.opts} onClose={close} /> : null}
    </ClaimContext.Provider>
  );
}

export function useClaim(): ClaimCtx {
  const ctx = useContext(ClaimContext);
  if (!ctx) throw new Error('useClaim must be used inside <ClaimProvider>');
  return ctx;
}

// ------------------------------------------------------------------ the dialog

type Step = 'welcome' | 'pick' | 'intro' | 'code' | 'dns' | 'hub' | 'done' | 'taken' | 'join' | 'dispute' | 'sent';
type Purpose = 'claim' | 'join' | 'dispute';

/** What is being claimed, joined or disputed. */
interface Target {
  scope: Scope;
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  board: Board | null;
  hub: Hub | null;
}

const isClaimed = (b: Board, hubs: Hub[] | undefined) => Boolean(b.claimed_at || (b.hub_id && hubs?.find((h) => h.id === b.hub_id)?.claimed_at));

export function boardTarget(b: Board, hubs: Hub[] | undefined): Target {
  return { scope: 'board', id: b.id, name: b.name, slug: b.slug, domain: siteDomain(b.site), board: b, hub: hubs?.find((h) => h.id === b.hub_id) ?? null };
}

/** A hub is proved by any of its domains (0026): start from one the viewer already proved, else the primary. */
function hubTarget(h: Hub, verified?: string[]): Target {
  const domain = h.domains.find((d) => covered(verified, d)) ?? h.primary_domain;
  return { scope: 'hub', id: h.id, name: h.name, slug: h.slug, domain, board: null, hub: h };
}

/** The hub domain the viewer proved, for the "Claim all of {hub}" step. */
const provedHubDomain = (h: Hub, verified: string[] | undefined) => h.domains.find((d) => covered(verified, d)) ?? h.primary_domain;

function ClaimDialog({ opts, onClose }: { opts: ClaimOptions; onClose: () => void }) {
  const { viewer } = useViewer();
  const { authOpen, openAuth } = useAuthDialog();
  const viewerId = viewer?.id ?? null;
  const boards = useBoards();
  const hubs = useHubs();
  const verified = useVerifiedDomains(viewerId);
  const pendingDns = usePendingDns(viewerId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const claimBoard = useClaimBoard();
  const claimHub = useClaimHub();
  const requestJoin = useRequestJoin();
  const openDispute = useOpenDispute();
  const addMember = useAddMember();

  const [target, setTarget] = useState<Target | null>(null);
  const [step, setStep] = useState<Step>(opts.board || opts.hub ? 'intro' : opts.resume ? 'pick' : 'welcome');
  const [purpose, setPurpose] = useState<Purpose>('claim');
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [claimed, setClaimed] = useState<{ names: string[]; hub: string | null }>({ names: [], hub: null });
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const initialised = useRef(false);
  const pendingStep = useRef<Step | null>(null);
  const stepHeading = useRef<HTMLElement>(null);
  const genericEntry = !opts.board && !opts.hub;

  // Announce each explanation/selection screen without moving focus behind auth.
  useEffect(() => {
    if (!authOpen && ['welcome', 'pick', 'intro', 'taken'].includes(step)) stepHeading.current?.focus();
  }, [step, authOpen]);

  const changeBoard = () => {
    setTarget(null);
    setEmail('');
    setCode('');
    setError(null);
    setStep('pick');
  };

  /** Where a target starts: taken, DNS pending, or the intro. */
  const enter = useCallback(
    (t: Target, wantDns = false) => {
      setTarget(t);
      setError(null);
      setPurpose('claim');
      const taken = t.scope === 'hub' ? Boolean(t.hub?.claimed_at) : t.board ? isClaimed(t.board, hubs.data) : false;
      if (taken) setStep('taken');
      else if (viewerId && (wantDns || (t.domain && pendingDns.data?.includes(t.domain)))) {
        setStep('dns');
        if (t.domain) void startDnsCheck(t.domain).then(setToken, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong.'));
      } else setStep('intro');
    },
    [hubs.data, pendingDns.data, viewerId],
  );

  useEffect(() => {
    if (initialised.current || !boards.data || !hubs.data || (viewerId && pendingDns.isPending)) return;
    initialised.current = true;
    if (opts.hub) {
      const h = hubs.data.find((x) => x.slug === opts.hub);
      if (h) return enter(hubTarget(h, verified.data));
    }
    if (opts.board) {
      const b = boards.data.find((x) => x.slug === opts.board);
      if (b) return enter(boardTarget(b, hubs.data), opts.dns);
    }
    if (opts.board || opts.hub) setStep('pick');
  }, [boards.data, hubs.data, viewerId, pendingDns.isPending, opts, enter, verified.data]);

  // Resume a taken-board action ("Request to join" / "Report the wrong owner") once the visitor signs in.
  useEffect(() => {
    if (viewer) clearClaimIntent();
    if (viewer && pendingStep.current) {
      setStep(pendingStep.current);
      pendingStep.current = null;
    }
  }, [viewer]);

  const domain = target?.domain ?? '';
  const isVerified = covered(verified.data, target?.domain ?? null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');

  // ---------------------------------------------------------------- actions

  /** After the domain is proved: do what the flow was for. */
  const finish = async (t: Target, why: Purpose) => {
    if (why === 'claim') {
      if (t.scope === 'hub') {
        await claimHub.mutateAsync({ id: t.id, name: t.name, domain: t.domain });
        setClaimed({ names: [t.name], hub: t.name });
        setStep('done');
        return;
      }
      const res = await claimBoard.mutateAsync({ id: t.id, name: t.name, domain: t.domain });
      setClaimed({ names: [t.name], hub: null });
      setStep(res.hub ? 'hub' : 'done');
      return;
    }
    if (why === 'join') {
      await requestJoin.mutateAsync({ scope: joinScope(t), id: joinScopeId(t), email, domain: t.domain });
    } else {
      await openDispute.mutateAsync({ scope: t.scope, id: t.id, reason, email, domain: t.domain });
    }
    setStep('sent');
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** Send a code, or skip straight to finishing when the domain is already proved. */
  const sendCode = (why: Purpose) =>
    run(async () => {
      if (!target) return;
      if (why === 'dispute' && reason.trim().length < REASON_MIN) throw new TeamError('reason_length', 'Tell us what’s wrong first (at least 10 characters).');
      const bad = workEmailError(email, domain);
      if (bad) throw new TeamError('wrong_domain', why === 'claim' ? bad : `Use an @${domain} address.`);
      setPurpose(why);
      if (isVerified && why !== 'claim') return finish(target, why);
      await startEmailCode(email, domain);
      setCode('');
      setStep('code');
      toast('Code sent');
    });

  const verify = (value = code) =>
    run(async () => {
      if (!target) return;
      if (!/^\d{6}$/.test(value)) throw new TeamError('wrong_code', 'Enter all 6 digits.');
      await verifyEmailCode(email, value, domain);
      void qc.invalidateQueries({ queryKey: ['verified-domains'] });
      await finish(target, purpose);
    });

  const resend = () =>
    run(async () => {
      await startEmailCode(email, domain);
      toast('New code sent');
    });

  const toDns = () =>
    run(async () => {
      if (!domain) return;
      setToken(await startDnsCheck(domain));
      setStep('dns');
      void qc.invalidateQueries({ queryKey: ['pending-dns'] });
    });

  const checkNow = () =>
    run(async () => {
      if (!target || !domain) return;
      try {
        await checkDns(domain);
      } catch (e) {
        if (e instanceof TeamError && e.code === 'not_found') throw new TeamError('not_found', DNS_NOT_FOUND);
        throw e;
      }
      void qc.invalidateQueries({ queryKey: ['verified-domains'] });
      void qc.invalidateQueries({ queryKey: ['pending-dns'] });
      await finish(target, 'claim');
    });

  const claimWholeHub = () =>
    run(async () => {
      const h = target?.hub;
      if (!h) return;
      await claimHub.mutateAsync({ id: h.id, name: h.name, domain: provedHubDomain(h, verified.data) });
      setClaimed({ names: [target.name, ...h.boards.filter((b) => b.id !== target.id && !b.claimed_at).map((b) => b.name)], hub: h.name });
      setStep('done');
    });

  const addTeammates = () =>
    run(async () => {
      if (!target) return;
      const list = invite.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
      if (list.length === 0) return;
      setInviteError(null);
      const scope: Scope = claimed.hub && target.hub ? 'hub' : target.scope;
      const scopeId = scope === 'hub' && target.hub ? target.hub.id : target.id;
      const added: string[] = [];
      for (const who of list) {
        try {
          await addMember.mutateAsync({ scope, id: scopeId, who, domain: scope === 'hub' && target.hub ? provedHubDomain(target.hub, verified.data) : target.domain });
          added.push(who);
        } catch (e) {
          setInvite(list.filter((x) => !added.includes(x)).join(', '));
          setInviteError(`${who}: ${e instanceof Error ? e.message : 'couldn’t be added.'}`);
          if (added.length) toast(`Added ${added.length} teammate${added.length === 1 ? '' : 's'}`);
          return;
        }
      }
      toast(`Added ${added.length} teammate${added.length === 1 ? '' : 's'}`);
      goToBoard();
    });

  const goToBoard = () => {
    onClose();
    if (target) void navigate(target.scope === 'hub' ? `/h/${target.slug}` : `/b/${target.slug}`);
  };

  const chooseTakenStep = (next: 'join' | 'dispute') => {
    setError(null);
    if (!viewer) {
      pendingStep.current = next;
      openAuth('signin', CLAIM_AUTH_REASON);
      return;
    }
    setStep(next);
  };

  // ---------------------------------------------------------------- views

  const head = target ? <TargetHead target={target} /> : null;
  const title = (() => {
    if (step === 'pick') return 'Choose your board';
    if (!target) return 'Claim your board';
    switch (step) {
      case 'taken':
        return `${target.name} is already claimed`;
      case 'join':
        return 'Request to join';
      case 'dispute':
        return 'Report the wrong owner';
      case 'sent':
        return purpose === 'join' ? 'Request sent' : 'Report sent';
      case 'hub':
        return `Claim all of ${target.hub?.name ?? 'the hub'}?`;
      case 'done':
        return claimed.hub ? `${claimed.hub} hub claimed` : claimed.names.length > 1 ? 'Boards claimed' : 'Board claimed';
      case 'code':
        return purpose === 'claim' ? `Claim ${target.name}` : purpose === 'join' ? 'Request to join' : 'Report the wrong owner';
      default:
        return target.scope === 'hub' ? `Claim the ${target.name} hub` : `Claim ${target.name}`;
    }
  })();

  let body: ReactNode = null;
  let footer: ReactNode = null;
  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };

  if (step === 'welcome') {
    body = (
      <>
        <p ref={(el) => { stepHeading.current = el; }} tabIndex={-1} className="mt-0 mb-4 text-md font-semibold text-ink outline-none">
          Turn community feedback into a conversation with your team.
        </p>
        <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0 text-base text-ink">
          <Perk>Reply as the verified team behind your product</Perk>
          <Perk>Set statuses, pin official replies and run the roadmap</Perk>
        </ul>
        <div className="rounded-md border border-line bg-subtle px-3 py-3">
          <h3 className="mt-0 mb-2 text-base font-semibold">How it works</h3>
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-4 text-sm text-ink-secondary">
            {!viewer ? <li>Create an account or sign in.</li> : null}
            <li>Find your product’s board.</li>
            <li>Verify your product’s domain with a work-email code or a DNS TXT record.</li>
          </ol>
        </div>
        <p className="mb-0 mt-3 text-sm text-ink-muted">Already claimed? You can request to join the team or report the wrong owner.</p>
      </>
    );
    footer = !viewer ? (
      <Button onClick={() => { rememberClaimIntent({}); pendingStep.current = 'pick'; openAuth('signup', CLAIM_AUTH_REASON); }} block>Get started</Button>
    ) : (
      <Button onClick={() => setStep('pick')} block>Get started</Button>
    );
  } else if (boards.isError || hubs.isError) {
    body = <p role="alert" className="m-0 text-sm text-danger">We couldn’t load the boards. Try again.</p>;
    footer = <Button onClick={() => { void boards.refetch(); void hubs.refetch(); }}>Try again</Button>;
  } else if (!boards.data || !hubs.data || (step !== 'pick' && !target)) {
    body = <p className="m-0 py-6 text-center text-sm text-ink-muted">Loading…</p>;
  } else if (step === 'pick') {
    const q = query.trim().toLowerCase();
    const list = boards.data.filter((b) => isPostable(b, viewerId) && (!q || b.name.toLowerCase().includes(q)));
    body = (
      <>
        <p ref={(el) => { stepHeading.current = el; }} tabIndex={-1} className="mt-0 mb-3 text-sm text-ink-secondary outline-none">Find your product to see its verification options. Choosing a board does not claim it.</p>
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter product name" aria-label="Product" autoComplete="off" />
        <ul className="m-0 mt-3 flex list-none flex-col p-0" aria-label="Products">
          {list.map((b) => {
            const taken = isClaimed(b, hubs.data);
            const d = siteDomain(b.site);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => enter(boardTarget(b, hubs.data))}
                  className="flex w-full items-center gap-3 rounded-md border-0 bg-transparent px-2 py-2 text-left text-ink hover:bg-subtle"
                >
                  <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="sm" decorative />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-semibold">{b.name}</span>
                    <span className="truncate text-sm text-ink-muted">
                      {taken ? (
                        <>
                          <b className="font-semibold text-ink-secondary">Claimed</b> · verified team
                        </>
                      ) : d && pendingDns.data?.includes(d) ? (
                        'Claim pending'
                      ) : (
                        (b.site ?? '')
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 ? <li className="px-2 py-3 text-sm text-ink-muted">No board for that product yet. Anyone can start one by posting about it.</li> : null}
        </ul>
      </>
    );
    footer = <Button variant="secondary" onClick={() => { setTarget(null); setStep('welcome'); }}>Back to overview</Button>;
  } else if (target && step === 'intro') {
    const siblings = target.hub ? target.hub.boards.filter((b) => b.id !== target.id && !b.claimed_at && siteDomain(b.site) === target.domain) : [];
    const offersHub = target.scope === 'board' && target.hub && !target.hub.claimed_at && onHubDomain(target.hub, target.domain);
    body = (
      <form ref={(el) => { stepHeading.current = el; }} tabIndex={-1} className="outline-none" id="claim-form" onSubmit={submit(() => (isVerified ? void run(() => finish(target, 'claim')) : void sendCode('claim')))}>
        {head}
        <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0 text-base text-ink">
          <Perk>Get a verified badge on your board and your team's replies.</Perk>
          <Perk>Set statuses, pin official replies and run the roadmap</Perk>
          {offersHub && target.hub ? (
            <Perk>
              One check covers the {target.hub.name} hub{siblings.length ? ` and all ${siblings.length + 1} products on ${target.domain}` : ''}
            </Perk>
          ) : null}
        </ul>
        {!target.domain ? (
          <p className="m-0 text-sm text-ink-muted">This board has no website to verify yet.</p>
        ) : !viewer ? (
          <p className="m-0 text-sm text-ink-secondary">
            Verify with a 6-digit code sent to your <b className="font-semibold text-ink">@{target.domain}</b> work email, or by adding a DNS TXT record to{' '}
            <b className="font-semibold text-ink">{target.domain}</b>.
          </p>
        ) : isVerified ? (
          <p className="m-0 flex items-center gap-2 text-sm text-ink-secondary">
            <span className="text-success">
              <Icon name="check" size={14} strokeWidth={2.4} />
            </span>
            {target.domain} is verified on your account.
          </p>
        ) : (
          <Field
            label="Your work email"
            error={error}
            hint={error ? undefined : `We’ll send a code to confirm you work at ${target.name}. It has to be an @${target.domain} address.`}
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={`you@${target.domain}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              autoFocus
            />
          </Field>
        )}
        {isVerified && error ? (
          <p role="alert" className="m-0 mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    );
    footer = !target.domain ? null : !viewer ? (
      <Button onClick={() => { rememberClaimIntent(target.scope === 'hub' ? { hub: target.slug } : { board: target.slug }); openAuth('signup', CLAIM_AUTH_REASON); }} block>Get started</Button>
    ) : (
      <Actions>
        <Button type="submit" form="claim-form" loading={busy}>
          {isVerified ? (target.scope === 'hub' ? `Claim the ${target.name} hub` : `Claim ${target.name}`) : 'Send code'}
        </Button>
        {!isVerified ? (
          <Alt onClick={() => void toDns()}>No company email? Verify with a DNS record</Alt>
        ) : null}
      </Actions>
    );
    if (genericEntry) footer = <><Button variant="secondary" onClick={changeBoard}>Back</Button>{footer}</>;
  } else if (target && step === 'code') {
    body = (
      <form id="claim-form" onSubmit={submit(() => void verify())}>
        {head}
        <Field label="Enter the 6-digit code" error={error} hint={error ? undefined : <>Sent to <b className="font-semibold text-ink">{email.trim().toLowerCase()}</b>. It expires in 10 minutes.</>}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            className="font-mono"
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              setError(null);
              if (v.length === 6) void verify(v);
            }}
            autoFocus
          />
        </Field>
      </form>
    );
    footer = (
      <Actions>
        <Button type="submit" form="claim-form" loading={busy}>
          Verify
        </Button>
        <Alt onClick={() => void resend()}>Resend code</Alt>
        <Alt
          onClick={() => {
            setError(null);
            setStep(purpose === 'claim' ? 'intro' : purpose);
          }}
        >
          Use a different email
        </Alt>
      </Actions>
    );
  } else if (target && step === 'dns') {
    body = (
      <>
        {head}
        <p className="mt-0 mb-3 text-sm text-ink-secondary">
          Add this TXT record to <b className="font-semibold text-ink">{domain}</b>, then check. DNS changes can take a few minutes to show up.
        </p>
        <div className="flex flex-col gap-2 rounded-md border border-line bg-subtle px-3 py-3 text-sm">
          <RecordRow label="Type">TXT</RecordRow>
          <RecordRow label="Host">@</RecordRow>
          <RecordRow
            label="Value"
            extra={
              <Button
                size="sm"
                variant="secondary"
                disabled={!token}
                onClick={() => {
                  void copyText(token).then((ok) => {
                    setCopied(ok);
                    if (ok) setTimeout(() => setCopied(false), 1400);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            }
          >
            {token || '…'}
          </RecordRow>
        </div>
        {error ? (
          <p role="alert" className="m-0 mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </>
    );
    footer = (
      <Actions>
        <Button onClick={() => void checkNow()} loading={busy} disabled={!token}>
          {busy ? 'Checking…' : 'Check now'}
        </Button>
        <Alt
          onClick={() => {
            onClose();
            toast('Saved. Come back to check once the record is live');
          }}
        >
          I’ll do it later
        </Alt>
        <Alt
          onClick={() => {
            setError(null);
            setStep('intro');
          }}
        >
          Use work email instead
        </Alt>
      </Actions>
    );
  } else if (target && step === 'hub' && target.hub) {
    const h = target.hub;
    body = (
      <>
        <p className="mt-0 mb-3 text-sm text-ink-secondary">
          {provedHubDomain(h, verified.data)} is verified, so you can take over the {h.name} hub and every product in it in one go. Your team is shared across them.
        </p>
        <ul className="m-0 flex list-none flex-col gap-1 rounded-md border border-line p-2">
          <OrgRow
            avatar={<HubAvatar name={`${h.name} hub`} size="sm" boards={h.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))} max={3} />}
            name={`${h.name} hub`}
            note={`The page that groups ${h.boards.length} products`}
          />
          {h.boards.map((b) => (
            <OrgRow
              key={b.id}
              avatar={<BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="sm" decorative />}
              name={b.name}
              note={b.id === target.id ? 'Claimed' : b.claimed_at ? 'Managed by its own team' : `${b.tagline}${b.tagline ? ' · ' : ''}${b.post_count} posts`}
              done={b.id === target.id}
            />
          ))}
        </ul>
        {error ? (
          <p role="alert" className="m-0 mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </>
    );
    footer = (
      <Actions>
        <Button onClick={() => void claimWholeHub()} loading={busy}>
          Claim all of {h.name}
        </Button>
        <Alt onClick={() => setStep('done')}>Just {target.name} for now</Alt>
      </Actions>
    );
  } else if (target && step === 'done') {
    const names = claimed.names.length ? claimed.names : [target.name];
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const inviteDomain = claimed.hub && target.hub ? provedHubDomain(target.hub, verified.data) : target.domain;
    body = (
      <form id="claim-form" onSubmit={submit(() => void addTeammates())}>
        <Done title={`You manage ${list} now`}>
          {claimed.hub && claimed.hub !== target.name ? `You also manage the ${claimed.hub} hub. ` : ''}Your replies get the verified badge, and you can set statuses and run the roadmap. Add teammates so they can help.
        </Done>
        <Field label="Invite teammates" error={inviteError} hint={inviteError ? undefined : `They need an @${inviteDomain ?? 'company'} address and a Publisense account.`}>
          <Input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder={`name@${inviteDomain ?? 'company.com'}, another@${inviteDomain ?? 'company.com'}`} autoFocus />
        </Field>
      </form>
    );
    footer = (
      <Actions>
        <Button type="submit" form="claim-form" loading={busy} disabled={!invite.trim()}>
          Add to team
        </Button>
        <Alt onClick={goToBoard}>Skip for now</Alt>
      </Actions>
    );
  } else if (target && step === 'taken') {
    body = (
      <>
        {head}
        <p className="mt-0 mb-4 text-sm text-ink-secondary">
          A verified team manages this {target.scope}. If you work at {target.name}, ask them to add you. If you think the wrong people have it, tell us.
        </p>
        <div className="flex flex-col gap-2">
          <Choice title="Request to join the team" onClick={() => chooseTakenStep('join')}>
            We’ll check your @{domain} email, then ask the {target.scope === 'hub' ? 'hub' : 'board'}’s admins to approve you.
          </Choice>
          <Choice title="Report the wrong owner" onClick={() => chooseTakenStep('dispute')}>
            Verify {domain} yourself and our team reviews it. The {target.scope} stays as is until then.
          </Choice>
        </div>
      </>
    );
  } else if (target && (step === 'join' || step === 'dispute')) {
    const why: Purpose = step;
    body = (
      <form id="claim-form" onSubmit={submit(() => void sendCode(why))}>
        {head}
        {why === 'dispute' ? (
          <Field label="What’s wrong?" className="mb-3" aside={`${reason.length}/${REASON_MAX}`}>
            <Textarea
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`For example: a former employee or contractor still controls it, or it isn’t affiliated with ${target.name}.`}
              autoFocus
            />
          </Field>
        ) : null}
        <Field
          label="Your work email"
          error={error}
          hint={
            error
              ? undefined
              : isVerified
                ? `${domain} is verified on your account.`
                : why === 'join'
                  ? 'We’ll send a code to confirm it, then the admins get your request.'
                  : `We need proof you work at ${target.name}: an @${domain} email, confirmed with a code.`
          }
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={`you@${domain}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            autoFocus={why === 'join'}
          />
        </Field>
      </form>
    );
    footer = (
      <Actions>
        <Button type="submit" form="claim-form" loading={busy}>
          {why === 'join' ? 'Send request' : 'Send report'}
        </Button>
        <Alt
          onClick={() => {
            setError(null);
            setStep('taken');
          }}
        >
          Back
        </Alt>
      </Actions>
    );
  } else if (target && step === 'sent') {
    body =
      purpose === 'join' ? (
        <Done title={`We’ve asked the ${target.name} admins`}>You’ll get a notification when they approve you. Requests expire after 14 days.</Done>
      ) : (
        <Done title="We’ll review it">
          We usually reply within 3 business days. If it checks out we’ll hand {target.name} to you, and the current team gets notice first.
        </Done>
      );
    footer = (
      <Actions>
        <Button onClick={onClose}>Done</Button>
      </Actions>
    );
  }

  return (
    <Dialog open={!authOpen} onClose={onClose} title={title} footer={footer}>
      {body}
    </Dialog>
  );
}

/** "Work here?" on a board inside a claimed hub joins the hub's team. */
const joinScope = (t: Target): Scope => (t.scope === 'board' && t.hub?.claimed_at ? 'hub' : t.scope);
const joinScopeId = (t: Target): string => (t.scope === 'board' && t.hub?.claimed_at ? t.hub.id : t.id);

// ------------------------------------------------------------------ pieces

function TargetHead({ target }: { target: Target }) {
  const b = target.board;
  const h = target.hub;
  return (
    <div className="mb-4 flex items-center gap-3">
      {b ? (
        <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="md" decorative />
      ) : h ? (
        <HubAvatar name={`${h.name} hub`} size="md" boards={h.boards.map((x) => ({ name: x.name, color: x.color, logoSrc: logoSrc(x) }))} max={3} />
      ) : null}
      <span className="flex min-w-0 flex-col">
        <b className="truncate text-base font-semibold text-ink">{target.name}</b>
        <span className="truncate text-sm text-ink-muted">
          {b ? b.tagline : (h?.description ?? '')}
          {target.domain ? ` · ${target.domain}` : ''}
        </span>
      </span>
    </div>
  );
}

function RecordRow({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 shrink-0 text-ink-muted">{label}</span>
      <code className="min-w-0 flex-1 font-mono break-all text-ink">{children}</code>
      {extra}
    </div>
  );
}

function Perk({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1 text-success">
        <Icon name="check" size={14} strokeWidth={2.4} />
      </span>
      <span>{children}</span>
    </li>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-wrap items-center justify-start gap-2">{children}</div>;
}

function Alt({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-sm border-0 bg-transparent px-2 py-1 text-sm font-medium text-ink-secondary hover:text-ink hover:underline">
      {children}
    </button>
  );
}

function Choice({ title, children, onClick }: { title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col gap-1 rounded-md border border-line bg-card px-4 py-3 text-left hover:bg-subtle">
      <span className="text-base font-semibold text-ink">{title}</span>
      <span className="text-sm text-ink-muted">{children}</span>
    </button>
  );
}

function OrgRow({ avatar, name, note, done }: { avatar: ReactNode; name: string; note: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-sm px-2 py-2">
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-base font-semibold text-ink">{name}</b>
        <span className="truncate text-sm text-ink-muted">{note}</span>
      </span>
      <span className={done ? 'text-success' : 'text-brand'}>
        <Icon name="check" size={16} strokeWidth={2.4} />
      </span>
    </li>
  );
}

function Done({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col items-center text-center">
      <span className="mb-3 grid size-9 place-items-center rounded-pill bg-subtle text-success">
        <Icon name="check" size={20} strokeWidth={2.4} />
      </span>
      <h3 className="m-0 mb-1 text-md font-semibold text-ink">{title}</h3>
      <p className="m-0 text-sm text-ink-secondary">{children}</p>
    </div>
  );
}
