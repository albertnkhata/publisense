import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, FileText } from 'lucide-react';

/**
 * Real legal pages rather than the SPA catch-all.
 *
 * These exist because Google's OAuth branding form requires a privacy-policy and
 * terms-of-service URL on the app's own domain, and because "the link 200s only
 * because everything redirects home" is a broken promise the moment a visitor —
 * or a reviewer — clicks it.
 *
 * Written to describe what this app actually does today: Supabase for auth and
 * data, Vercel for hosting, Resend for transactional email, Google only if the
 * visitor chooses Google sign-in, no ad networks, no third-party analytics.
 * If any of that stops being true, this file is wrong and must change with it.
 */

const CONTACT = 'albertnkhata.s@gmail.com';
const UPDATED = '21 October 2026';

const LegalShell: React.FC<{
  icon: React.ReactNode;
  title: string;
  intro: string;
  children: React.ReactNode;
}> = ({ icon, title, intro, children }) => (
  <div className="max-w-3xl mx-auto px-4 py-10">
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xs">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center">
          {icon}
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{title}</h1>
      </div>
      <p className="text-xs font-mono uppercase tracking-wide text-zinc-400 mb-5">
        Publisense · last updated {UPDATED}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-5">{intro}</p>
      <div className="space-y-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</div>
      <div className="mt-8 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
        Questions, corrections or a request to delete your data:{' '}
        <a className="underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        . See also our{' '}
        <Link className="underline" to="/terms">
          Terms
        </Link>{' '}
        and{' '}
        <Link className="underline" to="/privacy">
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  </div>
);

const Section: React.FC<{ heading: string; children: React.ReactNode }> = ({ heading, children }) => (
  <section>
    <h2 className="font-semibold text-zinc-900 dark:text-white mb-1.5">{heading}</h2>
    <div className="space-y-2">{children}</div>
  </section>
);

export const PrivacyPage: React.FC = () => (
  <LegalShell
    icon={<Shield className="w-5 h-5" />}
    title="Privacy Policy"
    intro="Publisense is a public product-feedback index. This page lists exactly what we store, who processes it, and how to have it removed — in plain language rather than legal boilerplate."
  >
    <Section heading="What we store about you">
      <p>
        Your email address, the display name and handle you choose, an optional avatar, an
        optional short bio and location, and the timestamps of when you joined and last signed
        in. We also store what you do here: the signals (posts) and comments you write, the votes
        and reposts you cast, the products and people you follow, and — if you claim a product
        board — the work email address you submit with that claim.
      </p>
      <p>
        If you sign in with Google, we receive your email address, name and profile picture from
        Google. We never receive your Google password, and we cannot read your mail, files or
        anything else in your Google account.
      </p>
    </Section>

    <Section heading="Why we store it">
      <p>
        To sign you in, show your name and avatar next to what you post, count votes once per
        person, let maintainers answer feedback on their own product boards, and send you
        transactional email such as sign-in links and address confirmations. Nothing here is used
        to build an advertising profile, and we do not sell or rent data to anyone.
      </p>
    </Section>

    <Section heading="Who processes it">
      <p>
        <strong>Supabase</strong> hosts authentication and the database (EU region, Frankfurt).{' '}
        <strong>Vercel</strong> serves the website. <strong>Resend</strong> delivers transactional
        email. <strong>Google</strong> is involved only if you choose Google sign-in. Each of these
        sees only what is needed to perform its job — the email provider sees the message and
        recipient, not your activity on the site.
      </p>
    </Section>

    <Section heading="Cookies and local storage">
      <p>
        We use your browser's local storage, not advertising cookies, to keep you signed in, store
        your theme preference, and cache the page's data so it loads quickly. There are no
        third-party ad or tracking scripts on this site. Clearing your browser storage signs you
        out; it does not delete your account.
      </p>
    </Section>

    <Section heading="Public by design">
      <p>
        Publisense is a public index. Your handle, avatar, bio, posts, comments and the votes you
        cast on public signals are visible to anyone, including signed-out visitors and search
        engines. Your email address is never shown publicly.
      </p>
    </Section>

    <Section heading="Keeping and deleting it">
      <p>
        We keep your data while your account exists. Email us to have your account and its content
        deleted and we will remove it, along with the associated sign-in record. If you have claimed
        a product board, delete or transfer the claim first, or ask us to do it for you.
      </p>
    </Section>

    <Section heading="Your other rights">
      <p>
        Ask us for a copy of what we hold about you, ask us to correct it, or ask us to stop
        emailing you. Because the account is identified by your email address, we may need you to
        confirm from that address before acting, so that nobody else can request your data.
      </p>
    </Section>

    <Section heading="Changes to this policy">
      <p>
        If what we collect or who processes it changes, this page changes with it and the date at
        the top moves. Material changes will be announced on the site rather than quietly edited.
      </p>
    </Section>
  </LegalShell>
);

export const TermsPage: React.FC = () => (
  <LegalShell
    icon={<FileText className="w-5 h-5" />}
    title="Terms of Service"
    intro="These are the rules for using Publisense. They are deliberately short: use the site honestly, post things you have the right to post, and do not claim a product you do not represent."
  >
    <Section heading="What Publisense is">
      <p>
        A public index of product feedback. Anyone can read it. Anyone with an account can post
        signals, comment and vote. Product teams can claim their board and respond officially to
        feedback about their own product.
      </p>
    </Section>

    <Section heading="Your account">
      <p>
        Keep your sign-in email accurate and your access to it secure — that address is how you
        prove the account is yours. You are responsible for what is posted from your account. One
        person, one account; do not create accounts to multiply votes or evade a restriction.
      </p>
    </Section>

    <Section heading="What you post stays yours">
      <p>
        You keep ownership of what you write. By posting it here you give us permission to store it
        and display it publicly on the site, alongside your handle and avatar, and to show it in
        feeds and search results. That permission ends for new content when you delete it or your
        account; copies already cached by search engines or other services are outside our control.
      </p>
    </Section>

    <Section heading="What is not allowed">
      <p>
        Harassment, threats, impersonation, spam, deliberate vote manipulation, private personal
        information about other people, unlawful content, and posting under someone else's
        identity. Automated scraping that degrades the service is also not allowed.
      </p>
    </Section>

    <Section heading="Claiming a product board">
      <p>
        A claim is a request, not a right. It grants nothing until it is reviewed and approved, and
        approval is conditional on the work email you submit plausibly belonging to the product's
        organisation — we cannot verify mailbox ownership, so this is a human judgement and we may
        decline or reverse a claim. Claiming a product you do not represent, or misrepresenting your
        role at a company, is a breach of these terms and grounds for removal.
      </p>
    </Section>

    <Section heading="Moderation">
      <p>
        We may remove content, approve or decline claims, and suspend accounts that break these
        rules. Moderation decisions are ours, and content you disagree with is not by itself a
        reason for removal.
      </p>
    </Section>

    <Section heading="No warranty">
      <p>
        The site is provided as it is. Feedback here is user-generated opinion, not verified fact
        about any company, and nothing on the site is advice you should rely on for a purchasing,
        legal or financial decision. We do not guarantee uptime, and data can be lost.
      </p>
    </Section>

    <Section heading="Changes to these terms">
      <p>
        If these terms change materially, the date at the top moves and the change is announced on
        the site. Continuing to use Publisense afterwards means accepting the updated terms.
      </p>
    </Section>
  </LegalShell>
);
