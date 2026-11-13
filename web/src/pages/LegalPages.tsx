import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { usePageTitle } from '../lib/usePageTitle';
import { Card } from '../ui';

/*
 * /privacy and /terms. The reference mockup only links to these, so the text is
 * ported from v1 (src/pages/LegalPage.tsx, which Google's OAuth branding review
 * points at) and updated for what v2 does: settings for export and deletion,
 * one-click unsubscribe, and domain-verified board claims.
 * If any of this stops being true, this file is wrong and must change with it.
 */

const CONTACT = 'support@publisense.app';
const UPDATED = '8 November 2026';

const linkClass = 'font-semibold text-ink underline underline-offset-2 hover:text-brand';

interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

function LegalShell({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  usePageTitle(title);
  return (
    <article aria-labelledby="page-title">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
        <Link to="/" className="text-ink-secondary no-underline hover:text-ink hover:underline hover:underline-offset-2">
          Publisense
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-ink-secondary">
          {title}
        </span>
      </nav>
      <h1 id="page-title" className="mt-0 mb-1 text-2xl font-bold text-ink">
        {title}
      </h1>
      <p className="mt-0 mb-5 font-mono text-xs text-ink-muted uppercase">Publisense · last updated {UPDATED}</p>
      <Card>
        <p className="mt-0 mb-4 text-md text-ink">{intro}</p>
        <nav aria-label="On this page" className="mb-6 flex flex-wrap gap-2 border-y border-line py-3">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-pill border border-line bg-subtle px-3 py-1 text-xs font-medium text-ink-secondary no-underline transition-colors duration-120 hover:border-line-strong hover:text-ink"
            >
              {s.heading}
            </a>
          ))}
        </nav>
        <div className="flex flex-col gap-6 divide-y divide-line text-base text-ink-secondary">
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-heading`} className="scroll-mt-10 pt-6 first:pt-0">
              <h2 id={`${s.id}-heading`} className="mt-0 mb-2 text-md font-semibold text-ink">
                {s.heading}
              </h2>
              <div className="flex flex-col gap-3">{s.body}</div>
            </section>
          ))}
        </div>
        <p className="mt-7 mb-0 border-t border-line pt-4 text-sm text-ink-muted">
          Questions, corrections or anything you’d like removed:{' '}
          <a className={linkClass} href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . See also{' '}
          <Link className={linkClass} to="/about">
            About Publisense
          </Link>
          , our{' '}
          <Link className={linkClass} to="/terms">
            Terms
          </Link>
          , and our{' '}
          <Link className={linkClass} to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Card>
    </article>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="m-0">{children}</p>;
}

export function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro="This policy explains what information Publisense collects, how we use it, who processes it on our behalf, and how you can access or delete it."
      sections={[
        {
          id: 'what-we-store',
          heading: 'What we store about you',
          body: (
            <>
              <P>
                When you have an account: your email address, the name and handle you choose, an optional photo and short bio, and when you joined. We
                also store what you do here: the posts, saved drafts, screenshots and replies you write, the direct messages you send, the votes you
                cast, the boards, hubs, posts and people you follow, accounts you block, your notification and message settings, and, if you claim a
                board, the work email or domain you verify with that claim.
              </P>
              <P>
                For all visitors: we record individual usage events, such as the page path you viewed, the website that referred you, search terms
                that found no results, and whether steps like claiming a board succeed or fail. Events from one browser tab are grouped by a temporary
                random visit token that is not linked to your account. We keep these individual events for 30 days and then roll them into daily
                totals. They never include your name, email address or IP address.
              </P>
              <P>
                If you sign in with Google, we receive your email address, name and profile picture from Google. We never receive your Google password,
                and we cannot read your mail, files or anything else in your Google account.
              </P>
            </>
          ),
        },
        {
          id: 'why-we-store',
          heading: 'Why we store it',
          body: (
            <P>
              To sign you in, show your name and photo next to what you post, count votes once per person, let teams answer feedback on their own
              boards, deliver direct messages and the notifications you asked for, and understand how the site is being used so we can improve it.
              Nothing here is used to build an advertising profile, and we do not sell or rent data to anyone.
            </P>
          ),
        },
        {
          id: 'who-processes',
          heading: 'Who processes it',
          body: (
            <P>
              <strong className="text-ink">Supabase</strong> hosts sign-in, the database, first-party usage events and uploaded photos (EU region,
              Frankfurt). <strong className="text-ink">Vercel</strong> serves the website and counts page views without cookies or personal
              identifiers. <strong className="text-ink">Sentry</strong> receives crash reports (the error and the page it happened on, not your name or
              email) so we can fix bugs. <strong className="text-ink">Resend</strong> delivers email.{' '}
              <strong className="text-ink">Google</strong> is involved only if you choose Google sign-in. Each sees only what it needs to do its job.
            </P>
          ),
        },
        {
          id: 'cookies-storage',
          heading: 'Cookies and browser storage',
          body: (
            <P>
              We use your browser’s local and session storage for essential site functions—such as keeping you signed in, remembering your theme and
              recent searches, holding your place during sign-up or board claiming, and grouping page views within a single visit using a temporary
              random token. We do not use advertising cookies or cross-site tracking scripts. Clearing your browser storage signs you out and resets
              these preferences; it does not delete your account.
            </P>
          ),
        },
        {
          id: 'public-by-design',
          heading: 'Public by design',
          body: (
            <P>
              Publisense is a public index. Your handle, name, photo, bio, posts and replies are visible to anyone, including signed-out visitors and
              search engines. Your email address, saved drafts and direct messages are never shown publicly.
            </P>
          ),
        },
        {
          id: 'email',
          heading: 'Email',
          body: (
            <P>
              Choose which notifications reach you by email in{' '}
              <Link className={linkClass} to="/settings">
                Settings
              </Link>
              . Every email has a one-click unsubscribe link that needs no sign-in. Sign-in and password emails are always sent, because the account
              depends on them.
            </P>
          ),
        },
        {
          id: 'your-copy',
          heading: 'Your copy, and deleting it',
          body: (
            <P>
              Download a copy of your data as a JSON file from Settings, any time. You can also delete your account there: your profile, photo, saved
              drafts, uploaded screenshots, direct messages, votes, follows and notifications are removed, along with the sign-in record. Posts and
              replies stay, shown as from a deleted user, so threads others replied to still make sense. If you are the only owner of a board or hub,
              add another owner first.
            </P>
          ),
        },
        {
          id: 'other-rights',
          heading: 'Your other rights',
          body: (
            <P>
              Ask us to correct what we hold, or for anything Settings does not cover. Because the account is identified by your email address, we may
              need you to confirm from that address before acting, so that nobody else can request your data.
            </P>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to this policy',
          body: (
            <P>
              If what we collect or who processes it changes, this page changes with it and the date at the top moves. Material changes will be
              announced on the site rather than quietly edited.
            </P>
          ),
        },
      ]}
    />
  );
}

export function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      intro="These terms govern your use of Publisense. By creating an account or posting on the site, you agree to them."
      sections={[
        {
          id: 'what-publisense-is',
          heading: 'What Publisense is',
          body: (
            <P>
              A public index of product feedback. Anyone can read it. Anyone with an account can post, reply, vote and follow. Product teams can claim
              their board and respond officially to feedback about their own product.
            </P>
          ),
        },
        {
          id: 'your-account',
          heading: 'Your account',
          body: (
            <P>
              Keep your sign-in email accurate and your access to it secure: that address is how you prove the account is yours. You are responsible
              for what is posted from your account. One person, one account; do not create accounts to multiply votes or evade a restriction.
            </P>
          ),
        },
        {
          id: 'ownership',
          heading: 'What you post stays yours',
          body: (
            <P>
              You keep ownership of what you write. By posting it here you give us permission to store it and display it publicly on the site,
              alongside your handle and photo, and to show it in feeds and search results. Deleting a post removes it from the site; copies already
              cached by search engines or other services are outside our control.
            </P>
          ),
        },
        {
          id: 'prohibited',
          heading: 'What is not allowed',
          body: (
            <P>
              Harassment, threats, impersonation, spam, deliberate vote manipulation, private personal information about other people, unlawful
              content, and posting under someone else’s identity. Automated scraping that degrades the service is also not allowed.
            </P>
          ),
        },
        {
          id: 'claiming',
          heading: 'Claiming a board',
          body: (
            <P>
              A claim says you work on the product. You prove it by verifying control of the product’s domain, with a code sent to a work address or a
              DNS record. Claiming a product you do not represent, or misrepresenting your role, is a breach of these terms and grounds for removal.
              Anyone can report a wrong owner, and those reports are decided by Publisense staff, not by the team being reported.
            </P>
          ),
        },
        {
          id: 'moderation',
          heading: 'Moderation',
          body: (
            <P>
              Teams can hide posts on their own boards and block people from posting there. We may remove content and suspend accounts that break these
              rules. Content you disagree with is not by itself a reason for removal.
            </P>
          ),
        },
        {
          id: 'no-warranty',
          heading: 'No warranty',
          body: (
            <P>
              The site is provided as it is. Feedback here is user-generated opinion, not verified fact about any company, and nothing on the site is
              advice you should rely on for a purchasing, legal or financial decision. We do not guarantee uptime, and data can be lost.
            </P>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to these terms',
          body: (
            <P>
              If these terms change materially, the date at the top moves and the change is announced on the site. Continuing to use Publisense
              afterwards means accepting the updated terms.
            </P>
          ),
        },
      ]}
    />
  );
}
