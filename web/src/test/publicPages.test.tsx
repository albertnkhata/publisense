import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { ClaimProvider } from '../claim/ClaimDialog';
import { AboutPage } from '../pages/AboutPage';
import { AuthResetPage } from '../pages/AuthResetPage';
import { PrivacyPage, TermsPage } from '../pages/LegalPages';
import { renderWith, TEST_VIEWER } from './renderApp';

describe('AboutPage', () => {
  it('renders story, workflow steps, explore link, claim action, and create account when signed out', async () => {
    renderWith(
      <ClaimProvider>
        <AboutPage />
      </ClaimProvider>,
      { path: '/about', viewer: null },
    );

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'About Publisense' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Share & rank feedback' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Teams prove ownership' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Follow real progress' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Explore products' }).getAttribute('href')).toBe('/explore');

    fireEvent.click(screen.getByRole('button', { name: 'Claim a board' }));
    expect(await screen.findByRole('dialog', { name: 'Claim your board' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('dialog', { name: 'Create your account' })).toBeTruthy();
  });

  it('hides Create account when signed in', () => {
    renderWith(
      <ClaimProvider>
        <AboutPage />
      </ClaimProvider>,
      { path: '/about', viewer: TEST_VIEWER },
    );

    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  });
});

describe('LegalPages navigation', () => {
  it.each([
    ['Privacy Policy', '/privacy', PrivacyPage],
    ['Terms of Service', '/terms', TermsPage],
  ])('%s renders working On this page section anchors without duplicate breadcrumbs', (_title, path, Page) => {
    renderWith(<Page />, { path });
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(toc).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(8);
    for (const link of links) {
      const href = link.getAttribute('href');
      expect(href?.startsWith('#')).toBe(true);
      const target = document.getElementById(href!.slice(1));
      expect(target).toBeTruthy();
    }
  });
});

describe('AuthResetPage', () => {
  it('renders both Send a new link and Sign in actions when expired or signed out', async () => {
    renderWith(<AuthResetPage />, { path: '/auth/reset', viewer: null });

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByRole('dialog', { name: 'Reset your password' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('dialog', { name: 'Sign in to Publisense' })).toBeTruthy();
  });
});
