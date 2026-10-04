import React from 'react';
import { 
  Activity, 
  Sun, 
  Moon, 
  LogIn
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ProfileDropdown } from './ProfileDropdown';
import { NotificationDropdown } from './NotificationDropdown';
import { RealtimeNotification } from '../lib/firebase';

interface HeaderProps {
  currentUser: UserProfile | null;
  notifications?: RealtimeNotification[];
  onSelectNotificationFeedback?: (id: string) => void;
  onClearNotifications?: () => void;
  onOpenLogin: () => void;
  onRoleChange: (newRole: UserRole) => void;
  onLogout: () => void;
  onOpenSubmit?: () => void;
  onLogoClick: () => void;
  onViewProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  notifications = [],
  onSelectNotificationFeedback,
  onClearNotifications,
  onOpenLogin,
  onRoleChange,
  onLogout,
  onOpenSubmit,
  onLogoClick,
  onViewProfile,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200/90 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo & Brand */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer select-none group" 
            onClick={onLogoClick}
            title="Return to feed"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-950 font-bold shadow-2xs group-hover:scale-105 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white">
                CrowdPulse
              </span>
            </div>
          </div>

          {/* Right: Actions, Theme, Profile/Login */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Realtime Notification Bell */}
            <NotificationDropdown
              notifications={notifications}
              onSelectFeedback={onSelectNotificationFeedback}
              onClearNotifications={onClearNotifications}
            />

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-zinc-300" />
              ) : (
                <Moon className="w-4 h-4 text-zinc-600" />
              )}
            </button>

            {/* Profile or Sign In */}
            {currentUser ? (
              <ProfileDropdown
                user={currentUser}
                onRoleChange={onRoleChange}
                onLogout={onLogout}
                onViewProfile={onViewProfile || (() => {})}
              />
            ) : (
              <button
                onClick={onOpenLogin}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200/80 dark:border-zinc-700/80 rounded-lg transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-zinc-500" />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
