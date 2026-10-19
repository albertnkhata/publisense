import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Send,
  Sparkles,
  ChevronUp,
  X,
  Plus,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  FeedbackType,
  Severity,
  FEEDBACK_TYPES,
} from '../types';
import { useStore } from '../context/StoreContext';

interface InlineComposerProps {
  defaultProductId?: string;
  defaultExpanded?: boolean;
  onSuccess?: () => void;
}

export const InlineComposer: React.FC<InlineComposerProps> = ({
  defaultProductId = '',
  defaultExpanded = false,
  onSuccess,
}) => {
  const {
    products,
    posts,
    currentUser,
    createPost,
    toggleUpvote,
    openAuthModal,
    openCreateProductModal,
  } = useStore();

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [productId, setProductId] = useState(defaultProductId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<FeedbackType>('feature');
  const [severity, setSeverity] = useState<Severity>('friction');
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === (productId || defaultProductId)),
    [products, productId, defaultProductId]
  );

  // Live Duplicate Signal Detector
  const similarPosts = useMemo(() => {
    const cleanTitle = title.trim().toLowerCase();
    if (cleanTitle.length < 4) return [];
    const keywords = cleanTitle.split(/\s+/).filter((w) => w.length > 3);
    if (keywords.length === 0) return [];

    const activeProdId = productId || defaultProductId;
    return posts
      .filter((p) => (!activeProdId ? true : p.productId === activeProdId))
      .filter((p) => {
        const hay = `${p.title} ${p.body}`.toLowerCase();
        return keywords.some((kw) => hay.includes(kw));
      })
      .slice(0, 2);
  }, [title, productId, defaultProductId, posts]);

  const handleFocusExpand = () => {
    if (!currentUser) {
      openAuthModal('Sign in to post product feedback and rally community support.');
      return;
    }
    setIsExpanded(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      openAuthModal('Sign in to publish your signal.');
      return;
    }
    const targetProductId = productId || defaultProductId;
    if (!targetProductId || !title.trim() || !body.trim()) return;

    setIsSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean);

      await createPost({
        productId: targetProductId,
        title,
        body,
        type,
        severity,
        tags,
      });

      setTitle('');
      setBody('');
      setTagsInput('');
      if (!defaultExpanded) setIsExpanded(false);
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <div
        onClick={handleFocusExpand}
        className="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-3.5 sm:p-4 cursor-pointer transition-all shadow-2xs flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={
              currentUser?.avatarUrl ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80'
            }
            alt="Avatar"
            className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
          />
          <span className="text-xs sm:text-sm text-zinc-400 dark:text-zinc-500 truncate">
            {selectedProduct
              ? `Share a bug, UX friction, or feature request for ${selectedProduct.name}...`
              : 'Spot product friction, a bug, or a feature idea? Share a signal...'}
          </span>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-semibold shrink-0"
        >
          Post Signal
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-3.5 text-xs"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
            Post a Product Signal
          </span>
        </div>
        {!defaultExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Product Selector & Type Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-medium text-zinc-600 dark:text-zinc-400">
              Product
            </label>
            <button
              type="button"
              onClick={openCreateProductModal}
              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add missing product</span>
            </button>
          </div>
          <select
            required
            value={productId || defaultProductId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400"
          >
            <option value="">Select a product...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.tagline.slice(0, 42)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Signal Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FeedbackType)}
              className="w-full px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
            >
              {FEEDBACK_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Severity
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="w-full px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
            >
              <option value="annoyance">Minor Annoyance</option>
              <option value="friction">Workflow Friction</option>
              <option value="blocker">Critical Blocker</option>
            </select>
          </div>
        </div>
      </div>

      {/* Title */}
      <div>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Concise, specific headline (e.g. 'Allow pinning architecture files to Composer context')"
          className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
        />
      </div>

      {/* Live Duplicate Detector */}
      {similarPosts.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Similar signal already exists — back it instead of splitting votes:</span>
          </div>
          {similarPosts.map((dup) => (
            <div
              key={dup.id}
              className="flex items-center justify-between gap-2 p-2 rounded-md bg-white dark:bg-zinc-900 border border-amber-200/60 dark:border-zinc-800"
            >
              <Link
                to={`/post/${dup.id}`}
                className="font-medium text-zinc-800 dark:text-zinc-200 hover:underline truncate"
              >
                {dup.title}
              </Link>
              <button
                type="button"
                onClick={() => toggleUpvote(dup.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[11px] font-semibold shrink-0 cursor-pointer"
              >
                <ChevronUp className="w-3 h-3" />
                <span>Upvote ({dup.upvoteCount})</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div>
        <textarea
          required
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe what happens today, why it causes friction, and what the ideal workflow looks like..."
          className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
        />
      </div>

      {/* Tags & Submit Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="Optional tags (comma separated: dx, rls, performance)"
          className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none"
        />

        <div className="flex items-center justify-end gap-2">
          {!defaultExpanded && (
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="px-3 py-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !(productId || defaultProductId) || !title.trim() || !body.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-semibold text-xs disabled:opacity-40 cursor-pointer transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Publish Signal</span>
          </button>
        </div>
      </div>
    </form>
  );
};
