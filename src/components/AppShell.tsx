import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../context/StoreContext';
import { formatRelativeTime } from '../lib/time';

export const OPEN_COMPOSER_EVENT = 'publisense:open-composer';

export function triggerOpenComposer(productSlug?: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_COMPOSER_EVENT, { detail: { productSlug } })
  );
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const {
    currentUser,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    openAuthModal,
    openCreateProductModal,
    organizations,
  } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  // The signed-in maintainer's board slug, resolved from the org id. Comes from
  // organizations.slug (a real column), not derived from the id.
  const managedOrg = currentUser?.managedOrgId
    ? organizations.find((o) => o.id === currentUser.managedOrgId)
    : undefined;

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isNotifOpen) {
      document.addEventListener('mousedown', onClickOutside);
    }
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isNotifOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const isProductRoute = location.pathname.startsWith('/p/');
  const isProfileRoute = location.pathname.startsWith('/u/');
  const isPostRoute = location.pathname.startsWith('/post/');
  const routeBadge = isProductRoute
    ? location.pathname
    : isProfileRoute
    ? location.pathname
    : isPostRoute
    ? 'SIGNAL THREAD'
    : 'OPEN INDEX';

  return (
    <div className="frame">
      {/* Top Precision Header */}
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand">
            <div className="brand-mark">P</div>
            <span className="brand-name">Publisense</span>
            <span className="brand-tag mono">{routeBadge}</span>
          </Link>

          <nav className="topnav">
            <Link
              to="/explore"
              className={location.pathname === '/explore' ? 'active' : ''}
            >
              Explore Index
            </Link>
            <a href="/#directory">Categories</a>
            <a href="/#trending">Trending</a>
            {currentUser && (
              <Link
                to={`/u/${currentUser.handle}`}
                className={location.pathname === `/u/${currentUser.handle}` ? 'active' : ''}
              >
                My Portfolio
              </Link>
            )}
            {managedOrg && (
              <Link
                to={`/org/${managedOrg.slug}`}
                className={location.pathname.startsWith('/org/') ? 'active' : ''}
              >
                My Board
              </Link>
            )}
            {currentUser && (
              <Link
                to="/settings"
                className={location.pathname === '/settings' ? 'active' : ''}
              >
                Settings
              </Link>
            )}
            <button
              type="button"
              onClick={openCreateProductModal}
              title="Add a new product board to the directory"
            >
              + Add Product
            </button>
          </nav>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={toggleTheme}
            title="Switch Light / Dark Palette"
          >
            <span>{theme === 'dark' ? '◐' : '◑'}</span>
            <span className="mono">{theme === 'dark' ? 'Obsidian' : 'Alabaster'}</span>
          </button>

          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (!location.pathname.startsWith('/p/') && location.pathname !== '/') {
                navigate('/');
                setTimeout(() => triggerOpenComposer(), 50);
              } else {
                triggerOpenComposer();
              }
            }}
          >
            <span>+ Post Signal</span>
            <span className="kbd">C</span>
          </button>

          {/* Phase 2.4: Live In-App Notifications Drawer */}
          <div className="notif-wrapper" ref={notifRef}>
            <button
              type="button"
              className={`btn-ghost mono ${unreadCount > 0 ? 'has-unread' : ''}`}
              onClick={() => {
                if (!currentUser) {
                  openAuthModal('Sign in to view your signal notifications.');
                  return;
                }
                setIsNotifOpen((prev) => !prev);
              }}
              title="Signal & Workaround Notifications"
            >
              <span>🔔</span>
              {unreadCount > 0 && (
                <span className="notif-badge mono">{unreadCount}</span>
              )}
            </button>

            {isNotifOpen && currentUser && (
              <div className="notif-popover">
                <div className="notif-popover-header mono">
                  <span>Signal Updates ({notifications.length})</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="action-btn mono"
                      style={{ color: 'var(--accent-emerald)' }}
                      onClick={markAllNotificationsRead}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="notif-popover-list">
                  {notifications.length === 0 ? (
                    <div className="notif-empty mono">
                      No notifications yet. Upvote or log a signal to track workarounds & shipped updates.
                    </div>
                  ) : (
                    notifications.slice(0, 12).map((notif) => {
                      const dotColor =
                        notif.kind === 'status_change'
                          ? 'var(--accent-emerald)'
                          : notif.kind === 'comment'
                          ? 'var(--accent-indigo)'
                          : 'var(--accent-amber)';
                      return (
                        <button
                          key={notif.id}
                          type="button"
                          className={`notif-item ${!notif.isRead ? 'unread' : ''}`}
                          onClick={() => {
                            markNotificationRead(notif.id);
                            setIsNotifOpen(false);
                            navigate(`/post/${notif.postId}`);
                          }}
                        >
                          <div className="notif-item-top">
                            <span
                              className="status-dot"
                              style={{ background: dotColor, flexShrink: 0 }}
                            />
                            <span className="notif-item-title">{notif.title}</span>
                            <span className="notif-item-time mono">
                              {formatRelativeTime(notif.createdAt)}
                            </span>
                          </div>
                          <div className="notif-item-msg">{notif.message}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => openAuthModal('Switch persona or sign in')}
            title={currentUser ? `Signed in as @${currentUser.handle}` : 'Sign in'}
          >
            <span>{currentUser ? `@${currentUser.handle}` : 'Sign in'}</span>
          </button>
        </div>
      </header>

      {children}

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-6 mt-2 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap text-[11px] text-zinc-500">
        <span>Publisense — a public index of product feedback.</span>
        <span className="flex items-center gap-3">
          <Link to="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link to="/terms" className="hover:underline">
            Terms
          </Link>
        </span>
      </footer>
    </div>
  );
};
