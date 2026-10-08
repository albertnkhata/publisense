import React, { useState, useRef, useEffect } from 'react';
import { 
  User, 
  ShieldCheck,
  CheckCircle2,
  LogOut, 
  ChevronDown,
  BookOpen,
  Settings
} from 'lucide-react';
import { UserProfile } from '../types';

interface ProfileDropdownProps {
  user: UserProfile;
  onLogout: () => void;
  onViewProfile: () => void;
  onOpenSettings?: () => void;
  onOpenInternalDocs?: () => void;
  onOpenAdminConsole?: () => void;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  user,
  onLogout,
  onViewProfile,
  onOpenSettings,
  onOpenInternalDocs,
  onOpenAdminConsole,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const isPM = user.role === 'company_pm';
  const isAdmin = user.role === 'admin';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200/80 dark:border-zinc-700/80 transition-colors cursor-pointer group"
        title="Account menu"
      >
        <img
          src={user.avatar}
          alt={user.name}
          className="w-6 h-6 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
        />
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 hidden sm:inline max-w-[100px] truncate">
          {user.name}
        </span>
        {isAdmin ? (
          <span title="Platform Admin" className="inline-flex items-center">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
          </span>
        ) : isPM ? (
          <span title="Verified PM" className="inline-flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </span>
        ) : null}
        <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-transform" />
      </button>

      {/* Simplified Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* User header info with circular headshot */}
          <div className="px-3.5 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                    {user.name}
                  </p>
                  {isAdmin ? (
                    <span title="Platform Admin" className="inline-flex items-center flex-shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                    </span>
                  ) : isPM ? (
                    <span title="Verified PM" className="inline-flex items-center flex-shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                  {user.handle}
                </p>
                {user.email && (
                  <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5" title={user.email}>
                    {user.email}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Navigation actions */}
          <div className="py-1 border-b border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onViewProfile();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span>Your profile</span>
            </button>

            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-zinc-400" />
                <span>Settings</span>
              </button>
            )}

            {isAdmin && onOpenAdminConsole && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenAdminConsole();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors cursor-pointer font-semibold"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Admin Console</span>
              </button>
            )}

            {isAdmin && onOpenInternalDocs && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenInternalDocs();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors cursor-pointer font-medium"
              >
                <BookOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Internal Docs & Roadmap</span>
              </button>
            )}
          </div>

          {/* Sign out */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
