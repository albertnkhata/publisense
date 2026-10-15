import React, { useState } from 'react';
import { 
  Building2, 
  ShieldOff, 
  AlertTriangle, 
  X, 
  Layers, 
  Users, 
  Check, 
  Loader2 
} from 'lucide-react';
import { Company, Product, UserProfile } from '../types';

interface UnclaimOrgModalProps {
  isOpen: boolean;
  company: Company | null;
  subsumedProducts: Product[];
  currentUser: UserProfile | null;
  onClose: () => void;
  onConfirmUnclaim: (companyId: string) => Promise<void> | void;
}

export const UnclaimOrgModal: React.FC<UnclaimOrgModalProps> = ({
  isOpen,
  company,
  subsumedProducts,
  currentUser,
  onClose,
  onConfirmUnclaim,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !company) return null;

  const targetName = company.name.trim();
  const isMatch = confirmText.trim().toLowerCase() === targetName.toLowerCase();
  const verifiedMembersCount = company.verifiedMembers?.length || 0;
  const productsCount = subsumedProducts.length;

  const handleUnclaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch) {
      setError(`Please type "${targetName}" exactly to confirm.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirmUnclaim(company.id);
      setConfirmText('');
      onClose();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setError(errObj?.message || 'Failed to unclaim organization. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setConfirmText('');
    setError(null);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unclaim-modal-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-850/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/60 flex items-center justify-center flex-shrink-0">
              <ShieldOff className="w-5 h-5" />
            </div>
            <div>
              <h2 id="unclaim-modal-title" className="text-base font-bold text-zinc-900 dark:text-white">
                Unclaim {company.name}
              </h2>
              <p className="text-xs text-zinc-500">
                Release organization ownership & revoke verified status
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleUnclaim} className="p-5 space-y-4.5">
          {/* Warning Banner */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Destructive Action</p>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Releasing ownership of this organization will immediately revoke official badges and administrative rights.
              </p>
            </div>
          </div>

          {/* Impact Overview List */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/50 border border-zinc-200/70 dark:border-zinc-800 space-y-2 text-xs">
            <p className="font-semibold text-zinc-900 dark:text-white">
              What happens when you unclaim:
            </p>
            <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-400 text-[11px]">
              <li className="flex items-start gap-2">
                <span className="text-zinc-400">•</span>
                <span>The verified organization checkmark will be removed from <strong>{company.name}</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-400">•</span>
                <span>
                  <strong>{productsCount}</strong> {productsCount === 1 ? 'product' : 'products'} will lose official team badges and return to community management.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-400">•</span>
                <span>
                  <strong>{verifiedMembersCount}</strong> verified team {verifiedMembersCount === 1 ? 'member' : 'members'} will revert to standard community user status.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-400">•</span>
                <span>Corporate domain (<code>@{company.domain || 'domain'}</code>) will be released and open to future claim by authorized staff.</span>
              </li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Confirmation Input */}
          <div className="space-y-2">
            <label 
              htmlFor="confirm-org-name"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              To confirm, type <span className="font-bold select-all text-zinc-900 dark:text-white underline decoration-zinc-400">{targetName}</span> below:
            </label>
            <div className="relative">
              <input
                id="confirm-org-name"
                type="text"
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  setError(null);
                }}
                disabled={isSubmitting}
                placeholder={targetName}
                autoFocus
                autoComplete="off"
                spellCheck="false"
                className={`w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border transition-all text-zinc-900 dark:text-white focus:outline-none ${
                  isMatch 
                    ? 'border-emerald-500 focus:ring-1 focus:ring-emerald-500' 
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-500'
                }`}
              />
              {isMatch && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px] font-medium pointer-events-none">
                  <Check className="w-3.5 h-3.5" />
                  <span>Name matches</span>
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isMatch || isSubmitting}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer ${
                isMatch && !isSubmitting
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20 cursor-pointer'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-transparent'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Unclaiming...</span>
                </>
              ) : (
                <>
                  <ShieldOff className="w-3.5 h-3.5" />
                  <span>Confirm Unclaim</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
