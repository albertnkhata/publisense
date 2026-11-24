import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { isPrefKind, unsubscribe, UNSUBSCRIBE_LABELS, type PrefKind, type UnsubscribeOutcome } from '../api';
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
 * /unsubscribe?token=[&kind=] (FOUNDATION §9): one click from an email, no sign-in.
 * Turns off just that email category when `kind` is present (with an optional
 * "Unsubscribe from all emails" button), or every email when `kind` is omitted.
 * An unknown token or malformed parameter gets the same calm, neutral answer.
 */
export function UnsubscribePage() {
  usePageTitle('Unsubscribe');
  const [params] = useSearchParams();
  const token = params.get('token');
  const rawKind = params.get('kind');
  const normalizedKind = rawKind ? rawKind.trim().toLowerCase() : null;
  const invalidKind = normalizedKind !== null && !isPrefKind(normalizedKind);
  const initialKind: PrefKind | null = normalizedKind && isPrefKind(normalizedKind) ? normalizedKind : null;

  const [scope, setScope] = useState<PrefKind | null>(initialKind);
  const [outcome, setOutcome] = useState<UnsubscribeOutcome | 'working'>(invalidKind ? 'invalid' : 'working');
  const ran = useRef<string | undefined>(undefined);

  const run = (targetKind: PrefKind | null) => {
    setScope(targetKind);
    setOutcome('working');
    void unsubscribe(token, targetKind).then(setOutcome);
  };

  useEffect(() => {
    const key = `${token ?? ''}|${normalizedKind ?? ''}`;
    // Once per (token, kind), even under StrictMode's double effect (the RPC is idempotent anyway).
    if (ran.current === key) return;
    ran.current = key;
    if (invalidKind) {
      setOutcome('invalid');
      return;
    }
    run(initialKind);
  }, [token, normalizedKind, invalidKind]);

  const label = scope ? UNSUBSCRIBE_LABELS[scope] : null;

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-dialog">
      <h1 id="page-title" className="mt-0 mb-2 text-2xl font-bold text-ink">
        Unsubscribe
      </h1>
      <p className="mt-0 mb-5 text-base text-ink-secondary">Manage your email updates without signing in.</p>
      <Card padding="none" aria-live="polite">
        {outcome === 'working' ? (
          <div role="status" className="flex items-center justify-center gap-2 px-4 py-9 text-base text-ink-muted">
            <Spinner /> {label ? `Turning off ${label}…` : 'Turning off emails…'}
          </div>
        ) : outcome === 'done' ? (
          <EmptyState
            icon="check-circle"
            title="You’re unsubscribed"
            action={
              scope ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {settingsLink}
                  <Button variant="ghost" onClick={() => run(null)}>
                    Unsubscribe from all emails
                  </Button>
                </div>
              ) : (
                settingsLink
              )
            }
          >
            {label
              ? `We won’t send you ${label} anymore. Other email updates and in-app notifications stay on, and you can adjust everything in Settings.`
              : 'We won’t send you any more emails. Notifications still show in the app, and you can turn emails back on in Settings.'}
          </EmptyState>
        ) : outcome === 'offline' ? (
          <EmptyState icon="mail" title="We couldn’t reach Publisense" action={<Button onClick={() => run(scope)}>Try again</Button>}>
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
