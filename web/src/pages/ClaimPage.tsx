import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useClaim } from '../claim/ClaimDialog';
import { CLAIM_ACTIONS, useClaimTarget } from '../claim/claimTarget';
import { CLAIM_PATH } from '../lib/claimLink';
import { usePageMeta } from '../lib/usePageMeta';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { useAuthDialog } from '../shell/auth';
import { Button, Card, Icon, type IconName } from '../ui';

/*
 * /claim: how board claiming works, readable signed out (#157).
 *
 * Every line here describes what the code does today, read from the claim flow
 * (src/claim/ClaimDialog.tsx) and its RPCs (0021 claims and teams, 0022
 * moderation, 0024 add product, 0026 companies, 0017 statuses and official
 * replies). Nothing planned is promised. If the flow changes, this page is wrong
 * and must change with it; the copy lives in CLAIM_COPY so tests quote one source.
 *
 * Signed out, the call to action opens sign-up (claiming needs an account).
 * Signed in, it opens the claim flow itself. ?board=<slug> or ?hub=<slug>
 * (the claim intro modal's "Learn more") names the product.
 *
 * Signed-out entry points open the short claim intro modal first
 * (src/claim/ClaimIntro.tsx); this page is its "Learn more" and stays public,
 * crawlable and in the sitemap.
 */

interface Item {
  icon: IconName;
  title: string;
  text: string;
}

export const CLAIM_COPY = {
  pageTitle: 'How claiming works',
  metaDescription:
    'Work on a product with a Publisense board? Verify your company’s domain to claim it, then reply officially, set statuses and run its roadmap with your team.',
  title: 'How claiming works',
  lead: 'Every product on Publisense has a public board where people post bugs and feature requests. If you work on the product, you can claim its board: prove you work there, and your team can answer officially.',
  signupReason: CLAIM_ACTIONS.signupReason,

  whoTitle: 'Who can claim',
  who: [
    'Anyone with a Publisense account who can prove they work at the company. The proof is the domain of the product’s website, the one shown on its board.',
    'Shared email and hosting domains, such as gmail.com, can’t be used as proof.',
    'A board needs a website before it can be claimed.',
  ],

  stepsTitle: 'How you verify',
  steps: [
    { title: 'Open your product’s board', text: 'Find it in search or Explore, and start a claim from the board’s header.' },
    {
      title: 'Prove the domain',
      text: 'With your work email: enter your address on the product’s domain and type the 6-digit code we send. The code expires in 10 minutes. No company email? Add a TXT record we give you to the domain’s DNS instead, then check. DNS changes can take a few minutes to show up, and you can come back to check later.',
    },
    {
      title: 'The board is yours',
      text: 'You become its owner straight away. If the product belongs to a company hub on a domain you proved, you can claim the whole hub, and every product in it, in the same step.',
    },
  ],

  teamTitle: 'What your team can do',
  team: [
    { icon: 'shield', title: 'Get the verified badge', text: 'The board shows “Verified team”, and your team’s official replies carry a Team badge.' },
    { icon: 'reply', title: 'Reply officially', text: 'Official replies are pinned to the top of a post’s replies and quoted on its card in the feed.' },
    {
      icon: 'status-planned',
      title: 'Set statuses',
      text: 'Mark posts Under review, Planned, In progress, Shipped or Closed, with an optional official reply. Everyone following the post is notified.',
    },
    { icon: 'check-circle', title: 'Run the roadmap and changelog', text: 'Planned and in-progress posts fill the board’s roadmap, and shipped posts its changelog.' },
    { icon: 'status-open', title: 'Triage in one place', text: 'A Manage page only your team sees lists new posts with no status yet, most upvoted first.' },
    { icon: 'eye-off', title: 'Keep the board tidy', text: 'Merge duplicate posts and hide posts or replies on your board.' },
    { icon: 'edit', title: 'Edit the board', text: 'Admins can change its logo and description. The website stays locked to the verified domain.' },
    {
      icon: 'user-plus',
      title: 'Bring your teammates',
      text: 'Add people who have a Publisense account and an address on your domain. Members reply officially and set statuses; admins also manage settings and the team. Coworkers can also ask to join from the board, and admins approve them.',
    },
  ] satisfies Item[],

  usersTitle: 'What changes for people posting',
  users: [
    { icon: 'globe', title: 'The board stays public', text: 'Anyone can still read it, and anyone with an account can still post, upvote and follow.' },
    { icon: 'shield', title: 'Answers from the real team', text: 'Replies with the Team badge come from people who proved they work at the company.' },
    { icon: 'bell', title: 'Status updates reach them', text: 'Upvoting a post follows it, so voters hear when its status changes.' },
    {
      icon: 'status-merged',
      title: 'Duplicates come together',
      text: 'When the team merges a duplicate, its votes and followers move to the post it was merged into.',
    },
  ] satisfies Item[],

  takenTitle: 'Already claimed?',
  taken: [
    'If a verified team already runs the board, you can ask to join. We check your work email, then the board’s admins approve you. Requests expire after 14 days.',
    'If you think the wrong people have it, report it. You verify the domain yourself and the Publisense team reviews your report. The board stays as it is until then.',
    'An owner can give a board up at any time. It goes back to unclaimed, and someone at the company can claim it again.',
  ],

  ctaTitle: 'Ready to claim your board?',
  ctaSignedOut: 'Claiming needs a Publisense account. It takes a few seconds, and you can verify right after.',
  ctaSignedIn: 'Pick your product and verify your domain. It takes a couple of minutes.',
  signUp: CLAIM_ACTIONS.signUp,
  signIn: CLAIM_ACTIONS.signIn,
  claim: 'Claim a board',
};

export function ClaimPage() {
  usePageTitle(CLAIM_COPY.pageTitle);
  usePageMeta({ title: CLAIM_COPY.pageTitle, description: CLAIM_COPY.metaDescription, path: CLAIM_PATH });
  const c = CLAIM_COPY;
  return (
    <article aria-labelledby="page-title" className="flex flex-col gap-5">
      <header>
        <h1 id="page-title" className="mt-0 mb-2 text-2xl font-bold text-ink">
          {c.title}
        </h1>
        <p className="m-0 text-base text-ink-secondary">{c.lead}</p>
      </header>
      <ClaimTarget />
      <ClaimCta compact />

      <Section heading={c.whoTitle}>
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-base text-ink-secondary">
          {c.who.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Section>

      <Section heading={c.stepsTitle}>
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {c.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-pill bg-subtle font-mono text-xs font-semibold text-ink">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <b className="text-base font-semibold text-ink">{s.title}</b>
                <span className="text-base text-ink-secondary">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section heading={c.teamTitle}>
        <Items items={c.team} />
      </Section>

      <Section heading={c.usersTitle}>
        <Items items={c.users} />
      </Section>

      <Section heading={c.takenTitle}>
        <div className="flex flex-col gap-2 text-base text-ink-secondary">
          {c.taken.map((t) => (
            <p key={t} className="m-0">
              {t}
            </p>
          ))}
        </div>
      </Section>

      <ClaimCta />
    </article>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  const id = `claim-${heading.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`;
  return (
    <Card as="section" aria-labelledby={id}>
      <h2 id={id} className="mt-0 mb-3 text-md font-semibold text-ink">
        {heading}
      </h2>
      {children}
    </Card>
  );
}

function Items({ items }: { items: Item[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((it) => (
        <li key={it.title} className="flex items-start gap-3">
          <span className="mt-1 text-brand">
            <Icon name={it.icon} size={16} />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <b className="text-base font-semibold text-ink">{it.title}</b>
            <span className="text-base text-ink-secondary">{it.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The product named by ?board= or ?hub=, when it loads. */
function useTarget() {
  const [params] = useSearchParams();
  return useClaimTarget({ board: params.get('board'), hub: params.get('hub') });
}

function ClaimTarget() {
  const t = useTarget();
  if (!t) return null;
  const back = t.kind === 'board' ? `/b/${t.slug}` : `/h/${t.slug}`;
  return (
    <p className="m-0 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">
      {t.claimed ? (
        <>
          <b className="font-semibold text-ink">{t.name}</b> is already claimed by a verified team. See “{CLAIM_COPY.takenTitle}” below.
        </>
      ) : t.domain ? (
        <>
          To claim <b className="font-semibold text-ink">{t.name}</b>, you’ll prove you can use the <b className="font-semibold text-ink">{t.domain}</b> domain.
        </>
      ) : (
        <>
          <b className="font-semibold text-ink">{t.name}</b> has no website to verify yet, so it can’t be claimed for now.
        </>
      )}{' '}
      <Link to={back} className="font-semibold text-ink underline underline-offset-2 hover:text-brand">
        Back to {t.name}
      </Link>
    </p>
  );
}

/** Sign up (signed out) or start the claim (signed in). */
export function ClaimCta({ compact = false }: { compact?: boolean }) {
  const { viewer } = useViewer();
  const { openAuth } = useAuthDialog();
  const { openClaim } = useClaim();
  const t = useTarget();
  const c = CLAIM_COPY;
  const label = viewer ? (t && !t.claimed ? `Claim ${t.name}` : c.claim) : c.signUp;
  const start = () => {
    if (!viewer) return openAuth('signup', c.signupReason);
    openClaim(t ? (t.kind === 'board' ? { board: t.slug } : { hub: t.slug }) : undefined);
  };
  const buttons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size={compact ? 'sm' : 'md'} onClick={start}>
        {label}
      </Button>
      {viewer ? null : (
        <Button size={compact ? 'sm' : 'md'} variant="secondary" onClick={() => openAuth('signin', c.signupReason)}>
          {c.signIn}
        </Button>
      )}
    </div>
  );
  if (compact) return buttons;
  return (
    <Card as="section" aria-labelledby="claim-cta">
      <h2 id="claim-cta" className="mt-0 mb-1 text-md font-semibold text-ink">
        {c.ctaTitle}
      </h2>
      <p className="mt-0 mb-3 text-base text-ink-secondary">{viewer ? c.ctaSignedIn : c.ctaSignedOut}</p>
      {buttons}
    </Card>
  );
}
