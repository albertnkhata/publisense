import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  ArrowUpRight,
  Search
} from 'lucide-react';
import { Product, FeedbackItem } from '../types';

interface LeaderboardViewProps {
  products: Product[];
  feedbackItems: FeedbackItem[];
  onSelectProduct: (productId: string) => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  products,
  feedbackItems,
  onSelectProduct,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const rankedProducts = useMemo(() => {
    return [...products]
      .filter((p) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.responsivenessRate - a.responsivenessRate);
  }, [products, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Title & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Product Responsiveness Radar
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tracking how actively AI engineering teams acknowledge and ship community-backed requests.
          </p>
        </div>

        {/* Product Search Input */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Filter radar products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-zinc-100 dark:bg-zinc-800 border border-transparent rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Clean List */}
      <div className="space-y-2">
        {rankedProducts.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            No products found matching "{searchQuery}"
          </div>
        ) : (
          rankedProducts.map((p, index) => {
            const productItems = feedbackItems.filter((i) => i.productId === p.id);
            const shippedCount = productItems.filter((i) => i.status === 'shipped').length;
            const inFlightCount = productItems.filter((i) => i.status === 'planned' || i.status === 'in_progress').length;
            const topIssue = [...productItems].sort((a, b) => b.meTooCount - a.meTooCount)[0];

            return (
              <div
                key={p.id}
                onClick={() => onSelectProduct(p.id)}
                className="cursor-pointer bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-lg p-3.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-zinc-400 w-4 text-center">
                    {index + 1}
                  </span>
                  <img
                    src={p.logo}
                    alt={p.name}
                    className="w-8 h-8 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                      <span>{p.name}</span>
                      {p.verifiedOwner && (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      )}
                      <span className="text-zinc-400 font-normal ml-1">
                        {p.category}
                      </span>
                    </div>
                    {topIssue && (
                      <p className="text-zinc-500 text-[11px] truncate max-w-md mt-0.5">
                        Top request: "{topIssue.title}" ({topIssue.meTooCount} votes)
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between sm:justify-end gap-5 pl-7 sm:pl-0">
                  <div className="text-right">
                    <span className="text-zinc-400 block text-[10px] uppercase">Shipped</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{shippedCount}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-400 block text-[10px] uppercase">In Flight</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{inFlightCount}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-400 block text-[10px] uppercase">Response</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{p.responsivenessRate}%</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hidden sm:block" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
