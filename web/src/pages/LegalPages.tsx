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

const CONTACT = 'albertnkhata.s@gmail.com';
const UPDATED = '24 October 2026';

const linkClass = 'font-semibold text-ink underline underline-offset-2 hover:text-brand';

function LegalShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  usePageTitle(title);
  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title" className="mt-0 mb-1 text-2xl font-bold text-ink">
        {title}
      </h1>
      <p className="mt-0 mb-5 font-mono text-xs text-ink-muted uppercase">Publisense · last updated {UPDATED}</p>
      <Card>
        <p className="mt-0 mb-5 text-base text-ink-secondary">{intro}</p>
        <div className="flex flex-col gap-5 text-base text-ink-secondary">{children}</div>
        <p className="mt-7 mb-0 border-t border-line pt-4 text-sm text-ink-muted">
          Questions, corrections or anything you’d like removed:{' '}
          <a className={linkClass} href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . See also our{' '}
          <Link className={linkClass} to="/terms">
            Terms
          </Link>{' '}
          and{' '}
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

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mt-0 mb-2 text-md font-semibold text-ink">{heading}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro="Publisense is a public product-feedback index. This page lists exactly what we store, who processes it, and how to have it removed, in plain language rather than legal boilerplate."
    >
      <Section heading="What we store about you">
        <P>
          Your email address, the name and handle you choose, an optional photo and short bio, and when you joined. We also store what you do here:
          the posts and replies you write, the votes you cast, the boards, hubs, posts and people you follow, your notification settings, and, if you
          claim a board, the work email or domain you verify with that claim.
        </P>
        <P>
          If you sign in with Google, we receive your email address, name and profile picture from Google. We never receive your Google password, and
          we cannot read your mail, files or anything else in your Google account.
        </P>
      </Section>
      <Section heading="Why we store it">
        <P>
          To sign you in, show your name and photo next to what you post, count votes once per person, let teams answer feedback on their own boards,
          and send you the notifications you asked for. Nothing here is used to build an advertising profile, and we do not sell or rent data to
          anyone.
        </P>
      </Section>
      <Section heading="Who processes it">
        <P>
          <strong className="text-ink">Supabase</strong> hosts sign-in, the database and uploaded photos (EU region, Frankfurt).{' '}
          <strong className="text-ink">Vercel</strong> serves the website. <strong className="text-ink">Resend</strong> delivers email.{' '}
          <strong className="text-ink">Google</strong> is involved only if you choose Google sign-in. Each sees only what it needs to do its job.
        </P>
      </Section>
      <Section heading="Cookies and local storage">
        <P>
          We use your browser’s local storage, not advertising cookies, to keep you signed in and remember your theme. There are no third-party ad or
          tracking scripts on this site. Clearing your browser storage signs you out; it does not delete your account.
        </P>
      </Section>
      <Section heading="Public by design">
        <P>
          Publisense is a public index. Your handle, name, photo, bio, posts and replies are visible to anyone, including signed-out visitors and
          search engines. Your email address is never shown publicly.
        </P>
      </Section>
      <Section heading="Email">
        <P>
          Choose which notifications reach you by email in{' '}
          <Link className={linkClass} to="/settings">
            Settings
          </Link>
          . Every email has a one-click unsubscribe link that needs no sign-in. Sign-in and password emails are always sent, because the account
          depends on them.
        </P>
      </Section>
      <Section heading="Your copy, and deleting it">
        <P>
          Download a copy of your data as a JSON file from Settings, any time. You can also delete your account there: your profile, photo, votes,
          follows and notifications are removed, along with the sign-in record. Posts and replies stay, shown as from a deleted user, so threads
          others replied to still make sense. If you are the only owner of a board or hub, add another owner first.
        </P>
      </Section>
      <Section heading="Your other rights">
        <P>
          Ask us to correct what we hold, or for anything Settings does not cover. Because the account is identified by your email address, we may need
          you to confirm from that address before acting, so that nobody else can request your data.
        </P>
      </Section>
      <Section heading="Changes to this policy">
        <P>
          If what we collect or who processes it changes, this page changes with it and the date at the top moves. Material changes will be announced
          on the site rather than quietly edited.
        </P>
      </Section>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      intro="These are the rules for using Publisense. They are deliberately short: use the site honestly, post things you have the right to post, and do not claim a product you do not represent."
    >
      <Section heading="What Publisense is">
        <P>
          A public index of product feedback. Anyone can read it. Anyone with an account can post, reply, vote and follow. Product teams can claim
          their board and respond officially to feedback about their own product.
        </P>
      </Section>
      <Section heading="Your account">
        <P>
          Keep your sign-in email accurate and your access to it secure: that address is how you prove the account is yours. You are responsible for
          what is posted from your account. One person, one account; do not create accounts to multiply votes or evade a restriction.
        </P>
      </Section>
      <Section heading="What you post stays yours">
        <P>
          You keep ownership of what you write. By posting it here you give us permission to store it and display it publicly on the site, alongside
          your handle and photo, and to show it in feeds and search results. Deleting a post removes it from the site; copies already cached by
          search engines or other services are outside our control.
        </P>
      </Section>
      <Section heading="What is not allowed">
        <P>
          Harassment, threats, impersonation, spam, deliberate vote manipulation, private personal information about other people, unlawful content,
          and posting under someone else’s identity. Automated scraping that degrades the service is also not allowed.
        </P>
      </Section>
      <Section heading="Claiming a board">
        <P>
          A claim says you work on the product. You prove it by verifying control of the product’s domain, with a code sent to a work address or a
          DNS record. Claiming a product you do not represent, or misrepresenting your role, is a breach of these terms and grounds for removal.
          Anyone can report a wrong owner, and those reports are decided by Publisense staff, not by the team being reported.
        </P>
      </Section>
      <Section heading="Moderation">
        <P>
          Teams can hide posts on their own boards and block people from posting there. We may remove content and suspend accounts that break these
          rules. Content you disagree with is not by itself a reason for removal.
        </P>
      </Section>
      <Section heading="No warranty">
        <P>
          The site is provided as it is. Feedback here is user-generated opinion, not verified fact about any company, and nothing on the site is
          advice you should rely on for a purchasing, legal or financial decision. We do not guarantee uptime, and data can be lost.
        </P>
      </Section>
      <Section heading="Changes to these terms">
        <P>
          If these terms change materially, the date at the top moves and the change is announced on the site. Continuing to use Publisense
          afterwards means accepting the updated terms.
        </P>
      </Section>
    </LegalShell>
  );
}
