import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { cx } from '../lib/cx';
import { useTheme } from '../lib/ThemeProvider';
import { useViewer } from '../lib/viewer';
import { Dialog, Icon, UserAvatar, useToast, type IconName } from '../ui';
import { useAuthDialog } from './auth';
import { useComposer } from './composer';
import { LegalLinks } from './LegalLinks';

/** Icon-only tab bar at sm (≤520px), replacing the nav rail. */
export function TabBar() {
  const { viewer, signOut } = useViewer();
  const { openAuth } = useAuthDialog();
  const { toast } = useToast();
  const { openComposer } = useComposer();
  const { theme, toggle } = useTheme();
  const [sheet, setSheet] = useState(false);

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
          {({ isActive }) => <TabIcon name="explore" active={isActive} />}
        </NavLink>
        {viewer ? (
          <button type="button" aria-label="Post feedback" onClick={openComposer} className="flex h-8 items-center justify-center border-0 bg-transparent">
            <span className="grid h-7 w-8 place-items-center rounded-md bg-brand text-on-brand">
              <Icon name="plus" size={20} strokeWidth={2.2} />
            </span>
          </button>
        ) : null}
        {viewer ? (
          <NavLink to="/notifications" aria-label="Notifications" className={tabClass}>
            {({ isActive }) => <TabIcon name="bell" active={isActive} />}
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

      {viewer ? (
        <Dialog open={sheet} onClose={() => setSheet(false)} title={viewer.name}>
          <div className="-mx-2 flex flex-col">
            <SheetLink to={`/u/${viewer.handle}`} icon="user" onClick={() => setSheet(false)}>
              Profile
            </SheetLink>
            <SheetLink to="/settings" icon="settings" onClick={() => setSheet(false)}>
              Settings
            </SheetLink>
            <button type="button" onClick={toggle} className={sheetItem}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} strokeWidth={1.75} />
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
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
