import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useDmUnread, useIsPlatformAdmin, useMessagesEnabled, useUnreadCount } from '../api';
import { cx } from '../lib/cx';
import { THEME_OPTIONS, THEME_SHORT_LABEL } from '../lib/theme';
import { useTheme } from '../lib/ThemeProvider';
import { useViewer } from '../lib/viewer';
import { Dialog, Icon, UserAvatar, useToast, type IconName } from '../ui';
import { useAuthDialog, useRequireAuth } from './auth';
import { useComposer } from './composer';
import { LegalLinks } from './LegalLinks';

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.disabled && !el.readOnly && !NON_TEXT_INPUT_TYPES.has(el.type);
  return false;
}

/** Icon-only tab bar at sm (≤520px), replacing the nav rail, with inline Post action. */
/** `showPost` is false on full-screen pages (Messages), where the inline composer owns Send. */
export function TabBar({ showPost = true }: { showPost?: boolean } = {}) {
  const { pathname } = useLocation();
  const { viewer, signOut } = useViewer();
  const { openAuth } = useAuthDialog();
  const { toast } = useToast();
  const { openComposer } = useComposer();
  const requireAuth = useRequireAuth();
  const { theme, pref, setPref } = useTheme();
  const [sheet, setSheet] = useState(false);
  const [sheetView, setSheetView] = useState<'root' | 'appearance'>('root');
  const [inputFocused, setInputFocused] = useState(() => (typeof document !== 'undefined' ? isTextInput(document.activeElement) : false));
  const unread = useUnreadCount(viewer?.id ?? null).data ?? 0;
  const staff = useIsPlatformAdmin(viewer?.id ?? null).data ?? false;
  const messages = useMessagesEnabled(viewer?.id ?? null);
  const dmUnread = useDmUnread(viewer?.id ?? null);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => setInputFocused(isTextInput(e.target));
    const onFocusOut = (e: FocusEvent) => setInputFocused(isTextInput(e.relatedTarget));
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  useEffect(() => {
    setInputFocused(isTextInput(document.activeElement));
  }, [pathname]);

  const closeSheet = () => {
    setSheet(false);
    setSheetView('root');
  };

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cx('relative flex h-8 items-center justify-center no-underline', isActive ? 'text-ink' : 'text-ink-muted');

  return (
    <>
      <nav
        aria-label="Primary"
        className={cx(
          'fixed inset-x-0 bottom-0 z-30 hidden auto-cols-fr grid-flow-col border-t border-line bg-glass px-1 pt-2 pb-2 backdrop-blur-md',
          !inputFocused && 'max-sm:grid',
        )}
      >
        <NavLink to="/" end aria-label="Home" className={tabClass}>
          {({ isActive }) => <TabIcon name="home" active={isActive} />}
        </NavLink>
        <NavLink to="/feed" aria-label="Feed" className={tabClass}>
          {({ isActive }) => <TabIcon name="feed" active={isActive} />}
        </NavLink>
        {showPost ? (
          <div className="flex h-8 items-center justify-center">
            <button
              type="button"
              aria-label="Post feedback"
              onClick={() => {
                if (requireAuth('post feedback')) openComposer();
              }}
              className="grid size-8 cursor-pointer place-items-center rounded-md border-0 bg-brand text-on-brand transition-colors duration-120 active:bg-brand-hover"
            >
              <Icon name="plus" size={20} strokeWidth={2.2} />
            </button>
          </div>
        ) : null}
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
        {viewer && messages ? (
          <NavLink to="/messages" aria-label={dmUnread > 0 ? `Messages, ${dmUnread} unread` : 'Messages'} className={tabClass}>
            {({ isActive }) => (
              <span className="relative">
                <TabIcon name="mail" active={isActive} />
                {dmUnread > 0 ? <span aria-hidden="true" className="absolute top-0 -right-1 size-2 rounded-pill bg-brand ring-2 ring-card" /> : null}
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

      {viewer ? (
        <Dialog open={sheet} onClose={closeSheet} title={sheetView === 'appearance' ? 'Appearance' : viewer.name}>
          {sheetView === 'appearance' ? (
            <div className="-mx-2 flex flex-col">
              <button type="button" onClick={() => setSheetView('root')} className={sheetItem}>
                <span className="text-ink-secondary">
                  <Icon name="arrow-left" size={20} strokeWidth={1.75} />
                </span>
                Back
              </button>
              <div className="my-1 h-px bg-line" />
              <div role="radiogroup" aria-label="Appearance" className="flex flex-col">
                {THEME_OPTIONS.map((opt) => {
                  const checked = pref === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => {
                        setPref(opt.value);
                        closeSheet();
                      }}
                      className={cx(sheetItem, 'justify-between', checked && 'font-semibold')}
                    >
                      <span>{opt.label}</span>
                      <span className={cx('text-brand', !checked && 'invisible')}>
                        <Icon name="check" size={18} strokeWidth={2.25} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="-mx-2 flex flex-col">
                <SheetLink to={`/u/${viewer.handle}`} icon="user" onClick={closeSheet}>
                  Profile
                </SheetLink>
                <SheetLink to="/settings" icon="settings" onClick={closeSheet}>
                  Settings
                </SheetLink>
                {staff ? (
                  <SheetLink to="/admin" icon="shield" onClick={closeSheet}>
                    Admin
                  </SheetLink>
                ) : null}
                <button type="button" onClick={() => setSheetView('appearance')} className={sheetItem}>
                  <span className="text-ink-secondary">
                    <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={20} strokeWidth={1.75} />
                  </span>
                  <span className="flex-1">Appearance</span>
                  <span className="inline-flex items-center gap-1 text-sm font-normal text-ink-muted">
                    {THEME_SHORT_LABEL[pref]}
                    <Icon name="chevron-right" size={16} strokeWidth={1.75} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    closeSheet();
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
            </>
          )}
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
