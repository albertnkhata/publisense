/**
 * Theme preference: light, dark, or follow the system (the default).
 * The preference is stored; the resolved theme is applied as
 * <html data-theme="light|dark">. index.html applies it before first paint
 * using the same key, so keep THEME_KEY in sync with that inline script.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'publisense:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readThemePref(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ThemePref {
  try {
    const v = storage?.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePref(pref: ThemePref, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()): void {
  try {
    if (pref === 'system') storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, pref);
  } catch {
    /* storage unavailable (private mode): the choice lasts for this page only */
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(pref: ThemePref, systemDark: boolean = systemPrefersDark()): ResolvedTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.setAttribute('data-theme', theme);
}

/** The toggle in the avatar menu: flips the resolved theme and stores an explicit choice. */
export function toggledPref(current: ResolvedTheme): ThemePref {
  return current === 'dark' ? 'light' : 'dark';
}

export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
