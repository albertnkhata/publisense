import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AUTH_COPY,
  isEmail,
  MIN_PASSWORD,
  requestPasswordReset,
  RESEND_COOLDOWN_S,
  resendSignupConfirmation,
  signInWithGoogle,
  signInWithPassword,
  signUp,
  suggestHandle,
  useAuthCapabilities,
} from '../api';
import { BrandGlyph, Button, Dialog, Icon, Input, PasswordInput, useToast } from '../ui';

/**
 * AuthDialog (FOUNDATION §5, §7): sign in · sign up · forgot → sent, plus
 * "confirm your email" after a sign-up when the project requires it. Look,
 * wording and behaviour follow the reference mockup's auth modal. Setting a new
 * password after a reset link lives on /auth/reset.
 *
 * No message here ever reveals whether an email has an account.
 */
export type AuthMode = 'signin' | 'signup' | 'forgot' | 'sent' | 'confirm' | 'expired';

const COPY: Record<AuthMode, { title: string; sub: string; submit: string }> = {
  signin: {
    title: 'Sign in to Publisense',
    sub: '',
    submit: 'Sign in',
  },
  signup: {
    title: 'Create your account',
    sub: '',
    submit: 'Create account',
  },
  forgot: {
    title: 'Reset your password',
    sub: 'Enter the email you signed up with and we’ll send you a link to set a new password.',
    submit: 'Send reset link',
  },
  // Opened from an expired or already-used email link (#137, AuthLinkErrorWatcher).
  expired: {
    title: 'That link has expired',
    sub: 'Email links work once and expire after an hour. Enter your email and we’ll send you a new one.',
    submit: 'Send a new link',
  },
  sent: { title: 'Check your email', sub: '', submit: 'Back to sign in' },
  confirm: { title: 'Confirm your email', sub: '', submit: 'Back to sign in' },
};

/**
 * Why the dialog closed: `done` after signing in, creating an account or sending
 * a confirmation/reset email; `cancel` when the visitor backed out before that.
 */
export type AuthCloseReason = 'done' | 'cancel';

export interface AuthDialogProps {
  open: boolean;
  onClose: (how?: AuthCloseReason) => void;
  initialMode?: AuthMode;
  /**
   * Gated action, e.g. "upvote": the sub line becomes "Sign in to upvote. It takes a few seconds."
   * ("Create an account to …" when the dialog opens on sign-up).
   */
  reason?: string;
}

export function AuthDialog({ open, onClose, initialMode = 'signin', reason }: AuthDialogProps) {
  const { toast } = useToast();
  const caps = useAuthCapabilities(open);
  const [mode, setModeState] = useState<AuthMode>(initialMode);
  const [keepReason, setKeepReason] = useState(Boolean(reason));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Confirm-email and reset-sent screens: when the last email went out, and the resend state.
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const focusTarget = mode === 'signup' ? nameRef : mode === 'sent' || mode === 'confirm' ? submitRef : emailRef;

  const setMode = (next: AuthMode) => {
    setModeState(next);
    setKeepReason(false);
    setPassword('');
    setError('');
  };

  // Resend unlocks a minute after the last email, with a visible countdown.
  const waiting = mode === 'confirm' || mode === 'sent';
  const secondsLeft = waiting && sentAt ? Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_S * 1000 - now) / 1000)) : 0;
  const canResend = secondsLeft === 0;
  useEffect(() => {
    if (!waiting || !sentAt) return;
    setNow(Date.now());
    const t = setInterval(() => {
      const t2 = Date.now();
      setNow(t2);
      if (t2 >= sentAt + RESEND_COOLDOWN_S * 1000) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [waiting, sentAt]);

  // Mockup: switching mode moves focus to the first visible field.
  useEffect(() => {
    if (open) focusTarget.current?.focus();
  }, [mode]);

  const fail = (msg: string, el?: HTMLInputElement | null) => {
    setError(msg);
    el?.focus();
  };

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (mode === 'sent' || mode === 'confirm') {
      setMode('signin');
      return;
    }
    // Validation order follows the mockup.
    if (!isEmail(email)) return fail(AUTH_COPY.invalidEmail, emailRef.current);
    if (mode === 'signup' && !name.trim()) return fail(AUTH_COPY.needName, nameRef.current);
    if (mode === 'signup' && password.length < MIN_PASSWORD) return fail(AUTH_COPY.shortPassword, pwRef.current);
    if (mode === 'signin' && !password) return fail(AUTH_COPY.needPassword, pwRef.current);

    setBusy(true);
    try {
      // A reset link also confirms the address, so it serves both sign-up and reset links.
      if (mode === 'forgot' || mode === 'expired') {
        const r = await requestPasswordReset(email);
        if (r.error) return fail(r.error);
        setSentTo(email.trim());
        setSentAt(Date.now());
        setMode('sent');
        return;
      }
      if (mode === 'signin') {
        const r = await signInWithPassword(email, password);
        if (r.error) return fail(r.error);
        onClose('done');
        toast('Signed in');
        return;
      }
      const baseHandle = suggestHandle(email);
      const handle = baseHandle.length >= 3 ? baseHandle : `${baseHandle}_user`.slice(0, 24);
      const r = await signUp(name, email, password, handle, { chosen: false });
      if (r.error) return fail(r.error);
      if (r.needsConfirmation) {
        setSentTo(email.trim());
        setSentAt(Date.now());
        setResent(false);
        setMode('confirm');
        return;
      }
      onClose('done');
      toast('Account created');
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (resending || !canResend) return;
    setResending(true);
    setError('');
    try {
      const r = await resendSignupConfirmation(sentTo);
      if (r.error) {
        setError(r.error);
        // Throttled by the server: wait out a fresh minute before offering it again.
        if (r.error === AUTH_COPY.resendRateLimited) setSentAt(Date.now());
        return;
      }
      setResent(true);
      setSentAt(Date.now());
      toast('Confirmation email sent');
    } finally {
      setResending(false);
    }
  }

  /** Back to sign-up with the name and email kept, so the address can be fixed. */
  function editEmail() {
    setModeState('signup');
    setKeepReason(false);
    setError('');
    setResent(false);
    setTimeout(() => emailRef.current?.focus(), 0);
  }

  async function resend() {
    if (resending || !canResend) return;
    setResending(true);
    setError('');
    try {
      const r = await requestPasswordReset(sentTo);
      if (r.error) {
        setError(r.error);
        if (r.error === AUTH_COPY.rateLimited) setSentAt(Date.now());
        return;
      }
      setSentAt(Date.now());
      toast('Sent another link');
    } finally {
      setResending(false);
    }
  }

  async function google() {
    setError('');
    const r = await signInWithGoogle();
    if (r.error) setError(r.error);
  }

  // Esc, Close or outside click. Once a confirmation or reset email has gone out
  // the visitor has done their part, so that counts as finished, not backing out.
  const dismiss = () => onClose(mode === 'confirm' || mode === 'sent' ? 'done' : 'cancel');
  const leave = () => onClose('cancel');

  const c = COPY[mode];
  const sub =
    keepReason && reason
      ? `${mode === 'signup' ? 'Create an account' : 'Sign in'} to ${reason}. It takes a few seconds.`
      : mode === 'sent'
        ? `If ${sentTo || 'that email'} has an account, a reset link is on its way. It expires in 1 hour.`
        : mode === 'confirm'
          ? `Open the link we sent to ${sentTo || 'your email'} to finish creating your account.`
          : c.sub;
  const oauth = (mode === 'signin' || mode === 'signup') && caps.google;
  const linkClass = 'border-0 bg-transparent p-0 font-semibold text-ink no-underline hover:underline cursor-pointer';

  return (
    <Dialog open={open} onClose={dismiss} title={c.title} hideTitle initialFocus={focusTarget}>
      <form noValidate onSubmit={submit} className="-mt-4 flex flex-col text-center">
        <span className="mb-3 inline-grid place-items-center text-brand" aria-hidden="true">
          <BrandGlyph size={26} />
        </span>
        <p aria-hidden="true" className="m-0 text-lg font-bold text-ink">
          {c.title}
        </p>
        {sub ? <p className="mt-2 mb-5 text-sm text-ink-secondary">{sub}</p> : <div className="mb-5" />}

        {oauth ? (
          <>
            <button
              type="button"
              onClick={google}
              className="mb-2 flex h-8 w-full items-center justify-center gap-3 rounded-md border border-line bg-card text-base font-semibold text-ink transition-colors duration-120 hover:bg-subtle"
            >
              <GoogleMark />
              Continue with Google
            </button>
            <div className="my-3 flex items-center gap-3 text-sm text-ink-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
              or
            </div>
          </>
        ) : null}

        {mode === 'sent' || mode === 'confirm' ? (
          <span className="mx-auto mt-1 mb-3 grid size-9 place-items-center rounded-pill bg-elevated text-ink" aria-hidden="true">
            <Icon name="mail" size={20} strokeWidth={1.8} />
          </span>
        ) : null}

        <div className="flex flex-col gap-2 text-left">
          {mode === 'signup' ? (
            <Input
              ref={nameRef}
              type="text"
              aria-label="Name"
              placeholder="Your name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
            />
          ) : null}
          {mode === 'signin' || mode === 'signup' || mode === 'forgot' || mode === 'expired' ? (
            <Input
              ref={emailRef}
              type="email"
              aria-label="Email address"
              placeholder="you@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
            />
          ) : null}
          {mode === 'signin' || mode === 'signup' ? (
            <PasswordInput
              key={mode}
              ref={pwRef}
              aria-label="Password"
              placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
            />
          ) : null}
          {mode === 'signin' || mode === 'signup' ? (
            <div className="flex items-center justify-between text-sm text-ink-muted">
              <span>{mode === 'signup' ? 'At least 8 characters' : ''}</span>
              {mode === 'signin' ? (
                <button type="button" className={linkClass} onClick={() => setMode('forgot')}>
                  Forgot password?
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="m-0 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <Button ref={submitRef} type="submit" block loading={busy} className="mt-3">
          {c.submit}
        </Button>

        <p className="mt-4 mb-0 text-sm text-ink-secondary">
          {mode === 'signup' ? (
            <SwitchLine text="Already have an account?" action="Sign in" onClick={() => setMode('signin')} />
          ) : mode === 'signin' ? (
            <SwitchLine text="New to Publisense?" action="Create an account" onClick={() => setMode('signup')} />
          ) : mode === 'sent' ? (
            canResend ? (
              <SwitchLine text="Didn’t get it?" action={resending ? 'Sending…' : 'Resend'} onClick={resend} />
            ) : (
              <>
                Didn’t get it? You can resend in <Countdown seconds={secondsLeft} />
              </>
            )
          ) : mode === 'expired' ? (
            <SwitchLine text="Already confirmed your email?" action="Sign in" onClick={() => setMode('signin')} />
          ) : mode === 'confirm' ? (
            <span className="flex flex-col items-center gap-2">
              <span>
                {canResend ? (
                  <SwitchLine text={resent ? 'Still nothing?' : 'Didn’t get it?'} action={resending ? 'Sending…' : 'Resend email'} onClick={resendConfirmation} />
                ) : (
                  <>
                    {resent ? 'Sent again. Check your spam folder too. You can resend in ' : 'Didn’t get it? You can resend in '}
                    <Countdown seconds={secondsLeft} />
                  </>
                )}
              </span>
              <SwitchLine text="Wrong address?" action="Use a different email" onClick={editEmail} />
            </span>
          ) : (
            <SwitchLine text="Remembered it?" action="Back to sign in" onClick={() => setMode('signin')} />
          )}
        </p>
        <p className="mt-2 mb-0 text-xs text-ink-muted">
          By continuing you agree to the{' '}
          <Link to="/terms" onClick={leave} className="text-ink-muted underline underline-offset-2">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" onClick={leave} className="text-ink-muted underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </Dialog>
  );
}

function SwitchLine({ text, action, onClick }: { text: ReactNode; action: string; onClick: () => void }) {
  return (
    <>
      {text}{' '}
      <button type="button" onClick={onClick} className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-ink hover:underline">
        {action}
      </button>
    </>
  );
}

/** Google's "G". Its brand colours are theme variables (theme.css), not raw hex here. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" focusable="false">
      <path fill="var(--google-blue)" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="var(--google-green)" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="var(--google-yellow)" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" />
      <path fill="var(--google-red)" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
    </svg>
  );
}

/** m:ss, steady width so the line doesn't jitter; screen readers skip the per-second ticks. */
function Countdown({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <span className="tabular-nums text-ink" aria-live="off">
      {m}:{ss}
    </span>
  );
}
