import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../lib/ThemeProvider';
import { readThemePref, resolveTheme, THEME_KEY, toggledPref, writeThemePref } from '../lib/theme';

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
