import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

export interface AppNotificationsSettings {
  email: boolean;
  releases: boolean;
}

export interface AppSettings {
  theme: ThemePreference;
  notifications: AppNotificationsSettings;
}

export const SETTINGS_STORAGE_KEY = 'publisense_settings';
export const LEGACY_SETTINGS_KEY = 'crowdpulse_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  notifications: {
    email: true,
    releases: true,
  },
};

export function loadStoredSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY) || localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validTheme: ThemePreference = 
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULT_SETTINGS.theme;
      return {
        theme: validTheme,
        notifications: {
          email: typeof parsed.notifications?.email === 'boolean' ? parsed.notifications.email : true,
          releases: typeof parsed.notifications?.releases === 'boolean' ? parsed.notifications.releases : true,
        },
      };
    }
    // Backward compatibility with the legacy pre-rebrand key. Retained deliberately so
    // users who set their theme before the Publisense rename keep it. Do not rename.
    const legacy = localStorage.getItem('signalpulse_theme');
    if (legacy === 'light' || legacy === 'dark') {
      return {
        ...DEFAULT_SETTINGS,
        theme: legacy,
      };
    }
  } catch (e) {
    console.warn('Failed to parse publisense_settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('publisense_settings_updated'));
    window.dispatchEvent(new Event('crowdpulse_settings_updated'));
  } catch (e) {
    console.warn('Failed to save publisense_settings:', e);
  }
}

interface ThemeContextType {
  theme: EffectiveTheme;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
  setTheme: (theme: EffectiveTheme) => void;
  settings: AppSettings;
  updateSettings: (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());

  const getSystemTheme = (): EffectiveTheme => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  };

  const getEffectiveTheme = (pref: ThemePreference): EffectiveTheme => {
    if (pref === 'system') {
      return getSystemTheme();
    }
    return pref;
  };

  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => {
    const initial = loadStoredSettings();
    return getEffectiveTheme(initial.theme);
  });

  const applyThemeToDom = useCallback((effTheme: EffectiveTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (effTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, []);

  // Sync DOM and handle system changes
  useEffect(() => {
    const eff = getEffectiveTheme(settings.theme);
    setEffectiveTheme(eff);
    applyThemeToDom(eff);

    if (settings.theme === 'system' && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        const updatedEff = media.matches ? 'dark' : 'light';
        setEffectiveTheme(updatedEff);
        applyThemeToDom(updatedEff);
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [settings.theme, applyThemeToDom]);

  const updateSettings = (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
    setSettings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      saveStoredSettings(next);
      return next;
    });
  };

  const setThemePreference = (pref: ThemePreference) => {
    updateSettings((prev) => ({
      ...prev,
      theme: pref,
    }));
  };

  const toggleTheme = () => {
    const next: EffectiveTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
    updateSettings((prev) => ({
      ...prev,
      theme: next,
    }));
  };

  const setTheme = (newTheme: EffectiveTheme) => {
    updateSettings((prev) => ({
      ...prev,
      theme: newTheme,
    }));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: effectiveTheme,
        themePreference: settings.theme,
        setThemePreference,
        toggleTheme,
        setTheme,
        settings,
        updateSettings,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

