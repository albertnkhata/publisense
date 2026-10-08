import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2, 
  ChevronUp,
  Search,
  TrendingUp,
  ArrowRight,
  Image as ImageIcon,
  Upload,
  Link
} from 'lucide-react';
import { Product, FeedbackCategory, Severity, FeedbackItem } from '../types';

interface SubmitFeedbackModalProps {
  products: Product[];
  existingItems: FeedbackItem[];
  defaultProductId?: string;
  onClose: () => void;
  onSubmit: (newItem: {
    productId: string;
    title: string;
    experienceDescription: string;
    desiredChange?: string;
    category: FeedbackCategory;
    severity: Severity;
    tags: string[];
    imageUrl?: string;
    images?: string[];
  }) => void;
  onVoteExisting: (itemId: string) => void;
  onSelectExistingToView: (item: FeedbackItem) => void;
}

export const SubmitFeedbackModal: React.FC<SubmitFeedbackModalProps> = ({
  products,
  existingItems,
  defaultProductId,
  onClose,
  onSubmit,
  onVoteExisting,
  onSelectExistingToView,
}) => {
  const [productId, setProductId] = useState(defaultProductId || '');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [severity, setSeverity] = useState<Severity>('friction');
  const [tagInput, setTagInput] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const res = event.target?.result;
      if (typeof res === 'string') {
        setAttachedImages((prev) => [...prev, res]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddImageUrl = () => {
    if (!imageUrlInput.trim()) return;
    setAttachedImages((prev) => [...prev, imageUrlInput.trim()]);
    setImageUrlInput('');
    setShowUrlInput(false);
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const selectedProduct = useMemo(() => {
    if (!productId) return null;
    return products.find((p) => p.id === productId) || null;
  }, [products, productId]);

  // Unique categories for filtering inside product search
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [products]);

  // Trending / Popular products (for quick-access chips)
  const trendingProducts = useMemo(() => {
    return products.filter((p) => p.isTrending || p.isFeatured).slice(0, 5);
  }, [products]);

  // Filtered products for live search results
  const searchResults = useMemo(() => {
    return products.filter((p) => {
      if (productCategoryFilter !== 'all' && p.category !== productCategoryFilter) {
        return false;
      }
      if (!productQuery.trim()) return true;
      const q = productQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q)
      );
    });
  }, [products, productQuery, productCategoryFilter]);

  // Handle clicking outside to close results dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Live duplicate detector
  const potentialDuplicates = useMemo(() => {
    if (!title.trim() || title.trim().length < 4) return [];
    
    const words = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return [];

    return existingItems
      .filter((item) => item.productId === productId)
      .filter((item) => {
        const itemText = (item.title + ' ' + item.experienceDescription).toLowerCase();
        return words.some(w => itemText.includes(w));
      })
      .slice(0, 2);
  }, [title, productId, existingItems]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !detail.trim()) return;

    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSubmit({
      productId,
      title: title.trim(),
      experienceDescription: detail.trim(),
      desiredChange: '',
      category,
      severity,
      tags: tags.length > 0 ? tags : [category],
      imageUrl: attachedImages[0] || undefined,
      images: attachedImages.length > 0 ? attachedImages : undefined,
    });

    setSubmittedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 transition-all">
      <div 
        className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl w-full max-w-xl shadow-xl overflow-hidden my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              New Feedback
            </h2>
            <p className="text-xs text-zinc-500">
              Post an issue or suggestion for community backing
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submittedSuccess ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Feedback Submitted</h3>
            <p className="text-xs text-zinc-500">Your post is now live with your backing.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto text-xs">
            {/* Step 1: Select Product using Find & Trending */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-medium text-zinc-700 dark:text-zinc-300 block">
                  Product {selectedProduct ? '(1 selected)' : '(select target)'}
                </label>
                {selectedProduct && (
                  <span className="text-[11px] text-zinc-400">
                    Posting for <span className="font-semibold text-zinc-700 dark:text-zinc-200">{selectedProduct.name}</span>
                  </span>
                )}
              </div>

              {selectedProduct ? (
                /* When a product is picked: ONLY this product card appears, with a Clear option */
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl transition-all animate-in fade-in duration-150">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={selectedProduct.logo}
                      alt={selectedProduct.name}
                      className="w-9 h-9 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {selectedProduct.name}
                        </span>
                        {selectedProduct.verifiedOwner && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified Team
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-400">• {selectedProduct.category}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {selectedProduct.tagline}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProductId('');
                      setProductQuery('');
                      setIsSearchOpen(true);
                      setTimeout(() => searchInputRef.current?.focus(), 50);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-2xs transition-colors cursor-pointer flex-shrink-0 ml-2"
                    title="Choose a different product"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              ) : (
                /* When no product is picked: Show the Find feature & Trending chips */
                <div className="space-y-2 animate-in fade-in duration-150">
                  <div className="relative" ref={searchContainerRef}>
                    <div className="relative flex items-center">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={productQuery}
                        onChange={(e) => {
                          setProductQuery(e.target.value);
                          if (!isSearchOpen) setIsSearchOpen(true);
                        }}
                        onFocus={() => setIsSearchOpen(true)}
                        placeholder="Search product (e.g. Cursor, Claude, ChatGPT, v0, Supabase)..."
                        className="w-full pl-9 pr-8 py-2 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100/80 dark:hover:bg-zinc-800 focus:bg-white dark:focus:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all"
                      />
                      {productQuery && (
                        <button
                          type="button"
                          onClick={() => setProductQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Autocomplete / Search Results Popover Dropdown */}
                    {isSearchOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden text-xs">
                        {/* Category Filter Pills */}
                        <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-1 overflow-x-auto scrollbar-none bg-zinc-50/70 dark:bg-zinc-850/60">
                          <button
                            type="button"
                            onClick={() => setProductCategoryFilter('all')}
                            className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap transition-colors ${
                              productCategoryFilter === 'all'
                                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium'
                                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                            }`}
                          >
                            All
                          </button>
                          {categories.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setProductCategoryFilter(cat)}
                              className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap transition-colors ${
                                productCategoryFilter === cat
                              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium'
                              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>

                        {/* Results list */}
                        <div className="max-h-52 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 p-1">
                          {searchResults.length === 0 ? (
                            <div className="py-6 text-center text-zinc-400 text-xs">
                              No products found matching "{productQuery}"
                            </div>
                          ) : (
                            searchResults.map((p) => (
                              <div
                                key={p.id}
                                onClick={() => {
                                  setProductId(p.id);
                                  setIsSearchOpen(false);
                                  setProductQuery('');
                                }}
                                className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <img
                                    src={p.logo}
                                    alt={p.name}
                                    className="w-5 h-5 rounded-md object-cover flex-shrink-0 border border-zinc-200 dark:border-zinc-700"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                        {p.name}
                                      </span>
                                      {p.verifiedOwner && (
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                      )}
                                      <span className="text-[10px] text-zinc-400">• {p.category}</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                                      {p.tagline}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                  <span className="text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                                    Pick
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Trending Products Row */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
                    <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1 mr-0.5 flex-shrink-0">
                      <TrendingUp className="w-3 h-3 text-zinc-400" />
                      <span>Trending:</span>
                    </span>
                    {trendingProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setProductId(p.id);
                          setProductQuery('');
                          setIsSearchOpen(false);
                        }}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer bg-zinc-100/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60"
                      >
                        <img src={p.logo} alt={p.name} className="w-3 h-3 rounded-full object-cover" />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Title */}
            <div>
              <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short, specific summary..."
                className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
              />
            </div>

            {/* Smart Duplicate Banner (Quiet & helpful) */}
            {potentialDuplicates.length > 0 && (
              <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs space-y-2">
                <span className="font-medium text-zinc-800 dark:text-zinc-200 block">
                  Existing request found:
                </span>
                {potentialDuplicates.map((dup) => (
                  <div key={dup.id} className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
                    <span className="truncate text-zinc-700 dark:text-zinc-300">{dup.title}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onVoteExisting(dup.id);
                        onSelectExistingToView(dup);
                        onClose();
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-2 py-0.5 rounded flex-shrink-0"
                    >
                      <ChevronUp className="w-3 h-3" />
                      <span>Upvote this instead ({dup.meTooCount})</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Detail */}
            <div>
              <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Detail
              </label>
              <textarea
                required
                rows={4}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Describe what occurs, why it creates friction, or what change is needed..."
                className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
            </div>

            {/* Screenshots & Images Attachment (Requested by community feedback) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Screenshots & Mockups (optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Link className="w-3 h-3" />
                    <span>{showUrlInput ? 'Hide URL input' : 'Add via URL'}</span>
                  </button>
                </div>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageFileChange}
              />

              {/* URL Input Bar */}
              {showUrlInput && (
                <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 animate-in fade-in duration-100">
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://example.com/screenshot.png"
                    className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-750 rounded px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddImageUrl();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-2.5 py-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded font-medium text-[11px] cursor-pointer hover:bg-zinc-800"
                  >
                    Attach
                  </button>
                </div>
              )}

              {/* Attached Images List & Upload Drop Button */}
              <div className="flex flex-wrap items-center gap-2">
                {attachedImages.map((imgUrl, idx) => (
                  <div
                    key={idx}
                    className="relative group w-16 h-16 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 shadow-2xs"
                  >
                    <img
                      src={imgUrl}
                      alt={`Attached image ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 hover:bg-black text-white cursor-pointer transition-colors"
                      title="Remove screenshot"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center w-28 h-16 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50 dark:bg-zinc-850 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  <Upload className="w-4 h-4 mb-0.5" />
                  <span className="text-[10px] font-medium">Upload Image</span>
                </button>
              </div>
            </div>

            {/* Step 5: Category & Severity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Type
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-800 dark:text-zinc-200"
                >
                  <option value="bug">Bug</option>
                  <option value="ux">UX / Usability</option>
                  <option value="feature">Feature Request</option>
                  <option value="performance">Performance</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Impact
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-800 dark:text-zinc-200"
                >
                  <option value="annoyance">Minor annoyance</option>
                  <option value="friction">Workflow friction</option>
                  <option value="blocker">Critical blocker</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!productId || !title.trim() || !detail.trim()}
                className="flex items-center gap-1 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 disabled:opacity-40 text-white dark:text-zinc-900 text-xs font-medium rounded-lg transition-all"
              >
                <Send className="w-3 h-3" />
                <span>Publish</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
