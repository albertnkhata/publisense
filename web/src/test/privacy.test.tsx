import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { PrivacyPage } from '../pages/LegalPages';
import { renderWith } from './renderApp';

/* The usage-events paragraph must describe what is actually kept (0054), not call it aggregate. */
describe('privacy policy: usage events', () => {
  it('says individual events are kept 30 days, grouped by a temporary visit token, then rolled into daily totals', () => {
    renderWith(<PrivacyPage />, { path: '/privacy' });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/aggregate/i);
    expect(text).toMatch(/individual usage events/);
    expect(text).toMatch(/search terms that\s+found no results/);
    expect(text).toMatch(/temporary random\s+visit token/);
    expect(text).toMatch(/30 days and then roll them into daily totals/);
    expect(text).toMatch(/never include your name, email address or IP address/);
    expect(screen.getByText(/counts page views without cookies or personal identifiers/)).toBeTruthy();
  });
});
