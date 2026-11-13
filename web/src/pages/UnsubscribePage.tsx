import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { unsubscribeAll, type UnsubscribeOutcome } from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { Button, Card, EmptyState, Spinner } from '../ui';

const settingsLink = (
  <Link
    to="/settings"
    className="inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-4 text-base font-semibold text-ink no-underline hover:bg-subtle"
  >
    Email settings
  </Link>
);

/**
 * /unsubscribe?token= (FOUNDATION §9): one click from an email, no sign-in.
 * Turns every email off. An unknown or malformed token gets the same calm,
 * neutral answer, so the page never confirms which tokens exist.
 */
export function UnsubscribePage() {
  usePageTitle('Unsubscribe');
  const [params] = useSearchParams();
  const token = params.get('token');
  const [outcome, setOutcome] = useState<UnsubscribeOutcome | 'working'>('working');
  const ran = useRef<string | null | undefined>(undefined);

  const run = () => {
    setOutcome('working');
    void unsubscribeAll(token).then(setOutcome);
  };

  useEffect(() => {
    // Once per token, even under StrictMode's double effect (the RPC is idempotent anyway).
    if (ran.current === token) return;
    ran.current = token;
    run();
  }, [token]);

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-dialog">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
        <Link to="/" className="text-ink-secondary no-underline hover:text-ink hover:underline hover:underline-offset-2">
          Publisense
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-ink-secondary">
          Unsubscribe
        </span>
      </nav>
      <h1 id="page-title" className="mt-0 mb-2 text-2xl font-bold text-ink">
        Unsubscribe
      </h1>
      <p className="mt-0 mb-5 text-base text-ink-secondary">Manage your email updates without signing in.</p>
      <Card padding="none" aria-live="polite">
        {outcome === 'working' ? (
          <div role="status" className="flex items-center justify-center gap-2 px-4 py-9 text-base text-ink-muted">
            <Spinner /> Turning off emails…
          </div>
        ) : outcome === 'done' ? (
          <EmptyState icon="check-circle" title="You’re unsubscribed" action={settingsLink}>
            We won’t send you any more emails. Notifications still show in the app, and you can turn emails back on in Settings.
          </EmptyState>
        ) : outcome === 'offline' ? (
          <EmptyState icon="mail" title="We couldn’t reach Publisense" action={<Button onClick={run}>Try again</Button>}>
            Nothing has changed yet. Check your connection and try again.
          </EmptyState>
        ) : (
          <EmptyState icon="mail" title="This link didn’t work" action={settingsLink}>
            It may be incomplete or out of date. You can turn emails off any time in Settings.
          </EmptyState>
        )}
      </Card>
    </section>
  );
}
