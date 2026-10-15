import React from 'react';
import { 
  Share2, 
  MessageSquare, 
  CheckCircle2, 
  ChevronUp,
  ArrowUpRight,
  Image as ImageIcon
} from 'lucide-react';
import { FeedbackItem, Product, FeedbackStatus } from '../types';
import { formatRelativeTime } from '../lib/timeUtils';
import { loadProfile } from '../lib/profileStorage';

interface FeedbackCardProps {
  item: FeedbackItem;
  product?: Product;
  onVote: (id: string) => void;
  onOpenDetails: (item: FeedbackItem) => void;
  onOpenShare: (item: FeedbackItem) => void;
  onOpenProfile?: (handle: string, name: string, avatar: string) => void;
  onOpenProduct?: (product: Product) => void;
}

export const FeedbackCard: React.FC<FeedbackCardProps> = ({
  item,
  product,
  onVote,
  onOpenDetails,
  onOpenShare,
  onOpenProfile,
  onOpenProduct,
}) => {
  // Quiet status indicator with subtle dot
  const renderStatus = (status: FeedbackStatus) => {
    switch (status) {
      case 'shipped':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Shipped
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            In Progress
          </span>
        );
      case 'planned':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Planned
          </span>
        );
      case 'considering':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Considering
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Under Review
          </span>
        );
    }
  };

  const formatCategory = (cat: string) => {
    switch (cat) {
      case 'bug': return 'Bug';
      case 'ux': return 'UX';
      case 'feature': return 'Feature';
      case 'performance': return 'Performance';
      default: return 'General';
    }
  };

  return (
    <article className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
      {/* Top Metadata Row */}
      <div className="flex items-center justify-between gap-3 text-xs mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {product && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenProduct) onOpenProduct(product);
              }}
              className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white cursor-pointer group/prod"
            >
              <img
                src={product.logo}
                alt={product.name}
                className="w-3.5 h-3.5 rounded-full object-cover group-hover/prod:scale-105 transition-transform"
              />
              <span className="group-hover/prod:underline">{product.name}</span>
              {product.verifiedOwner && (
                <span title="Verified" className="inline-flex items-center">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                </span>
              )}
            </button>
          )}
          <span className="text-zinc-300 dark:text-zinc-700">•</span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {formatCategory(item.category)}
          </span>
          {item.severity === 'blocker' && (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                Blocker
              </span>
            </>
          )}
          {item.similarDuplicateCount && item.similarDuplicateCount > 0 ? (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="text-zinc-400 text-[11px]">
                {item.similarDuplicateCount} merged
              </span>
            </>
          ) : null}
        </div>

        <div>{renderStatus(item.status)}</div>
      </div>

      {/* Title */}
      <h3
        onClick={() => onOpenDetails(item)}
        className="text-base font-semibold text-zinc-900 dark:text-zinc-100 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer transition-colors leading-snug"
      >
        {item.title}
      </h3>

      {/* Description Snippet */}
      <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">
        {item.experienceDescription}
      </p>

      {/* Screenshot / Image Preview if present */}
      {(item.imageUrl || (item.images && item.images.length > 0)) && (
        <div 
          onClick={() => onOpenDetails(item)}
          className="mt-2.5 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 hover:border-zinc-300 dark:hover:border-zinc-600 cursor-pointer transition-colors group/img"
        >
          <div className="w-8 h-8 rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-700 flex-shrink-0 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
            <img
              src={item.imageUrl || item.images?.[0]}
              alt="Attached screenshot preview"
              className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <ImageIcon className="w-3.5 h-3.5 text-zinc-400 group-hover/img:text-zinc-700 dark:group-hover/img:text-zinc-200" />
            <span className="font-medium group-hover/img:underline">View screenshot attachment</span>
            {item.images && item.images.length > 1 && (
              <span className="text-[10px] text-zinc-400">+{item.images.length - 1} more</span>
            )}
          </div>
        </div>
      )}

      {/* Official Team Update (if present, quiet and tasteful) */}
      {item.statusUpdateNote && (
        <div className="mt-3 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <span className="font-medium text-zinc-900 dark:text-white">
              {product?.companyName || item.statusUpdatedBy || 'Official Team'}:
            </span>{' '}
            <span className="text-zinc-600 dark:text-zinc-400">{item.statusUpdateNote}</span>
          </div>
        </div>
      )}

      {/* Card Footer: Tame Voting Button on Left, Discussion & Share, Author on Right */}
      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-3 text-xs">
        {/* Actions group */}
        <div className="flex items-center gap-2">
          {/* Icon-only Upvote button with count (Product Hunt style) */}
          <button
            onClick={() => onVote(item.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              item.hasUserVoted
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
            }`}
            title={item.hasUserVoted ? 'Upvoted (click to undo)' : 'Upvote'}
          >
            <ChevronUp className={`w-3.5 h-3.5 ${item.hasUserVoted ? 'stroke-[2.5]' : ''}`} />
            <span className="font-semibold">{item.meTooCount}</span>
          </button>

          {/* Comment Count */}
          <button
            onClick={() => onOpenDetails(item)}
            className="flex items-center gap-1 px-2 py-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 rounded-md transition-colors"
            title="View discussion & workarounds"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{item.comments.length}</span>
          </button>

          {/* Share */}
          <button
            onClick={() => onOpenShare(item)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
              item.hasUserReposted
                ? 'text-zinc-900 dark:text-zinc-100 font-medium'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
            title="Share to rally more signal"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{item.repostCount}</span>
          </button>

          <button
            onClick={() => onOpenDetails(item)}
            className="hidden sm:flex items-center gap-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors ml-1"
          >
            <span>Details</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Author info */}
        {(() => {
          const isDeletedUser = (item.authorHandle || '').toLowerCase() === '@deleted' || item.authorName === 'Deleted User';
          const storedAuthor = isDeletedUser ? null : loadProfile((item.authorHandle || '').replace(/^@/, ''));
          const effectiveAuthorName = isDeletedUser ? 'Deleted User' : (storedAuthor?.name || item.authorName);
          const effectiveAuthorAvatar = isDeletedUser ? item.authorAvatar : (storedAuthor?.avatar || item.authorAvatar);
          return (
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
              {onOpenProfile && !isDeletedUser ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenProfile(item.authorHandle, effectiveAuthorName, effectiveAuthorAvatar);
                  }}
                  className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-medium hover:underline cursor-pointer"
                >
                  {effectiveAuthorName}
                </button>
              ) : (
                <span className={isDeletedUser ? "text-zinc-400 italic" : "text-zinc-600 dark:text-zinc-300 font-medium"}>
                  {effectiveAuthorName}
                </span>
              )}
              <span>•</span>
              <span>{formatRelativeTime(item.createdAt, item.id)}</span>
            </div>
          );
        })()}
      </div>
    </article>
  );
};
