import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../lib/ThemeProvider';
import { readThemePref, resolveTheme, THEME_KEY, toggledPref, writeThemePref } from '../lib/theme';
import { ComposerProvider } from '../shell/composer';
import { TabBar } from '../shell/TabBar';
import { TopBar } from '../shell/TopBar';
import { UserMenu } from '../shell/UserMenu';
import { renderWith, TEST_VIEWER } from './renderApp';

describe('theme preference', () => {
  it('defaults to system when nothing is stored', () => {
    expect(readThemePref()).toBe('system');
  });

  it('stores explicit choices and clears the key for system', () => {
    writeThemePref('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(readThemePref()).toBe('dark');
    writeThemePref('system');
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
    expect(readThemePref()).toBe('system');
  });

  it('ignores garbage in storage', () => {
    window.localStorage.setItem(THEME_KEY, 'purple');
    expect(readThemePref()).toBe('system');
  });

  it('resolves system against the OS setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(toggledPref('dark')).toBe('light');
    expect(toggledPref('light')).toBe('dark');
  });
});

function Toggle() {
  const { theme, pref, toggle, setPref } = useTheme();
  return (
    <>
      <span data-testid="state">
        {pref}/{theme}
      </span>
      <button onClick={toggle}>toggle</button>
      <button onClick={() => setPref('system')}>system</button>
    </>
  );
}

describe('ThemeProvider toggle', () => {
  it('applies data-theme on <html> and persists the choice', () => {
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    // matchMedia is stubbed to "light" in setup.ts
    expect(screen.getByTestId('state').textContent).toBe('system/light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => fireEvent.click(screen.getByText('toggle')));
    expect(screen.getByTestId('state').textContent).toBe('dark/dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');

    act(() => fireEvent.click(screen.getByText('toggle')));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');

    act(() => fireEvent.click(screen.getByText('system')));
    expect(screen.getByTestId('state').textContent).toBe('system/light');
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('starts from a stored preference', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('state').textContent).toBe('dark/dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('Appearance submenu', () => {
  it('drills into Appearance in UserMenu, switches themes, supports keyboard back, and resets on reopen', () => {
    renderWith(<UserMenu viewer={TEST_VIEWER} placement="topbar" />, { viewer: TEST_VIEWER });

    const trigger = screen.getByRole('button', { name: `Account menu for ${TEST_VIEWER.name}` });
    fireEvent.click(trigger);

    const appearanceRow = screen.getByRole('menuitem', { name: /Appearance/ });
    expect(appearanceRow.textContent).toContain('Device');

    // Open submenu with ArrowRight
    fireEvent.keyDown(appearanceRow, { key: 'ArrowRight' });
    const deviceOption = screen.getByRole('menuitemradio', { name: 'Use device theme' });
    const darkOption = screen.getByRole('menuitemradio', { name: 'Dark theme' });
    const lightOption = screen.getByRole('menuitemradio', { name: 'Light theme' });

    expect(deviceOption.getAttribute('aria-checked')).toBe('true');
    expect(darkOption.getAttribute('aria-checked')).toBe('false');
    expect(lightOption.getAttribute('aria-checked')).toBe('false');

    // ArrowLeft returns to the root menu
    fireEvent.keyDown(darkOption, { key: 'ArrowLeft' });
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeTruthy();

    // Click Appearance again and pick Dark theme
    fireEvent.click(screen.getByRole('menuitem', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');

    // Reopening starts at the root menu with the updated label
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Appearance/ }).textContent).toContain('Dark');

    // Pick Light theme, then back to Use device theme
    fireEvent.click(screen.getByRole('menuitem', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Use device theme' }));
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('drills into Appearance in the mobile TabBar sheet and switches theme', () => {
    renderWith(
      <ComposerProvider>
        <TabBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );

    fireEvent.click(screen.getByRole('button', { name: 'You' }));
    const appearanceBtn = screen.getByRole('button', { name: /Appearance/ });
    expect(appearanceBtn.textContent).toContain('Device');

    fireEvent.click(appearanceBtn);
    expect(screen.getByRole('radio', { name: 'Use device theme' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('switches theme from the signed-out desktop Appearance menu in TopBar and omits it when signed in', () => {
    const { unmount } = renderWith(
      <ComposerProvider>
        <TopBar />
      </ComposerProvider>,
      { viewer: null, path: '/feed' },
    );

    const trigger = screen.getByRole('button', { name: 'Appearance' });
    expect(trigger.className).toContain('max-sm:hidden');
    fireEvent.click(trigger);

    expect(screen.getByRole('menuitemradio', { name: 'Use device theme' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Use device theme' }));
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
    unmount();

    renderWith(
      <ComposerProvider>
        <TopBar />
      </ComposerProvider>,
      { viewer: TEST_VIEWER, path: '/feed' },
    );
    expect(screen.queryByRole('button', { name: 'Appearance' })).toBeNull();
  });
});
