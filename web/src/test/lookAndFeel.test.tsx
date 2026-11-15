import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { NavRail } from '../shell/NavRail';
import { PostRow, Section } from '../boards/parts';
import { ComposerProvider } from '../shell/composer';
import { trendingNote, trendingTitle, TRENDING_MIN_CURATED } from '../lib/trendingCopy';
import { renderWith, TEST_VIEWER } from './renderApp';

/*
 * Look-and-feel review items 5a and 5b. Item 5d (an About page linked from the
 * footer) shipped upstream in 9cf899d and is covered by publicPages.test.tsx.
 */

describe('collapsed nav rail names its rows (item 5a)', () => {
  beforeEach(() => {
    window.localStorage.setItem('publisense:nav-collapsed', '1');
  });

  it('gives every primary row an accessible name even when the label is invisible', () => {
    renderWith(
      <ComposerProvider>
        <NavRail />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    for (const name of ['Home', 'Explore', 'Following']) {
      expect(screen.getByRole('link', { name })).toBeTruthy();
    }
  });

  it('shows the row label on hover with no delay, since the tip is the only label', async () => {
    renderWith(
      <ComposerProvider>
        <NavRail />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    const home = screen.getByRole('link', { name: 'Home' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerEnter(home);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe('Home');
    expect(home.getAttribute('aria-describedby')).toBe(tip.id);

    fireEvent.pointerLeave(home);
    const account = screen.getByRole('button', { name: `Account menu for ${TEST_VIEWER.name}` });
    fireEvent.pointerEnter(account);
    const accountTip = await screen.findByRole('tooltip');
    expect(accountTip.textContent).toBe('Account menu');
  });
});

describe('sparse trending lists say what they are (item 5b)', () => {
  it('claims a ranking only from three entries up', () => {
    expect(TRENDING_MIN_CURATED).toBe(3);
    expect(trendingTitle(5)).toBe('Trending this week');
    expect(trendingTitle(3)).toBe('Trending this week');
    expect(trendingTitle(2)).toBe('New this week');
    expect(trendingTitle(1)).toBe('New this week');
    expect(trendingNote(4)).toBe('Most new posts this week');
    expect(trendingNote(1)).toBe('New posts this week');
  });
});

describe('mobile clips found in the 390px review screenshot (item 3)', () => {
  /*
   * jsdom applies no CSS, so these are tripwires, not proof: they fail if the class
   * that keeps the text inside its box is deleted. The measurements behind them were
   * taken in Chromium against the deployed stylesheet (see the PR body).
   */
  it('keeps the floating Post button from covering a section note on phones, but preserves actions', () => {
    renderWith(
      <Section id="t" title="Latest requests" note="Newest across all boards" action={<button type="button">Sort</button>}>
        <p>rows</p>
      </Section>,
    );
    const note = screen.getByText('Newest across all boards');
    expect(note.className).toContain('max-sm:hidden');
    const sortBtn = screen.getByRole('button', { name: 'Sort' });
    expect(sortBtn.parentElement?.className).not.toContain('max-sm:hidden');
  });

  it('breaks a long request title inside its row', () => {
    const post = { id: 'p1', title: 'Let users watch Duet work and take over', type: 'feature', vote_count: 2,
                   created_at: new Date().toISOString(), board: { name: 'Claude Duet', slug: 'claude-duet' } } as never;
    renderWith(<PostRow post={post} />);
    const title = screen.getByText('Let users watch Duet work and take over');
    expect(title.className).toContain('wrap-anywhere');
  });
});
