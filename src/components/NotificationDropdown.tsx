import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, Sparkles, CheckCircle2, MessageSquare, ShieldCheck, X } from 'lucide-react';
import { RealtimeNotification } from '../lib/firebase';

interface NotificationDropdownProps {
  notifications: RealtimeNotification[];
  onSelectFeedback?: (feedbackId: string) => void;
  onClearNotifications?: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  onSelectFeedback,
  onClearNotifications,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const getIcon = (type: RealtimeNotification['type']) => {
    switch (type) {
      case 'status_shipped':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'status_progress':
        return <Sparkles className="w-4 h-4 text-blue-500" />;
      case 'claim':
        return <ShieldCheck className="w-4 h-4 text-purple-500" />;
      case 'reply':
      default:
        return <MessageSquare className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
        title="Live Signal Alerts & Release Updates"
        aria-label="View notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900 animate-pulse" />
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-zinc-900 dark:text-white">
                Live Signal Alerts
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>

            {notifications.length > 0 && onClearNotifications && (
              <button
                type="button"
                onClick={onClearNotifications}
                className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-850">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                <Bell className="w-6 h-6 mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
                No new alerts. You'll receive real-time updates when PMs change status or ship features!
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (notif.targetFeedbackId && onSelectFeedback) {
                      onSelectFeedback(notif.targetFeedbackId);
                      setIsOpen(false);
                    }
                  }}
                  className={`p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors cursor-pointer flex items-start gap-3 ${
                    !notif.isRead ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                  }`}
                >
                  <img
                    src={notif.actorAvatar}
                    alt={notif.actorName}
                    className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getIcon(notif.type)}
                      <span className="font-semibold text-xs text-zinc-900 dark:text-white truncate">
                        {notif.title}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
                      {notif.message}
                    </p>
                    <span className="text-[10px] text-zinc-400 mt-1 block">
                      {notif.createdAt}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
