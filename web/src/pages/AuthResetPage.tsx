import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AUTH_COPY, MIN_PASSWORD, completePasswordReset, recoverySignal } from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { useAuthDialog } from '../shell/auth';
import { Button, Card, EmptyState, Field, PasswordInput, Spinner, useToast } from '../ui';

/** Read once, before anything clears it: did the link come back with an error? */
function linkError(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return Boolean(params.get('error') || params.get('error_code') || search.get('error') || search.get('error_code'));
}

/**
 * /auth/reset (FOUNDATION §7: forgot → sent → reset). The emailed link signs the
 * user in with a recovery session (PASSWORD_RECOVERY); this page sets the new
 * password and signs out every other session. Without a session the link is spent or expired, and the page offers a
 * fresh one without saying anything about the account.
 */
export function AuthResetPage() {
  usePageTitle('Set a new password');
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [failedLink] = useState(linkError);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(AUTH_COPY.shortPassword);
    setBusy(true);
    const r = await completePasswordReset(password);
    setBusy(false);
    if (r.error) return setError(r.error);
    recoverySignal.clear();
    toast('Password updated · other devices were signed out');
    navigate('/', { replace: true });
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-dialog">
      <h1 id="page-title" className="mt-0 mb-2 text-2xl font-bold text-ink">
        Set a new password
      </h1>
      {!ready ? (
        <div className="flex items-center gap-2 py-6 text-base text-ink-muted" role="status">
          <Spinner /> Checking your link…
        </div>
      ) : !viewer || failedLink ? (
        <Card padding="none">
          <EmptyState
            icon="lock"
            title="This reset link has expired or was already used"
            action={<Button onClick={() => openAuth('forgot')}>Send a new link</Button>}
          >
            Links work once and expire after an hour. Ask for a new one and open it from the same browser.
          </EmptyState>
        </Card>
      ) : (
        <>
          <p className="mt-0 mb-5 text-base text-ink-secondary">Choose a password you don’t use anywhere else.</p>
          <Card>
            <form noValidate onSubmit={submit} className="flex flex-col gap-4">
              <Field label="New password" hint="At least 8 characters" error={error || undefined}>
                <PasswordInput
                  autoComplete="new-password"
                  showStrength
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                />
              </Field>
              {viewer.email ? <p className="m-0 text-sm text-ink-muted">For {viewer.email}</p> : null}
              <Button type="submit" block loading={busy}>
                Save and sign in
              </Button>
            </form>
          </Card>
        </>
      )}
    </section>
  );
}
