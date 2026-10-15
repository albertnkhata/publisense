import React, { useState } from 'react';
import { 
  Trash2, 
  AlertTriangle, 
  X, 
  Loader2, 
  ShieldAlert, 
  UserX, 
  MessageSquareOff 
} from 'lucide-react';
import { UserProfile } from '../types';

interface DeleteAccountModalProps {
  isOpen: boolean;
  currentUser: UserProfile | null;
  onClose: () => void;
  onConfirmDelete: (user: UserProfile) => Promise<void>;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onConfirmDelete,
}) => {
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !currentUser) return null;

  const targetPhrase = 'delete my account';
  const isMatch = confirmPhrase.trim().toLowerCase() === targetPhrase;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch || isDeleting) return;

    try {
      setIsDeleting(true);
      setErrorMessage(null);
      await onConfirmDelete(currentUser);
      setConfirmPhrase('');
      onClose();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setErrorMessage(errObj?.message || 'Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmPhrase('');
    setErrorMessage(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div 
        className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-red-50/40 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-900/60 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="delete-account-title" className="text-base font-bold text-zinc-900 dark:text-white">
                Delete Account
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Permanently erase credentials &amp; anonymize contributions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {/* Warning Banner */}
          <div className="p-3.5 rounded-xl bg-red-50/80 dark:bg-red-950/30 border border-red-200/90 dark:border-red-900/50 text-xs text-red-800 dark:text-red-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-red-900 dark:text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span>This action is permanent and cannot be reversed</span>
            </div>
            <p className="text-[11px] leading-relaxed text-red-700 dark:text-red-300/90">
              You will immediately lose access to your account ({currentUser.email || currentUser.handle}).
            </p>
          </div>

          {/* Impact list */}
          <div className="space-y-2.5 text-xs text-zinc-600 dark:text-zinc-400">
            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 mt-0.5 flex-shrink-0">
                <UserX className="w-3.5 h-3.5" />
              </div>
              <p>
                <strong className="text-zinc-900 dark:text-zinc-200">Credentials &amp; Profile:</strong> Your account records, login credentials, bio, and notifications will be permanently purged.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 mt-0.5 flex-shrink-0">
                <MessageSquareOff className="w-3.5 h-3.5" />
              </div>
              <p>
                <strong className="text-zinc-900 dark:text-zinc-200">Community Continuity:</strong> Your public feedback submissions and comments will stay visible so discussion threads remain coherent, but author details will be transformed to <span className="font-semibold text-zinc-800 dark:text-zinc-200">Deleted User</span> (<code className="text-[11px] font-mono">@deleted</code>).
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 mt-0.5 flex-shrink-0">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <p>
                <strong className="text-zinc-900 dark:text-zinc-200">Organization Roles:</strong> You will be immediately unlinked from any verified company rosters and claims.
              </p>
            </div>
          </div>

          {/* Confirmation Input Field */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <label htmlFor="confirm-phrase-input" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              To proceed, please type <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono font-bold text-red-600 dark:text-red-400 select-all">{targetPhrase}</code> to confirm:
            </label>
            <input
              id="confirm-phrase-input"
              type="text"
              autoFocus
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder="delete my account"
              disabled={isDeleting}
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 font-mono"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
              {errorMessage}
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isMatch || isDeleting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting account...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Permanently Delete Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
