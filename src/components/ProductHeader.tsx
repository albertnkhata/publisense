import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  ExternalLink, 
  Search, 
  X, 
  TrendingUp, 
  ArrowRight,
  Plus,
  Globe
} from 'lucide-react';
import { Product } from '../types';

interface ProductHeaderProps {
  products: Product[];
  selectedProductId: string | 'all';
  onSelectProduct: (id: string | 'all') => void;
  onOpenSubmit?: () => void;
  onOpenProductPage?: (product: Product) => void;
}

export const ProductHeader: React.FC<ProductHeaderProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  onOpenSubmit,
  onOpenProductPage,
}) => {
  const [productQuery, setProductQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentProduct = selectedProductId === 'all' 
    ? null 
    : products.find((p) => p.id === selectedProductId);

  // Trending / Popular products (for the quick-access pill list)
  const trendingProducts = useMemo(() => {
    return products.filter((p) => p.isTrending || p.isFeatured).slice(0, 6);
  }, [products]);

  // Unique categories for filtering inside product search
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [products]);

  // Filtered products for live search results
  const searchResults = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) {
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
  }, [products, productQuery, categoryFilter]);

  // Handle clicking outside to close results dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectProduct = (id: string) => {
    // If user clicks the already-selected product pill, toggle it back to 'all'
    if (selectedProductId === id) {
      onSelectProduct('all');
    } else {
      onSelectProduct(id);
    }
    setIsFocused(false);
    setProductQuery('');
  };

  const handleClearSelection = () => {
    onSelectProduct('all');
    setProductQuery('');
  };

  return (
    <div className="space-y-3">
      {/* Prominent Product Search Bar */}
      <div className="relative" ref={searchContainerRef}>
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value);
              if (!isFocused) setIsFocused(true);
            }}
            onFocus={() => setIsFocused(true)}
            placeholder="Find any product (e.g. Cursor, Claude, ChatGPT, v0, Supabase, Linear)..."
            className="w-full pl-10 pr-24 py-2.5 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 border border-zinc-200/90 dark:border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none shadow-2xs transition-all"
          />

            {/* Clear input button */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {productQuery && (
                <button
                  type="button"
                  onClick={() => setProductQuery('')}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-md"
                  title="Clear search input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Autocomplete / Search Results Popover Dropdown */}
          {isFocused && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden text-xs">
              {/* Category Filter Pills inside Search */}
              <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-1 overflow-x-auto scrollbar-none bg-zinc-50/70 dark:bg-zinc-850/60">
                <span className="text-[10px] uppercase font-semibold text-zinc-400 px-1 mr-0.5">
                  Category:
                </span>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap transition-colors ${
                    categoryFilter === 'all'
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
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap transition-colors ${
                      categoryFilter === cat
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Product Results List */}
              <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 p-1">
                {searchResults.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 text-xs">
                    No products found matching "{productQuery}"
                  </div>
                ) : (
                  searchResults.map((p) => {
                    const isSelected = selectedProductId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProduct(p.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-zinc-100 dark:bg-zinc-800 font-medium'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={p.logo}
                            alt={p.name}
                            className="w-6 h-6 rounded-md object-cover flex-shrink-0 border border-zinc-200 dark:border-zinc-700"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                {p.name}
                              </span>
                              {p.verifiedOwner && (
                                <span title="Verified Product Team" className="inline-flex">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                </span>
                              )}
                              <span className="text-[10px] text-zinc-400">• {p.category}</span>
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                              {p.tagline}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 ml-3 flex items-center gap-2">
                          <span className="text-[11px] text-zinc-400 font-mono">
                            {p.totalFeedbackCount} issues
                          </span>
                          <ArrowRight className="w-3 h-3 text-zinc-300 dark:text-zinc-600" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Popover Footer */}
              <div className="p-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 flex items-center justify-between text-[11px] text-zinc-400">
                <span>{searchResults.length} products available</span>
                {selectedProductId !== 'all' && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="text-zinc-600 dark:text-zinc-300 hover:underline"
                  >
                    Reset to All Products
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Trending / Popular Products Row (Only real trending products, no weird "All Products" chip) */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-none text-xs">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1 mr-1 flex-shrink-0">
              <TrendingUp className="w-3 h-3 text-zinc-400" />
              <span>Trending:</span>
            </span>

            {/* Trending product pills */}
            {trendingProducts.map((p) => {
              const isSelected = selectedProductId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectProduct(p.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                  }`}
                  title={isSelected ? `Click to deselect ${p.name}` : `View feedback for ${p.name}`}
                >
                  <img
                    src={p.logo}
                    alt={p.name}
                    className="w-3.5 h-3.5 rounded-full object-cover"
                  />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Clear Filter Link (Only appears when a product is active) */}
          {selectedProductId !== 'all' && (
            <button
              onClick={handleClearSelection}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/80 whitespace-nowrap flex-shrink-0 transition-colors"
              title="Show feedback from all products"
            >
              <X className="w-3 h-3" />
              <span>Clear filter</span>
            </button>
          )}
        </div>

        {/* Selected Product Card (Opens up prominently when a product is picked) */}
        {currentProduct && (
          <div className="mt-2 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-all animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              {/* Product Identity & Context */}
              <div className="flex items-start gap-3.5">
                <img
                  src={currentProduct.logo}
                  alt={currentProduct.name}
                  className="w-12 h-12 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-xs flex-shrink-0"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-tight">
                      {currentProduct.name}
                    </h2>
                    {currentProduct.verifiedOwner ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md font-medium border border-zinc-200 dark:border-zinc-700">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Verified Team
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                        Community Tracked
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">
                      • {currentProduct.category}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-xl leading-relaxed">
                    {currentProduct.description || currentProduct.tagline}
                  </p>

                  {/* Links & Sub-meta */}
                  <div className="flex items-center gap-3 pt-1 text-xs text-zinc-400 flex-wrap">
                    <a
                      href={currentProduct.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 transition-colors group/link"
                      title={`Visit ${currentProduct.name} website (${currentProduct.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')})`}
                    >
                      <Globe className="w-3 h-3 text-zinc-400 group-hover/link:text-zinc-600 dark:group-hover/link:text-zinc-200" />
                      <span>{currentProduct.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                    </a>
                    <span>•</span>
                    <span>{currentProduct.twitterHandle}</span>
                    {currentProduct.officialTeamName && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="hidden sm:inline text-zinc-500 dark:text-zinc-400">
                          {currentProduct.officialTeamName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right side: Health Metrics & Action Controls */}
              <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-3 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-200/80 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  {onOpenProductPage && (
                    <button
                      type="button"
                      onClick={() => onOpenProductPage(currentProduct)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                    >
                      <span>Product Page</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}

                  {/* Close / Reset Button */}
                  <button
                    onClick={handleClearSelection}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white px-2.5 py-1 rounded-md bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700/80 transition-colors cursor-pointer"
                    title="Return to feed of all products"
                  >
                    <X className="w-3 h-3" />
                    <span>All products</span>
                  </button>
                </div>

                {/* Score & Metric Stats */}
                <div className="flex items-center gap-3.5 text-xs bg-white dark:bg-zinc-900/90 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-zinc-400 block font-mono">Signals</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{currentProduct.totalFeedbackCount}</span>
                  </div>
                  <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-zinc-400 block font-mono">Shipped</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{currentProduct.resolvedFeedbackCount}</span>
                  </div>
                  <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-zinc-400 block font-mono">Response</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{currentProduct.responsivenessRate}%</span>
                  </div>
                </div>

                {/* Quick Action: Post for this product */}
                {onOpenSubmit && (
                  <button
                    onClick={onOpenSubmit}
                    className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white hover:underline pt-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Post feedback for {currentProduct.name}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
