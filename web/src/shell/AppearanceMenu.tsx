import { cx } from '../lib/cx';
import { THEME_OPTIONS } from '../lib/theme';
import { useTheme } from '../lib/ThemeProvider';
import { Icon, Menu, MenuItemRadio, MenuLabel } from '../ui';

/**
 * Compact Appearance menu for signed-out desktop TopBar and SiteHeader.
 * Renders a sun/moon icon button opening the same 3-option radio picker
 * (Use device theme / Dark theme / Light theme) as UserMenu and TabBar.
 */
export function AppearanceMenu({ className }: { className?: string }) {
  const { theme, pref, setPref } = useTheme();
  return (
    <Menu
      side="bottom"
      align="end"
      label="Appearance"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label="Appearance"
          title="Appearance"
          className={cx(
            'grid size-8 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-ink-secondary transition-colors duration-120 hover:bg-subtle hover:text-ink aria-expanded:bg-subtle aria-expanded:text-ink',
            className,
          )}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} strokeWidth={1.75} />
        </button>
      )}
    >
      <MenuLabel>Appearance</MenuLabel>
      {THEME_OPTIONS.map((opt) => (
        <MenuItemRadio key={opt.value} checked={pref === opt.value} onSelect={() => setPref(opt.value)}>
          {opt.label}
        </MenuItemRadio>
      ))}
    </Menu>
  );
}
