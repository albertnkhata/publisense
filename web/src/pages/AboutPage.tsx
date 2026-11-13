import { Link } from 'react-router';
import { useClaim } from '../claim/ClaimDialog';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { useAuthDialog } from '../shell/auth';
import { Button, Card, Icon, type IconName } from '../ui';

const CONTACT = 'support@publisense.app';

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'arrow-up',
    title: 'Share & rank feedback',
    body: 'Anyone can read every board. Signed-in members report bugs, log friction, or request features—and upvote what slows them down most.',
  },
  {
    icon: 'shield',
    title: 'Teams prove ownership',
    body: 'Makers claim their product’s board by verifying control of its domain with a work email code or DNS record—never behind a paywall.',
  },
  {
    icon: 'check-circle',
    title: 'Follow real progress',
    body: 'Verified teams post official replies as the product, move requests from Under review to Shipped, and group products under a company hub.',
  },
];

const PRINCIPLES: Array<{ title: string; body: string }> = [
  {
    title: 'Public index by default',
    body: 'Product feedback belongs where the next person hitting the same edge case can find it, add context, and avoid filing a duplicate.',
  },
  {
    title: 'Verified team voice, accountable governance',
    body: 'Official replies only come from teams verified on the product’s domain. Anyone can report an inaccurate claim for independent staff review.',
  },
  {
    title: 'No ad tracking or lock-in',
    body: 'Zero advertising pixels or cross-site trackers. Turn off all emails in one click, or export a full JSON copy of your data any time.',
  },
];

/**
 * /about (`chrome: 'site'`): what Publisense is, how public feedback and
 * domain-verified board claiming work, and entry points into discovery or claiming.
 */
export function AboutPage() {
  usePageTitle('About');
  const { viewer } = useViewer();
  const { openAuth } = useAuthDialog();
  const { openClaim } = useClaim();

  return (
    <article aria-labelledby="page-title" className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <Link to="/" className="text-ink-secondary no-underline hover:text-ink hover:underline hover:underline-offset-2">
            Publisense
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-ink-secondary">
            About
          </span>
        </nav>
        <p className="mt-0 mb-1 font-mono text-xs text-ink-muted uppercase">How Publisense works</p>
        <h1 id="page-title" className="mt-0 mb-2 text-2xl font-bold text-ink">
          About Publisense
        </h1>
        <p className="m-0 text-md text-ink-secondary">
          Public product feedback, ranked by the people who use the software and answered directly by the teams who build it.
        </p>
      </div>

      <Card>
        <h2 className="mt-0 mb-2 text-lg font-semibold text-ink">Why we built a public index</h2>
        <p className="m-0 text-base text-ink-secondary">
          Most product feedback disappears into private support inboxes or scattered social threads. Users repeat the same workarounds without
          knowing whether a bug is already tracked, and product teams lose signal in the noise. Publisense puts every product’s bugs, friction
          notes, and requests in one open, searchable record.
        </p>
      </Card>

      <Card>
        <h2 id="about-how" className="mt-0 mb-4 text-lg font-semibold text-ink">
          How it works
        </h2>
        <div className="flex flex-col gap-4 divide-y divide-line">
          {STEPS.map((step) => (
            <div key={step.title} className="flex items-start gap-4 pt-4 first:pt-0">
              <span className="inline-grid size-8 shrink-0 place-items-center rounded-sm border border-line bg-subtle text-brand">
                <Icon name={step.icon} size={18} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="mt-0 mb-1 text-base font-semibold text-ink">{step.title}</h3>
                <p className="m-0 text-base text-ink-secondary">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mt-0 mb-4 text-lg font-semibold text-ink">Built in the open</h2>
        <div className="flex flex-col gap-4 divide-y divide-line">
          {PRINCIPLES.map((item) => (
            <section key={item.title} className="pt-4 first:pt-0">
              <h3 className="mt-0 mb-1 text-base font-semibold text-ink">{item.title}</h3>
              <p className="m-0 text-base text-ink-secondary">{item.body}</p>
            </section>
          ))}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4 bg-subtle">
        <div className="min-w-0 flex-1">
          <h2 className="mt-0 mb-1 text-md font-semibold text-ink">See what people are asking for</h2>
          <p className="m-0 text-sm text-ink-secondary">
            Browse live product boards or verify your domain to reply as your team.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/explore"
            className="inline-flex h-8 items-center justify-center rounded-md bg-brand px-4 text-base font-semibold whitespace-nowrap text-on-brand no-underline transition-colors duration-120 hover:bg-brand-hover"
          >
            Explore products
          </Link>
          <Button variant="secondary" onClick={() => openClaim()}>
            Claim a board
          </Button>
          {!viewer ? (
            <Button variant="ghost" onClick={() => openAuth('signup')}>
              Create account
            </Button>
          ) : null}
        </div>
      </Card>

      <p className="m-0 text-sm text-ink-muted">
        Questions or feedback about Publisense itself? Write to{' '}
        <a href={`mailto:${CONTACT}`} className="font-semibold text-ink underline underline-offset-2 hover:text-brand">
          {CONTACT}
        </a>{' '}
        or read our{' '}
        <Link to="/terms" className="font-semibold text-ink underline underline-offset-2 hover:text-brand">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="font-semibold text-ink underline underline-offset-2 hover:text-brand">
          Privacy Policy
        </Link>
        .
      </p>
    </article>
  );
}
