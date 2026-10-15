import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ChevronRight,
  ChevronUp, 
  Share2, 
  Building2, 
  MessageCircle, 
  Send, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  User,
  ShieldCheck,
  ArrowRight,
  Trash2,
  Edit3,
  Ban,
  Check,
  X,
  Image as ImageIcon,
  ZoomIn
} from 'lucide-react';
import { FeedbackItem, Product, UserRole, FeedbackStatus, Comment, UserProfile, FeedbackCategory, Severity } from '../types';
import { EditFeedbackModal } from './EditFeedbackModal';
import { DeleteFeedbackModal } from './DeleteFeedbackModal';
import { formatRelativeTime } from '../lib/timeUtils';
import { loadProfile } from '../lib/profileStorage';

interface FeedbackDetailPageProps {
  item: FeedbackItem;
  product?: Product;
  userRole: UserRole;
  currentUser?: UserProfile | null;
  onBack: () => void;
  onVote: (id: string) => void;
  onOpenShare: (item: FeedbackItem) => void;
  onAddComment: (itemId: string, text: string, type: Comment['type']) => void;
  onUpdateStatus?: (itemId: string, newStatus: FeedbackStatus, note: string) => void;
  onDeleteFeedback?: (itemId: string) => void;
  onEditFeedback?: (
    itemId: string,
    updates: {
      title: string;
      experienceDescription: string;
      desiredChange?: string;
      category: FeedbackCategory;
      severity: Severity;
      tags: string[];
    }
  ) => void;
  onWithdrawFeedback?: (itemId: string) => void;
  onDeleteComment?: (itemId: string, commentId: string) => void;
  onEditComment?: (itemId: string, commentId: string, newText: string) => void;
  onOpenProfile?: (handle: string, name: string, avatar: string) => void;
  onOpenProduct?: (product: Product) => void;
  onOpenCompany?: (companyNameOrId: string) => void;
  onRequireAuth?: (promptMessage?: string) => void;
}

export const FeedbackDetailPage: React.FC<FeedbackDetailPageProps> = ({
  item,
  product,
  userRole,
  currentUser = null,
  onBack,
  onVote,
  onOpenShare,
  onAddComment,
  onUpdateStatus,
  onDeleteFeedback,
  onEditFeedback,
  onWithdrawFeedback,
  onDeleteComment,
  onEditComment,
  onOpenProfile,
  onOpenProduct,
  onOpenCompany,
  onRequireAuth,
}) => {
  const [commentText, setCommentText] = useState('');
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<FeedbackStatus>(item.status);
  const [statusNote, setStatusNote] = useState(item.statusUpdateNote || '');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<{ id: string; text: string } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const isAuthor = Boolean(
    currentUser &&
    (currentUser.handle === item.authorHandle || 
     (currentUser.handle === '@you' && item.authorHandle === '@you') ||
     (currentUser.handle === '@albert' && item.authorHandle === '@albert'))
  );
  const canManagePost = isAuthor || userRole === 'admin';

  const isDeletedAuthor = (item.authorHandle || '').toLowerCase() === '@deleted' || item.authorName === 'Deleted User';
  const storedAuthor = isDeletedAuthor ? null : loadProfile((item.authorHandle || '').replace(/^@/, ''));
  const effectiveAuthorName = isDeletedAuthor ? 'Deleted User' : (storedAuthor?.name || (isAuthor && currentUser?.name ? currentUser.name : item.authorName));
  const effectiveAuthorAvatar = isDeletedAuthor ? item.authorAvatar : (storedAuthor?.avatar || (isAuthor && currentUser?.avatar ? currentUser.avatar : item.authorAvatar));

  const getCommentAuthor = (c: Comment) => {
    const isDeletedCommentAuthor = (c.authorHandle || '').toLowerCase() === '@deleted' || c.authorName === 'Deleted User';
    const storedCommentAuthor = isDeletedCommentAuthor ? null : loadProfile((c.authorHandle || '').replace(/^@/, ''));
    const isThisCommentAuthor = Boolean(
      currentUser && !isDeletedCommentAuthor && (
        currentUser.handle === c.authorHandle || 
        (currentUser.role === 'admin' && c.authorHandle === '@albert')
      )
    );
    const authorName = isDeletedCommentAuthor ? 'Deleted User' : (storedCommentAuthor?.name || (isThisCommentAuthor && currentUser?.name ? currentUser.name : c.authorName));
    const authorAvatar = isDeletedCommentAuthor ? c.authorAvatar : (storedCommentAuthor?.avatar || (isThisCommentAuthor && currentUser?.avatar ? currentUser.avatar : c.authorAvatar));
    return { authorName, authorAvatar, isDeletedCommentAuthor };
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      if (onRequireAuth) {
        onRequireAuth('Sign in to post comments and join the builder conversation.');
      }
      return;
    }
    if (!commentText.trim()) return;
    onAddComment(item.id, commentText.trim(), 'general');
    setCommentText('');
  };

  // Only platform admin or verified PM of this product's organization can update feedback status & notes
  const isAuthorizedToUpdateStatus = Boolean(
    currentUser && (
      userRole === 'admin' ||
      (
        userRole === 'company_pm' &&
        product &&
        (
          (currentUser.companyId && product.companyId && currentUser.companyId === product.companyId) ||
          (currentUser.companyOrOrg && product.companyName && currentUser.companyOrOrg.trim().toLowerCase() === product.companyName.trim().toLowerCase())
        )
      ) ||
      (
        currentUser.companyId && product?.companyId && currentUser.companyId === product.companyId
      )
    )
  );

  const handleSaveStatus = () => {
    if (!isAuthorizedToUpdateStatus) {
      setIsEditingStatus(false);
      return;
    }
    if (onUpdateStatus) {
      onUpdateStatus(item.id, selectedStatus, statusNote);
      setIsEditingStatus(false);
    }
  };

  // Quiet status indicator with subtle dot (exact match to homepage)
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-150">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          onClick={onBack}
          className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-medium"
        >
          Home
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 flex-shrink-0" />

        {product && (
          <>
            <button
              type="button"
              onClick={() => onOpenProduct && onOpenProduct(product)}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-medium truncate max-w-[150px]"
              title={`View ${product.name}`}
            >
              {product.name}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 flex-shrink-0" />
          </>
        )}

        <span className="font-semibold text-zinc-900 dark:text-white truncate max-w-[240px]" aria-current="page" title={item.title}>
          {item.title}
        </span>
      </nav>

      {/* Prominent Context Product Card Header */}
      {product && (
        <div className="mb-6 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={product.logo}
              alt={product.name}
              className="w-11 h-11 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs flex-shrink-0"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-400">Issue filed for</span>
                <button
                  type="button"
                  onClick={() => onOpenProduct && onOpenProduct(product)}
                  className="font-bold text-sm text-zinc-900 dark:text-white hover:underline cursor-pointer"
                >
                  {product.name}
                </button>
                {product.verifiedOwner && (
                  <span title="Verified" className="inline-flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </span>
                )}
                {product.companyName && (
                  <span className="text-xs text-zinc-400">
                    by{' '}
                    {onOpenCompany ? (
                      <button
                        type="button"
                        onClick={() => onOpenCompany(product.companyId || product.companyName || '')}
                        className="hover:underline font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        {product.companyName}
                      </button>
                    ) : (
                      product.companyName
                    )}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xl">
                {product.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => onOpenProduct && onOpenProduct(product)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              <span>Product Page</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Content Column (Title, Details, Official Note, Comments) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Post Header */}
          <div className="space-y-3">
            {/* Top Metadata Row matching homepage */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                {product && (
                  <button
                    type="button"
                    onClick={() => onOpenProduct && onOpenProduct(product)}
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
                {product && <span className="text-zinc-300 dark:text-zinc-700">•</span>}
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

            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight leading-snug">
              {item.title}
            </h1>

            {/* Author bar */}
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                {!isDeletedAuthor && onOpenProfile ? (
                  <button
                    type="button"
                    onClick={() => onOpenProfile(item.authorHandle, effectiveAuthorName, effectiveAuthorAvatar)}
                    className="cursor-pointer flex-shrink-0"
                  >
                    <img
                      src={effectiveAuthorAvatar}
                      alt={effectiveAuthorName}
                      className="w-6 h-6 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 hover:opacity-80 transition-opacity"
                    />
                  </button>
                ) : (
                  <img
                    src={effectiveAuthorAvatar}
                    alt={effectiveAuthorName}
                    className="w-6 h-6 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0"
                  />
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {!isDeletedAuthor && onOpenProfile ? (
                    <button
                      type="button"
                      onClick={() => onOpenProfile(item.authorHandle, effectiveAuthorName, effectiveAuthorAvatar)}
                      className="font-semibold text-zinc-900 dark:text-zinc-200 hover:underline cursor-pointer"
                    >
                      {effectiveAuthorName}
                    </button>
                  ) : (
                    <span className={isDeletedAuthor ? "font-medium text-zinc-500 italic" : "font-semibold text-zinc-900 dark:text-zinc-200"}>
                      {effectiveAuthorName}
                    </span>
                  )}
                  <span className="text-zinc-400">{item.authorHandle}</span>
                  {isAuthor && !isDeletedAuthor && (
                    <span className="px-1.5 py-0.2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold rounded text-[10px]">
                      You
                    </span>
                  )}
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <span>{formatRelativeTime(item.createdAt, item.id)}</span>
                  {item.isEdited && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="text-zinc-400 italic text-[11px]" title={item.editedAt ? `Edited ${item.editedAt}` : 'Edited'}>
                        (edited)
                      </span>
                    </>
                  )}
                  {item.similarDuplicateCount && item.similarDuplicateCount > 0 ? (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="text-zinc-400 font-medium">{item.similarDuplicateCount} merged duplicate reports</span>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Author / Admin Post Actions */}
              {canManagePost && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 transition-colors cursor-pointer"
                    title={isAuthor ? 'Edit your feedback' : 'Edit feedback (Admin)'}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title={isAuthor ? 'Withdraw or delete your feedback' : 'Delete feedback (Admin)'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Withdrawn Notice Banner */}
          {item.isWithdrawn && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5 shadow-2xs">
              <Ban className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Withdrawn by author</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">
                  The author has marked this feedback request as retracted. It remains visible for public reference, audit trail, and existing community workarounds.
                </p>
              </div>
            </div>
          )}

          {/* Feedback Detail Body */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Detail
              </h2>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-line">
                {item.experienceDescription}
              </p>
            </div>

            {item.desiredChange && item.desiredChange.trim() ? (
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Requested Solution
                </h2>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed italic">
                  "{item.desiredChange}"
                </p>
              </div>
            ) : null}

            {/* Attached Screenshots & Images */}
            {(item.imageUrl || (item.images && item.images.length > 0)) && (
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Attached Screenshots & Mockups</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {[item.imageUrl, ...(item.images || [])].filter((img, idx, arr): img is string => Boolean(img) && arr.indexOf(img) === idx).map((url, idx) => (
                    <div
                      key={idx}
                      onClick={() => setZoomedImage(url)}
                      className="group relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 cursor-zoom-in transition-all max-w-sm"
                    >
                      <img
                        src={url}
                        alt={`Attachment ${idx + 1}`}
                        className="max-h-64 object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-150"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="p-1.5 rounded-lg bg-zinc-900/80 text-white text-xs flex items-center gap-1 shadow-md">
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>Expand image</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Official Team Update (if present or PM mode) */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/80 border border-zinc-200 dark:border-zinc-800 text-xs">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {product?.companyName || item.statusUpdatedBy || 'Official Team'}
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                {renderStatus(item.status)}
              </div>

              {isAuthorizedToUpdateStatus && (
                <button
                  onClick={() => setIsEditingStatus(!isEditingStatus)}
                  className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white underline cursor-pointer"
                >
                  {isEditingStatus ? 'Cancel' : 'Update status note'}
                </button>
              )}
            </div>

            {isEditingStatus ? (
              <div className="mt-3 space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-750">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Set Status
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as FeedbackStatus)}
                    className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 rounded-lg p-2"
                  >
                    <option value="under_review">Under Review</option>
                    <option value="considering">Considering</option>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="shipped">Shipped</option>
                    <option value="wont_do">Won't Do</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Official Note / Workaround from the Team
                  </label>
                  <textarea
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={3}
                    placeholder="Explain status, ETA, fix release, or verified workaround..."
                    className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 rounded-lg p-2.5 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditingStatus(false)}
                    className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveStatus}
                    className="px-4 py-1.5 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-lg text-xs font-semibold"
                  >
                    Save Status Update
                  </button>
                </div>
              </div>
            ) : item.statusUpdateNote ? (
              <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed mt-1">
                "{item.statusUpdateNote}"
              </p>
            ) : (
              <p className="text-zinc-400 italic text-xs">
                {userRole === 'company_pm' && !isAuthorizedToUpdateStatus
                  ? `No official team note posted yet. (Official status notes are restricted to verified ${product?.companyName || 'owning organisation'} PMs)`
                  : 'No official team note posted yet. Upvote this issue to bring it to the team\'s attention.'}
              </p>
            )}
          </div>

          {/* Comments & Discussion Section: Room to breathe */}
          <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                <h2 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white">
                  Discussion
                </h2>
                <span className="text-xs text-zinc-400 font-normal">
                  ({item.comments.length})
                </span>
              </div>
            </div>

            {/* Comment Composer */}
            {!currentUser ? (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-500 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Join the discussion
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Sign in to post replies, share reproduction workarounds, or ask questions.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRequireAuth?.('Sign in to post comments and join the builder conversation.')}
                  className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
                >
                  Sign in to reply
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleCommentSubmit}
                className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3"
              >
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your thoughts, context, or reproduction details..."
                  rows={3}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-lg p-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
                />

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-zinc-400">
                    Keep it constructive and reproducible.
                  </p>
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 disabled:opacity-40 text-white dark:text-zinc-900 text-xs font-medium rounded-lg transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Reply</span>
                  </button>
                </div>
              </form>
            )}

            {/* Comments Thread */}
            <div className="space-y-3 pt-2">
              {item.comments.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-zinc-50 dark:bg-zinc-850/50 border border-zinc-200/60 dark:border-zinc-800 text-xs text-zinc-400">
                  No comments yet. Have you encountered this or found a workaround? Be the first to share.
                </div>
              ) : (
                item.comments.map((c) => {
                  const { authorName: commentAuthorName, authorAvatar: commentAuthorAvatar, isDeletedCommentAuthor } = getCommentAuthor(c);
                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-xl border text-xs transition-colors ${
                        c.type === 'workaround'
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/40'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          {!isDeletedCommentAuthor && onOpenProfile ? (
                            <button
                              type="button"
                              onClick={() => onOpenProfile(c.authorHandle, commentAuthorName, commentAuthorAvatar)}
                              className="cursor-pointer flex-shrink-0"
                            >
                              <img
                                src={commentAuthorAvatar}
                                alt={commentAuthorName}
                                className="w-6 h-6 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 hover:opacity-80 transition-opacity"
                              />
                            </button>
                          ) : (
                            <img
                              src={commentAuthorAvatar}
                              alt={commentAuthorName}
                              className="w-6 h-6 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0"
                            />
                          )}
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {!isDeletedCommentAuthor && onOpenProfile ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenProfile(c.authorHandle, commentAuthorName, commentAuthorAvatar)}
                                  className="font-semibold text-zinc-900 dark:text-white hover:underline cursor-pointer"
                                >
                                  {commentAuthorName}
                                </button>
                              ) : (
                                <span className={isDeletedCommentAuthor ? "font-medium text-zinc-500 italic" : "font-semibold text-zinc-900 dark:text-white"}>
                                  {commentAuthorName}
                                </span>
                              )}
                              <span className="text-[11px] text-zinc-400">{c.authorHandle}</span>
                              {c.authorHandle === item.authorHandle && !isDeletedCommentAuthor && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/80 dark:border-zinc-700/80">
                                  Author
                                </span>
                              )}
                              {!isDeletedCommentAuthor && c.roleBadge === 'admin_verified' && (
                                <span title="Platform Admin" className="inline-flex items-center text-zinc-400">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </span>
                              )}
                              {!isDeletedCommentAuthor && c.roleBadge === 'team_verified' && (
                                <span title="Verified Team" className="inline-flex items-center text-zinc-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </span>
                              )}
                              {c.type === 'workaround' && (
                                <>
                                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                                  <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                    Workaround
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                          {formatRelativeTime(c.createdAt, c.id)}
                        </span>
                        {c.isEdited && (
                          <span className="text-[10px] text-zinc-400 italic">
                            (edited)
                          </span>
                        )}

                        {/* Comment Author Edit */}
                        {currentUser && currentUser.handle === c.authorHandle && editingCommentId !== c.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(c.id);
                              setEditingCommentText(c.text);
                            }}
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors cursor-pointer"
                            title="Edit comment"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}

                        {/* Comment Author or Admin Delete */}
                        {(userRole === 'admin' || (currentUser && currentUser.handle === c.authorHandle)) && (
                          <button
                            type="button"
                            onClick={() => setCommentToDelete({ id: c.id, text: c.text })}
                            className="p-1 text-zinc-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                            title={userRole === 'admin' ? "Delete comment (Admin)" : "Delete your comment"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {editingCommentId === c.id ? (
                      <div className="mt-2 pl-8 space-y-2">
                        <textarea
                          rows={2}
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white resize-y"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (editingCommentText.trim() && onEditComment) {
                                onEditComment(item.id, c.id, editingCommentText.trim());
                              }
                              setEditingCommentId(null);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-800 dark:text-zinc-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line pl-8">
                        {c.text}
                      </p>
                    )}
                  </div>
                );
              })
              )}
            </div>
          </div>
        </div>

        {/* Right Action / Details Sidebar */}
        <div className="space-y-4 lg:sticky lg:top-20">
          {/* Voting & Share Card */}
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Back this Issue
            </h3>
            
            <button
              onClick={() => onVote(item.id)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                item.hasUserVoted
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                  : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
              }`}
            >
              <ChevronUp className={`w-4 h-4 ${item.hasUserVoted ? 'stroke-[2.5]' : ''}`} />
              <span>{item.hasUserVoted ? 'Upvoted' : 'Upvote'}</span>
              <span className="ml-1 px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs">
                {item.meTooCount}
              </span>
            </button>

            <button
              onClick={() => onOpenShare(item)}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share to X / Copy Link</span>
            </button>

            <p className="text-[11px] text-zinc-400 text-center leading-normal pt-1">
              Upvoting shows demand and prioritizes this for the product team.
            </p>
          </div>

          {/* Author Controls Card (Industry standard) */}
          {isAuthor && (
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200 dark:border-zinc-800 space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">
                  Author Controls
                </h3>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                You created this report. You can update description, solutions, or withdraw it.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="flex-1 py-1.5 px-3 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer text-center"
                >
                  Edit Post
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="py-1.5 px-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Withdraw
                </button>
              </div>
            </div>
          )}

          {/* Admin Moderation Panel */}
          {userRole === 'admin' && (
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">
                  Admin Moderation
                </h3>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                You have platform moderation permissions to delete, curate, and override statuses.
              </p>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Feedback (Admin)</span>
              </button>
            </div>
          )}

          {/* Prominent Sidebar Product Card */}
          {product && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-start gap-3">
                <img
                  src={product.logo}
                  alt={product.name}
                  className="w-12 h-12 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onOpenProduct && onOpenProduct(product)}
                      className="font-bold text-sm text-zinc-900 dark:text-white hover:underline text-left truncate cursor-pointer"
                    >
                      {product.name}
                    </button>
                    {product.verifiedOwner && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                  {product.companyName && (
                    <p className="text-[11px] text-zinc-400 truncate">
                      by{' '}
                      {onOpenCompany ? (
                        <button
                          type="button"
                          onClick={() => onOpenCompany(product.companyId || product.companyName || '')}
                          className="hover:underline font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer"
                        >
                          {product.companyName}
                        </button>
                      ) : (
                        product.companyName
                      )}
                    </p>
                  )}
                  <span className="inline-block text-[10px] text-zinc-500 font-medium">
                    {product.category}
                  </span>
                </div>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
                {product.tagline || product.description}
              </p>

              {/* Health Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800 text-center">
                <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                    {product.totalFeedbackCount}
                  </span>
                  <span className="text-[10px] text-zinc-400">Signals</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                    {product.resolvedFeedbackCount}
                  </span>
                  <span className="text-[10px] text-zinc-400">Shipped</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 block">
                    {product.responsivenessRate}%
                  </span>
                  <span className="text-[10px] text-zinc-400">Response</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenProduct && onOpenProduct(product)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <span>View {product.name} Page</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Metadata Card */}
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Issue Information
            </h3>

            <div className="space-y-2.5 text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Product</span>
                {product && onOpenProduct ? (
                  <button
                    type="button"
                    onClick={() => onOpenProduct(product)}
                    className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline cursor-pointer"
                  >
                    {product.name}
                  </button>
                ) : (
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {product?.name || 'General'}
                  </span>
                )}
              </div>

              {product?.companyName && (
                <div className="flex items-center justify-between">
                  <span>Organization</span>
                  {onOpenCompany ? (
                    <button
                      type="button"
                      onClick={() => onOpenCompany(product.companyId || product.companyName || '')}
                      className="font-medium text-zinc-800 dark:text-zinc-200 hover:underline cursor-pointer"
                    >
                      {product.companyName}
                    </button>
                  ) : (
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {product.companyName}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="capitalize font-medium text-zinc-900 dark:text-zinc-200">
                  {item.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Category</span>
                <span className="capitalize font-medium text-zinc-900 dark:text-zinc-200">
                  {item.category}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Impact</span>
                <span className="capitalize font-medium text-zinc-900 dark:text-zinc-200">
                  {item.severity}
                </span>
              </div>

              {item.tags && item.tags.length > 0 && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Feedback Modal for Author & Admin */}
      <EditFeedbackModal
        isOpen={isEditModalOpen}
        item={item}
        product={product}
        onClose={() => setIsEditModalOpen(false)}
        onSave={(itemId, updates) => {
          if (onEditFeedback) {
            onEditFeedback(itemId, updates);
          }
        }}
      />

      {/* Delete / Withdraw Modal for Author & Admin */}
      <DeleteFeedbackModal
        isOpen={isDeleteModalOpen}
        item={item}
        userRole={userRole}
        isAuthor={isAuthor}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirmDelete={(itemId) => {
          if (onDeleteFeedback) {
            onDeleteFeedback(itemId);
          }
        }}
        onConfirmWithdraw={(itemId) => {
          if (onWithdrawFeedback) {
            onWithdrawFeedback(itemId);
          }
        }}
      />

      {/* Delete Comment Modal for Author & Admin */}
      <DeleteFeedbackModal
        isOpen={Boolean(commentToDelete)}
        comment={commentToDelete}
        userRole={userRole}
        isAuthor={true}
        onClose={() => setCommentToDelete(null)}
        onConfirmDelete={(commentId) => {
          if (onDeleteComment) {
            onDeleteComment(item.id, commentId);
          }
          setCommentToDelete(null);
        }}
      />

      {/* Lightbox Modal for full image inspection */}
      {zoomedImage && (
        <div 
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute -top-10 right-0 p-1.5 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              title="Close image view"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomedImage}
              alt="Full size screenshot"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
