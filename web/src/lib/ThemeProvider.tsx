import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  readThemePref,
  resolveTheme,
  systemPrefersDark,
  toggledPref,
  watchSystemTheme,
  writeThemePref,
  type ResolvedTheme,
  type ThemePref,
} from './theme';

interface ThemeContextValue {
  pref: ThemePref;
  theme: ResolvedTheme;
  setPref: (pref: ThemePref) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => readThemePref());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());
  const theme = resolveTheme(pref, systemDark);

  useEffect(() => watchSystemTheme(setSystemDark), []);
  useEffect(() => applyTheme(theme), [theme]);

  const setPref = useCallback((next: ThemePref) => {
    writeThemePref(next);
    setPrefState(next);
  }, []);

  const toggle = useCallback(() => setPref(toggledPref(theme)), [setPref, theme]);

  const value = useMemo(() => ({ pref, theme, setPref, toggle }), [pref, theme, setPref, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
