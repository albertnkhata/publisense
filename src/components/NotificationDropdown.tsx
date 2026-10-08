import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Bell, 
  Check, 
  Sparkles, 
  CheckCircle2, 
  MessageSquare, 
  ShieldCheck, 
  X,
  Flame,
  ChevronUp,
  CheckCheck,
  Eye,
  Trash2
} from 'lucide-react';
import { RealtimeNotification } from '../lib/firebase';
import { formatRelativeTime } from '../lib/timeUtils';

interface NotificationDropdownProps {
  notifications: RealtimeNotification[];
  onSelectFeedback?: (feedbackId: string) => void;
  onClearNotifications?: () => void;
  onMarkRead?: (notificationId: string) => void;
  onMarkAllRead?: () => void;
  onDismissNotification?: (notificationId: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  onSelectFeedback,
  onClearNotifications,
  onMarkRead,
  onMarkAllRead,
  onDismissNotification,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const displayedNotifications = useMemo(() => {
    if (filterMode === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, filterMode]);

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
      case 'new_signal':
        return <Flame className="w-4 h-4 text-amber-500" />;
      case 'vote':
        return <ChevronUp className="w-4 h-4 text-emerald-500" />;
      case 'reply':
      default:
        return <MessageSquare className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button with Unread Badge */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
        title="Live Signal Alerts & Release Updates"
        aria-label="View notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-zinc-900 shadow-xs animate-in zoom-in-50 duration-150">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-zinc-900 dark:text-white">
                Live Signal Alerts
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && onMarkAllRead && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer flex items-center gap-1 font-medium"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3 text-zinc-400" />
                  <span>Mark read</span>
                </button>
              )}

              {notifications.length > 0 && onClearNotifications && (
                <button
                  type="button"
                  onClick={onClearNotifications}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                  title="Clear all alerts"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Filter Sub-Bar */}
          <div className="px-4 py-1.5 bg-zinc-50/70 dark:bg-zinc-850/40 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition-colors ${
                  filterMode === 'all'
                    ? 'bg-zinc-200 dark:bg-zinc-750 text-zinc-900 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unread')}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition-colors ${
                  filterMode === 'unread'
                    ? 'bg-zinc-200 dark:bg-zinc-750 text-zinc-900 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
            <span className="text-[10px] text-zinc-400">Click to view signal</span>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-850">
            {displayedNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                <Bell className="w-6 h-6 mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
                {filterMode === 'unread'
                  ? 'No unread alerts! You are all caught up.'
                  : "No alerts. You'll receive real-time updates when PMs change status, ship features, or comments are posted!"}
              </div>
            ) : (
              displayedNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => {
                    // Action immediately: mark as read so it doesn't linger
                    if (onMarkRead && !notif.isRead) {
                      onMarkRead(notif.id);
                    }
                    if (notif.targetFeedbackId && onSelectFeedback) {
                      onSelectFeedback(notif.targetFeedbackId);
                      setIsOpen(false);
                    }
                  }}
                  className={`group relative p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors cursor-pointer flex items-start gap-3 ${
                    !notif.isRead ? 'bg-indigo-50/40 dark:bg-indigo-950/25' : ''
                  }`}
                >
                  <img
                    src={notif.actorAvatar}
                    alt={notif.actorName}
                    className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-1.5">
                      {getIcon(notif.type)}
                      <span className="font-semibold text-xs text-zinc-900 dark:text-white truncate">
                        {notif.title}
                      </span>
                      {!notif.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
                      {notif.message}
                    </p>
                    <span className="text-[10px] text-zinc-400 mt-1 block">
                      {formatRelativeTime(notif.createdAt, notif.id)}
                    </span>
                  </div>

                  {/* Actions on hover: Dismiss / mark read */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    {!notif.isRead && onMarkRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead(notif.id);
                        }}
                        className="p-1 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-md transition-colors"
                        title="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onDismissNotification && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismissNotification(notif.id);
                        }}
                        className="p-1 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-md transition-colors"
                        title="Dismiss notification"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
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
