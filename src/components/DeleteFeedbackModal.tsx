import React from 'react';
import { AlertTriangle, Trash2, X, AlertCircle, Ban } from 'lucide-react';
import { FeedbackItem, UserRole } from '../types';

interface DeleteFeedbackModalProps {
  isOpen: boolean;
  item?: FeedbackItem | null;
  comment?: { id: string; text: string } | null;
  userRole?: UserRole;
  isAuthor?: boolean;
  onClose: () => void;
  onConfirmDelete: (id: string) => void;
  onConfirmWithdraw?: (itemId: string) => void;
}

export const DeleteFeedbackModal: React.FC<DeleteFeedbackModalProps> = ({
  isOpen,
  item,
  comment,
  userRole = 'user',
  isAuthor = true,
  onClose,
  onConfirmDelete,
  onConfirmWithdraw,
}) => {
  if (!isOpen || (!item && !comment)) return null;

  const isDeletingComment = Boolean(comment);
  const isAdmin = userRole === 'admin';
  const hasTeamEngagement =
    !isDeletingComment && item
      ? (item.status !== 'under_review' && item.status !== 'considering') || !!item.statusUpdateNote
      : false;
  const hasSubstantialVotes = !isDeletingComment && item ? item.meTooCount >= 5 : false;

  // If author but there is already official roadmap engagement or high community signal
  const shouldRecommendWithdraw = !isDeletingComment && !isAdmin && (hasTeamEngagement || hasSubstantialVotes);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all">
      <div
        className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-5 sm:p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3.5 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            shouldRecommendWithdraw 
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400' 
              : 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400'
          }`}>
            {shouldRecommendWithdraw ? (
              <Ban className="w-5 h-5" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
          </div>

          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              {isDeletingComment 
                ? 'Delete Comment' 
                : shouldRecommendWithdraw 
                ? 'Withdraw Feedback' 
                : 'Delete Feedback'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
              {isDeletingComment 
                ? (comment?.text ? `"${comment.text}"` : '') 
                : (item ? `"${item.title}"` : '')}
            </p>
          </div>
        </div>

        {shouldRecommendWithdraw ? (
          <div className="space-y-3 mb-6">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Community Protection</p>
                <p className="mt-0.5">
                  {hasTeamEngagement
                    ? 'A product team member has already reviewed or scheduled this item.'
                    : `This issue has gained ${item?.meTooCount} community upvotes.`}{' '}
                  Per industry best practice, withdrawing marks this as retracted by author without wiping community tracking.
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Would you like to withdraw this request or permanently delete it?
            </p>
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {isDeletingComment
                ? 'Are you sure you want to permanently delete this comment? This action cannot be undone.'
                : 'Are you sure you want to permanently delete this feedback? This will remove the post, upvotes, and all associated replies. This action cannot be undone.'}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {shouldRecommendWithdraw && onConfirmWithdraw && item && (
            <button
              type="button"
              onClick={() => {
                onConfirmWithdraw(item.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Withdraw Request</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onConfirmDelete(comment ? comment.id : item!.id);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Permanent Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
