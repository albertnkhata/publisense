import { useState } from 'react';
import { cx } from '../lib/cx';
import { THEME_OPTIONS, THEME_SHORT_LABEL } from '../lib/theme';
import { useTheme } from '../lib/ThemeProvider';
import { Icon, Menu, MenuItem, MenuItemRadio, MenuSeparator } from '../ui';

/**
 * Signed-out overflow menu (`···`) on the far right of TopBar (desktop) and
 * SiteHeader: mirrors UserMenu's Appearance submenu and legal links.
 */
export function GuestMenu({ className, showLegal = true }: { className?: string; showLegal?: boolean }) {
  const { theme, pref, setPref } = useTheme();
  const [view, setView] = useState<'root' | 'appearance'>('root');

  return (
    <Menu
      side="bottom"
      align="end"
      label={view === 'appearance' ? 'Appearance' : 'More'}
      viewKey={view}
      onOpenChange={(open) => {
        if (!open) setView('root');
      }}
      onBack={view === 'appearance' ? () => setView('root') : undefined}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label="More"
          title="More"
          className={cx(
            'grid size-8 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-ink-secondary transition-colors duration-120 hover:bg-subtle hover:text-ink aria-expanded:bg-subtle aria-expanded:text-ink',
            className,
          )}
        >
          <Icon name="more-vertical" size={18} strokeWidth={1.75} />
        </button>
      )}
    >
      {view === 'appearance' ? (
        <>
          <MenuItem icon="arrow-left" keepOpen onSelect={() => setView('root')}>
            Appearance
          </MenuItem>
          <MenuSeparator />
          {THEME_OPTIONS.map((opt) => (
            <MenuItemRadio key={opt.value} checked={pref === opt.value} onSelect={() => setPref(opt.value)}>
              {opt.label}
            </MenuItemRadio>
          ))}
        </>
      ) : (
        <>
          <MenuItem
            icon={theme === 'dark' ? 'moon' : 'sun'}
            keepOpen
            trailing={
              <>
                <span>{THEME_SHORT_LABEL[pref]}</span>
                <Icon name="chevron-right" size={14} strokeWidth={2} />
              </>
            }
            onSelect={() => setView('appearance')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                setView('appearance');
              }
            }}
          >
            Appearance
          </MenuItem>
          {showLegal ? (
            <>
              <MenuSeparator />
              <MenuItem to="/about">About</MenuItem>
              <MenuItem to="/terms">Terms</MenuItem>
              <MenuItem to="/privacy">Privacy</MenuItem>
            </>
          ) : null}
        </>
      )}
    </Menu>
  );
}
