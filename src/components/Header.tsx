import React, { useState, useEffect, useMemo } from 'react';
import { 
  Radio, 
  Sun, 
  Moon, 
  LogIn,
  Building2,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { UserProfile, Company } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ProfileDropdown } from './ProfileDropdown';
import { NotificationDropdown } from './NotificationDropdown';
import { RealtimeNotification } from '../lib/firebase';
import { getStoredProfile, getHandleFromProfileRoute } from '../lib/profileStorage';
import { resolveUserOrgAffiliation } from '../lib/orgAffiliation';

interface HeaderProps {
  currentUser: UserProfile | null;
  companies?: Company[];
  notifications?: RealtimeNotification[];
  onSelectNotificationFeedback?: (id: string) => void;
  onClearNotifications?: () => void;
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onDismissNotification?: (id: string) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenSubmit?: () => void;
  onLogoClick: () => void;
  onViewProfile?: () => void;
  onOpenSettings?: () => void;
  onOpenInternalDocs?: () => void;
  onOpenAdminConsole?: () => void;
  onOpenCompany?: (companyOrId: Company | string) => void;
  onClaimOrg?: (company: Company) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  companies = [],
  notifications = [],
  onSelectNotificationFeedback,
  onClearNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDismissNotification,
  onOpenLogin,
  onLogout,
  onOpenSubmit,
  onLogoClick,
  onViewProfile,
  onOpenSettings,
  onOpenInternalDocs,
  onOpenAdminConsole,
  onOpenCompany,
  onClaimOrg,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [profileSyncTick, setProfileSyncTick] = useState(0);

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileSyncTick((t) => t + 1);
    };
    window.addEventListener('crowdpulse_profile_updated', handleProfileUpdate);
    window.addEventListener('storage', handleProfileUpdate);
    window.addEventListener('hashchange', handleProfileUpdate);
    return () => {
      window.removeEventListener('crowdpulse_profile_updated', handleProfileUpdate);
      window.removeEventListener('storage', handleProfileUpdate);
      window.removeEventListener('hashchange', handleProfileUpdate);
    };
  }, []);

  const effectiveUser = useMemo(() => {
    if (!currentUser) return null;
    const cleanHandle = currentUser.handle.replace(/^@/, '');
    const stored = getStoredProfile(cleanHandle);

    if (stored) {
      return {
        ...currentUser,
        name: stored.name || currentUser.name,
        companyOrOrg: (stored.org && stored.org.trim() !== '') ? stored.org : currentUser.companyOrOrg,
        bio: (stored.bio && stored.bio.trim() !== '') ? stored.bio : currentUser.bio,
        avatar: stored.avatar || currentUser.avatar,
      };
    }

    return currentUser;
  }, [currentUser, profileSyncTick]);

  const affiliation = useMemo(() => {
    return resolveUserOrgAffiliation(effectiveUser, companies);
  }, [effectiveUser, companies]);

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
              <Radio className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white">
                Publisense
              </span>
            </div>
          </div>

          {/* Right: Actions, Theme, Profile/Login */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Realtime Notification Bell */}
            <NotificationDropdown
              notifications={notifications}
              currentUser={effectiveUser}
              onOpenLogin={onOpenLogin}
              onSelectFeedback={onSelectNotificationFeedback}
              onClearNotifications={onClearNotifications}
              onMarkRead={onMarkNotificationRead}
              onMarkAllRead={onMarkAllNotificationsRead}
              onDismissNotification={onDismissNotification}
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

            {/* Org Admin / Verified Member Quick Access Button */}
            {effectiveUser && affiliation.isClaimed && affiliation.isVerifiedMember && affiliation.company && (
              <button
                type="button"
                onClick={() => {
                  if (onOpenCompany) {
                    onOpenCompany(affiliation.company!);
                  }
                }}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs transition-colors cursor-pointer"
                title={`You are ${affiliation.effectiveRoleTitle || 'Verified Staff'} for ${affiliation.companyName}. Click to manage ${affiliation.companyName} hub.`}
              >
                <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="max-w-[120px] truncate">{affiliation.companyName}</span>
                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 px-1 py-0.2 rounded bg-emerald-100/80 dark:bg-emerald-900/60 shrink-0">
                  {affiliation.isOrgAdmin ? 'Org Admin' : 'Verified Staff'}
                </span>
              </button>
            )}

            {/* Org Console / Admin Console Shortcut */}
            {effectiveUser && (effectiveUser.role === 'admin' || (effectiveUser.role === 'company_pm' && affiliation.isClaimed && affiliation.isVerifiedMember)) && onOpenAdminConsole && (
              <button
                type="button"
                onClick={onOpenAdminConsole}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200/80 dark:border-zinc-700/80 rounded-lg transition-colors cursor-pointer"
                title={effectiveUser.role === 'admin' ? 'Open Platform Admin Console' : 'Open Organization Console'}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{effectiveUser.role === 'admin' ? 'Admin Console' : 'Org Console'}</span>
              </button>
            )}

            {/* Profile or Sign In */}
            {effectiveUser ? (
              <ProfileDropdown
                user={effectiveUser}
                companies={companies}
                onLogout={onLogout}
                onViewProfile={onViewProfile || (() => {})}
                onOpenSettings={onOpenSettings}
                onOpenInternalDocs={onOpenInternalDocs}
                onOpenAdminConsole={onOpenAdminConsole}
                onOpenCompany={onOpenCompany}
                onClaimOrg={onClaimOrg}
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
