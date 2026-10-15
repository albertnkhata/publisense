import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ChevronRight, 
  Sun, 
  Moon, 
  Laptop, 
  Bell, 
  Mail, 
  Sparkles, 
  Check, 
  Sliders,
  Trash2,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react';
import { useTheme, ThemePreference } from '../context/ThemeContext';
import { UserProfile } from '../types';
import { deleteUserAccount } from '../lib/authService';
import { DeleteAccountModal } from './DeleteAccountModal';

interface SettingsPageProps {
  onBack: () => void;
  currentUser?: UserProfile | null;
  onDeleteAccountSuccess?: () => void;
  onRequireAuth?: (promptMessage?: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ 
  onBack,
  currentUser = null,
  onDeleteAccountSuccess,
  onRequireAuth,
}) => {
  const { themePreference, setThemePreference, settings, updateSettings } = useTheme();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleConfirmDeleteAccount = async (user: UserProfile) => {
    await deleteUserAccount(user);
    if (onDeleteAccountSuccess) {
      onDeleteAccountSuccess();
    }
  };

  const handleToggleNotification = (key: 'email' | 'releases') => {
    updateSettings((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key],
      },
    }));
  };

  const themeOptions: { value: ThemePreference; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Light',
      desc: 'Clean, high-contrast light theme',
      icon: <Sun className="w-4 h-4 text-amber-500" />,
    },
    {
      value: 'dark',
      label: 'Dark',
      desc: 'Modern dark theme for low-light environments',
      icon: <Moon className="w-4 h-4 text-purple-400" />,
    },
    {
      value: 'system',
      label: 'System',
      desc: 'Automatically matches your device OS preference',
      icon: <Laptop className="w-4 h-4 text-blue-400" />,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-150">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          onClick={onBack}
          className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-medium flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 flex-shrink-0" />

        <span className="font-semibold text-zinc-900 dark:text-white" aria-current="page">
          Settings
        </span>
      </nav>

      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
              Preferences &amp; Settings
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Customize appearance and notification channels. Preferences persist automatically.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Theme Preference */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Theme Preference
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Choose how Publisense looks on your screen.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
              <Check className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
              <span>Auto-saved</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map((opt) => {
              const isSelected = themePreference === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setThemePreference(opt.value)}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50/80 dark:bg-zinc-800/80 ring-1 ring-zinc-900 dark:ring-zinc-100 shadow-xs'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2.5">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60">
                      {opt.icon}
                    </div>
                    {isSelected && (
                      <span className="p-1 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                    {opt.label}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Notifications */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Notifications
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Manage your alert preferences and delivery channels.
              </p>
            </div>
            <Bell className="w-4 h-4 text-zinc-400" />
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {/* Toggle 1: Email notifications */}
            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 mt-0.5 flex-shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <label htmlFor="toggle-email" className="text-xs font-semibold text-zinc-900 dark:text-white block cursor-pointer">
                    Email notifications
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Receive summary digests and direct replies to feedback you authored or upvoted.
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="toggle-email"
                role="switch"
                aria-checked={settings.notifications.email}
                onClick={() => handleToggleNotification('email')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.notifications.email ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-900 shadow-sm ring-0 transition duration-200 ease-in-out ${
                    settings.notifications.email ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2: Release updates */}
            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 mt-0.5 flex-shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <label htmlFor="toggle-releases" className="text-xs font-semibold text-zinc-900 dark:text-white block cursor-pointer">
                    Release updates
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Get notified immediately when requested features or resolved bugs ship to production.
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="toggle-releases"
                role="switch"
                aria-checked={settings.notifications.releases}
                onClick={() => handleToggleNotification('releases')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.notifications.releases ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-900 shadow-sm ring-0 transition duration-200 ease-in-out ${
                    settings.notifications.releases ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Danger Zone */}
        {currentUser ? (
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-red-200/90 dark:border-red-950/60 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-red-900 dark:text-red-300">
                    Danger Zone
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Permanent and irreversible account actions.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-red-100 dark:border-red-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="max-w-xl">
                <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">
                  Delete your account
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Permanently delete your login credentials, email associations, and personal profile information. To maintain community discussions and roadmap continuity, public feedback and comments will be anonymized to <span className="font-semibold text-zinc-700 dark:text-zinc-300">Deleted User</span>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white border border-red-200 dark:border-red-900/60 transition-all cursor-pointer whitespace-nowrap flex-shrink-0 shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/40 border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between gap-3">
            <span>You are currently browsing as a guest visitor.</span>
            {onRequireAuth && (
              <button
                type="button"
                onClick={() => onRequireAuth('Sign in to manage your account and security settings.')}
                className="font-medium text-zinc-900 dark:text-white hover:underline cursor-pointer"
              >
                Sign in
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Account Confirmation Modal */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        currentUser={currentUser}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirmDelete={handleConfirmDeleteAccount}
      />
    </div>
  );
};

