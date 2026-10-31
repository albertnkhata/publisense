import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useIsPlatformAdmin, useUnreadCount } from '../api';
import { cx } from '../lib/cx';
import { useTheme } from '../lib/ThemeProvider';
import { useViewer } from '../lib/viewer';
import { Dialog, Icon, UserAvatar, useToast, type IconName } from '../ui';
import { useAuthDialog, useRequireAuth } from './auth';
import { useComposer } from './composer';
import { LegalLinks } from './LegalLinks';

/** Icon-only tab bar at sm (≤520px), replacing the nav rail, plus the floating Post button. */
export function TabBar() {
  const { viewer, signOut } = useViewer();
  const { openAuth } = useAuthDialog();
  const { toast } = useToast();
  const { openComposer } = useComposer();
  const requireAuth = useRequireAuth();
  const { theme, pref, toggle, setPref } = useTheme();
  const [sheet, setSheet] = useState(false);
  const unread = useUnreadCount(viewer?.id ?? null).data ?? 0;
  const staff = useIsPlatformAdmin(viewer?.id ?? null).data ?? false;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cx('relative flex h-8 items-center justify-center no-underline', isActive ? 'text-ink' : 'text-ink-muted');

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 hidden auto-cols-fr grid-flow-col border-t border-line bg-glass px-1 pt-2 pb-2 backdrop-blur-md max-sm:grid"
      >
        <NavLink to="/" end aria-label="Home" className={tabClass}>
          {({ isActive }) => <TabIcon name="home" active={isActive} />}
        </NavLink>
        <NavLink to="/explore" aria-label="Explore" className={tabClass}>
          {({ isActive }) => <TabIcon name="search" active={isActive} />}
        </NavLink>
        {viewer ? (
          <NavLink to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'} className={tabClass}>
            {({ isActive }) => (
              <span className="relative">
                <TabIcon name="bell" active={isActive} />
                {unread > 0 ? <span aria-hidden="true" className="absolute top-0 -right-1 size-2 rounded-pill bg-brand ring-2 ring-card" /> : null}
              </span>
            )}
          </NavLink>
        ) : null}
        {viewer ? (
          <button
            type="button"
            aria-label="You"
            aria-haspopup="dialog"
            aria-expanded={sheet}
            onClick={() => setSheet(true)}
            className="flex h-8 items-center justify-center border-0 bg-transparent"
          >
            <UserAvatar size="sm" src={viewer.avatarUrl ?? null} />
          </button>
        ) : (
          <button type="button" aria-label="Sign in" onClick={() => openAuth('signin')} className="flex h-8 items-center justify-center border-0 bg-transparent text-ink-muted">
            <TabIcon name="sign-in" active={false} />
          </button>
        )}
      </nav>

      {/* Floating Post button at sm, bottom right above the tab bar (as on X and
          Substack). It replaces the composer row above the feed on phones. */}
      {/* Shown signed out too: a tap opens sign-in, then the composer. */}
      <button
        type="button"
        aria-label="Post feedback"
        onClick={() => {
          if (requireAuth('post feedback')) openComposer();
        }}
        className="fixed right-4 bottom-fab z-30 hidden size-9 cursor-pointer place-items-center rounded-pill border-0 bg-brand text-on-brand shadow-overlay transition-colors duration-120 active:bg-brand-hover max-sm:grid"
      >
        <Icon name="plus" size={22} strokeWidth={2.2} />
      </button>

      {viewer ? (
        <Dialog open={sheet} onClose={() => setSheet(false)} title={viewer.name}>
          <div className="-mx-2 flex flex-col">
            <SheetLink to={`/u/${viewer.handle}`} icon="user" onClick={() => setSheet(false)}>
              Profile
            </SheetLink>
            <SheetLink to="/settings" icon="settings" onClick={() => setSheet(false)}>
              Settings
            </SheetLink>
            {staff ? (
              <SheetLink to="/admin" icon="shield" onClick={() => setSheet(false)}>
                Admin
              </SheetLink>
            ) : null}
            <button type="button" onClick={toggle} className={sheetItem}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} strokeWidth={1.75} />
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            {pref !== 'system' ? (
              <button
                type="button"
                onClick={() => {
                  setPref('system');
                  setSheet(false);
                  toast('Theme set to system');
                }}
                className={sheetItem}
              >
                <Icon name="settings" size={20} strokeWidth={1.75} />
                Use system theme
              </button>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                setSheet(false);
                await signOut();
                toast('Signed out');
              }}
              className={cx(sheetItem, 'text-danger')}
            >
              <Icon name="sign-out" size={20} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
          <div className="mt-2 border-t border-line pt-4">
            <LegalLinks />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

const sheetItem =
  'flex h-9 w-full items-center gap-3 rounded-md border-0 bg-transparent px-2 text-left text-md font-medium text-ink no-underline active:bg-subtle hover:bg-subtle';

function SheetLink({ to, icon, children, onClick }: { to: string; icon: IconName; children: string; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className={sheetItem}>
      <span className="text-ink-secondary">
        <Icon name={icon} size={20} strokeWidth={1.75} />
      </span>
      {children}
    </Link>
  );
}

function TabIcon({ name, active }: { name: IconName; active: boolean }) {
  return <Icon name={name} size={24} strokeWidth={active ? 2.2 : 1.75} />;
}
