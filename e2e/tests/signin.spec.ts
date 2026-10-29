import { expect, test, type Page } from '@playwright/test';

/**
 * The real sign-in flow, in a real browser, against the live site (D-003).
 * Nothing here creates an account or sends an email: the wrong-password check uses
 * an address on the reserved .invalid domain, and the Google check stops at
 * Google's own page.
 */

const GOOGLE_CLIENT_ID = '435845896733-niul19ep912jje2lqnnqg9ssi1k4tuvj.apps.googleusercontent.com';

async function openSignIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to Publisense' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('the sign-in dialog opens with every way in', async ({ page }) => {
  const dialog = await openSignIn(page);
  await expect(dialog.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(dialog.getByLabel('Email address')).toBeVisible();
  await expect(dialog.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
});

test('a wrong password is refused by the real auth server', async ({ page }) => {
  const dialog = await openSignIn(page);
  await dialog.getByLabel('Email address').fill(`smoke-${Date.now()}@publisense-smoke.invalid`);
  await dialog.getByLabel('Password', { exact: true }).fill('not-the-password-123');
  const authCall = page.waitForResponse((r) => r.url().includes('/auth/v1/token') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  const res = await authCall;
  expect(res.status(), 'auth server should refuse, not error').toBe(400);
  await expect(dialog.getByRole('alert')).toContainText('That email and password don’t match');
  // Still signed out.
  await expect(dialog).toBeVisible();
});

test('Continue with Google reaches Google with our OAuth client', async ({ page }) => {
  const dialog = await openSignIn(page);
  await dialog.getByRole('button', { name: 'Continue with Google' }).click();
  await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 });
  const url = new URL(page.url());
  // Google may show its account chooser or a "browser not supported" page to a
  // headless browser; either is fine. A misconfigured client lands on /oauth/error.
  expect(url.pathname, `Google refused the request: ${page.url()}`).not.toContain('/error');
  const full = decodeURIComponent(page.url());
  expect(full).toContain(GOOGLE_CLIENT_ID);
  await expect(page.locator('body')).not.toContainText(/Error 400|redirect_uri_mismatch|invalid_client/);
});

test('a real account can sign in with its password', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are not set');
  const dialog = await openSignIn(page);
  await dialog.getByLabel('Email address').fill(email!);
  await dialog.getByLabel('Password', { exact: true }).fill(password!);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('Signed in')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
});
