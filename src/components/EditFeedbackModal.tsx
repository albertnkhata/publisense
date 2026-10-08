import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Info, Sparkles } from 'lucide-react';
import { FeedbackItem, Product, FeedbackCategory, Severity } from '../types';

interface EditFeedbackModalProps {
  isOpen: boolean;
  item: FeedbackItem | null;
  product?: Product;
  onClose: () => void;
  onSave: (
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
}

export const EditFeedbackModal: React.FC<EditFeedbackModalProps> = ({
  isOpen,
  item,
  product,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [desiredChange, setDesiredChange] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [severity, setSeverity] = useState<Severity>('friction');
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDetail(item.experienceDescription);
      setDesiredChange(item.desiredChange || '');
      setCategory(item.category);
      setSeverity(item.severity);
      setTagInput(item.tags ? item.tags.join(', ') : '');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !detail.trim()) return;

    const parsedTags = tagInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    onSave(item.id, {
      title: title.trim(),
      experienceDescription: detail.trim(),
      desiredChange: desiredChange.trim() ? desiredChange.trim() : undefined,
      category,
      severity,
      tags: parsedTags,
    });
    onClose();
  };

  const hasOfficialInvolvement =
    item.status !== 'under_review' && item.status !== 'considering' || !!item.statusUpdateNote;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 transition-all">
      <div
        className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Edit Feedback
              </h2>
              {product && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium">
                  {product.name}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Update details, reproduction steps, or requested solutions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice if official action exists */}
        {hasOfficialInvolvement && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold">Notice:</span> A verified team member has already reviewed or updated this item. Your updates will be saved with an <span className="font-medium underline">(edited)</span> badge to maintain transparency with voters.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Concise summary of the issue or idea"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Detailed Description <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="What specifically happened? Steps to reproduce, expected vs actual behavior..."
              className="w-full px-3 py-2 bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all resize-y"
            />
          </div>

          {/* Requested Solution */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Ideal Fix or Suggested Solution <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={desiredChange}
              onChange={(e) => setDesiredChange(e.target.value)}
              placeholder="How would you like the product team to resolve this?"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all resize-y"
            />
          </div>

          {/* Category & Severity Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all cursor-pointer"
              >
                <option value="bug">Bug Report</option>
                <option value="ux">UX / Polish Friction</option>
                <option value="feature">Feature Request</option>
                <option value="performance">Performance & Latency</option>
                <option value="pricing">Pricing / Tiering</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all cursor-pointer"
              >
                <option value="annoyance">Annoyance (Low)</option>
                <option value="friction">Friction (Medium)</option>
                <option value="blocker">Blocker (Critical)</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Tags <span className="text-zinc-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. shortcuts, terminal, dark-mode"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
