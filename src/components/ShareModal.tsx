import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink
} from 'lucide-react';
import { FeedbackItem, Product } from '../types';

interface ShareModalProps {
  item: FeedbackItem | null;
  product?: Product;
  onClose: () => void;
  onConfirmShare: (id: string) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  item,
  product,
  onClose,
  onConfirmShare,
}) => {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const currentUrl = window.location.href.split('#')[0] + `#feedback-${item.id}`;
  const tweetText = encodeURIComponent(
    `Upvoted "${item.title}" for ${product?.name || 'this tool'} on Publisense (${item.meTooCount} upvotes): ${currentUrl}`
  );
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    onConfirmShare(item.id);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenTwitter = () => {
    onConfirmShare(item.id);
    window.open(twitterShareUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 transition-all">
      <div 
        className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl w-full max-w-md shadow-xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Share Feedback
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 text-xs">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-850 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-mono text-zinc-400 block mb-1">
              Preview
            </span>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              "{item.title}"
            </p>
            <span className="text-zinc-500 text-[11px] mt-1 block">
              {item.meTooCount} upvotes on Publisense
            </span>
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={handleOpenTwitter}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium text-xs transition-colors"
            >
              <span>Post to X / Twitter</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg font-medium text-xs transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Copied to clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy direct link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
