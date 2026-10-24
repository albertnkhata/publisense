import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AUTH_COPY,
  isEmail,
  MIN_PASSWORD,
  requestPasswordReset,
  signInWithGoogle,
  signInWithPassword,
  signUp,
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
export type AuthMode = 'signin' | 'signup' | 'forgot' | 'sent' | 'confirm';

const COPY: Record<AuthMode, { title: string; sub: string; submit: string }> = {
  signin: {
    title: 'Sign in to Publisense',
    sub: 'Upvote, follow and share feedback with the teams who build your tools.',
    submit: 'Sign in',
  },
  signup: {
    title: 'Create your account',
    sub: 'Upvote, follow and share feedback with the teams who build your tools.',
    submit: 'Create account',
  },
  forgot: {
    title: 'Reset your password',
    sub: 'Enter the email you signed up with and we’ll send you a link to set a new password.',
    submit: 'Send reset link',
  },
  sent: { title: 'Check your email', sub: '', submit: 'Back to sign in' },
  confirm: { title: 'Confirm your email', sub: '', submit: 'Back to sign in' },
};

export interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
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
      if (mode === 'forgot') {
        const r = await requestPasswordReset(email);
        if (r.error) return fail(r.error);
        setSentTo(email.trim());
        setMode('sent');
        return;
      }
      if (mode === 'signin') {
        const r = await signInWithPassword(email, password);
        if (r.error) return fail(r.error);
        onClose();
        toast('Signed in');
        return;
      }
      const r = await signUp(name, email, password);
      if (r.error) return fail(r.error);
      if (r.needsConfirmation) {
        setSentTo(email.trim());
        setMode('confirm');
        return;
      }
      onClose();
      toast('Account created');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const r = await requestPasswordReset(sentTo);
    if (r.error) setError(r.error);
    else toast('Sent another link');
  }

  async function google() {
    setError('');
    const r = await signInWithGoogle();
    if (r.error) setError(r.error);
  }

  const c = COPY[mode];
  const sub =
    keepReason && reason
      ? `${mode === 'signup' ? 'Create an account' : 'Sign in'} to ${reason}. It takes a few seconds.`
      : mode === 'sent'
        ? `If ${sentTo || 'that email'} has an account, a reset link is on its way. It expires in 1 hour.`
        : mode === 'confirm'
          ? `Open the link we sent to ${sentTo || 'your email'} to finish creating your account. Already have one? Sign in instead.`
          : c.sub;
  const oauth = (mode === 'signin' || mode === 'signup') && caps.google;
  const linkClass = 'border-0 bg-transparent p-0 font-semibold text-ink no-underline hover:underline cursor-pointer';

  return (
    <Dialog open={open} onClose={onClose} title={c.title} hideTitle initialFocus={focusTarget}>
      <form noValidate onSubmit={submit} className="-mt-4 flex flex-col text-center">
        <span className="mb-3 inline-grid place-items-center text-brand" aria-hidden="true">
          <BrandGlyph size={26} />
        </span>
        <p aria-hidden="true" className="m-0 text-lg font-bold text-ink">
          {c.title}
        </p>
        <p className="mt-2 mb-5 text-sm text-ink-secondary">{sub}</p>

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
          {mode === 'signin' || mode === 'signup' || mode === 'forgot' ? (
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
              showStrength={mode === 'signup'}
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
            <SwitchLine text="Didn’t get it?" action="Resend" onClick={resend} />
          ) : mode === 'confirm' ? null : (
            <SwitchLine text="Remembered it?" action="Back to sign in" onClick={() => setMode('signin')} />
          )}
        </p>
        <p className="mt-2 mb-0 text-xs text-ink-muted">
          By continuing you agree to the{' '}
          <Link to="/terms" onClick={onClose} className="text-ink-muted underline underline-offset-2">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" onClick={onClose} className="text-ink-muted underline underline-offset-2">
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
