import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../context/StoreContext';

export const OPEN_COMPOSER_EVENT = 'publisense:open-composer';

export function triggerOpenComposer(productSlug?: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_COMPOSER_EVENT, { detail: { productSlug } })
  );
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { currentUser, openAuthModal, openCreateProductModal } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const isProductRoute = location.pathname.startsWith('/p/');
  const routeBadge = isProductRoute ? location.pathname : 'OPEN INDEX';

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
              to="/"
              className={location.pathname === '/' ? 'active' : ''}
            >
              Explore Index
            </Link>
            <a href="#directory">Categories</a>
            <a href="#trending">Trending</a>
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
    </div>
  );
};
