import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  ChevronRight,
  CheckCircle2, 
  ExternalLink, 
  Plus, 
  TrendingUp, 
  Clock, 
  Check, 
  AlertTriangle, 
  Sparkles, 
  Filter, 
  Flame, 
  ShieldCheck,
  Building2,
  Share2,
  Bell,
  Globe
} from 'lucide-react';
import { Product, FeedbackItem, FeedbackStatus, FeedbackCategory, Company, UserRole } from '../types';
import { FeedbackCard } from './FeedbackCard';
import { FilterDropdown } from './FilterDropdown';

interface ProductPageProps {
  product: Product;
  company?: Company;
  feedbackItems: FeedbackItem[];
  userRole?: UserRole;
  onBack: () => void;
  onOpenDetails: (item: FeedbackItem) => void;
  onVote: (id: string) => void;
  onOpenShare: (item: FeedbackItem) => void;
  onOpenSubmit: (productId?: string) => void;
  onToggleVerifyProduct?: (productId: string) => void;
  onDeleteProduct?: (productId: string) => void;
  onOpenProfile?: (handle: string, name: string, avatar: string) => void;
  onOpenCompany?: (company: Company) => void;
  isFollowing?: boolean;
  onToggleFollow?: (productId: string) => void;
}

export const ProductPage: React.FC<ProductPageProps> = ({
  product,
  company,
  feedbackItems,
  userRole,
  onBack,
  onOpenDetails,
  onVote,
  onOpenShare,
  onOpenSubmit,
  onToggleVerifyProduct,
  onDeleteProduct,
  onOpenProfile,
  onOpenCompany,
  isFollowing,
  onToggleFollow,
}) => {
  // Formalised sorting & filtering states matching homepage
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'trending' | 'top' | 'newest'>('trending');

  // Follow state
  const [localFollowing, setLocalFollowing] = useState(Boolean(isFollowing));
  const activeFollowing = isFollowing !== undefined ? isFollowing : localFollowing;
  const [followerDelta, setFollowerDelta] = useState(0);

  const handleToggleFollow = () => {
    if (activeFollowing) {
      setFollowerDelta((prev) => prev - 1);
      setLocalFollowing(false);
    } else {
      setFollowerDelta((prev) => prev + 1);
      setLocalFollowing(true);
    }
    if (onToggleFollow) {
      onToggleFollow(product.id);
    }
  };

  // Filter items specifically for this product
  const productFeedback = useMemo(() => {
    return feedbackItems.filter((item) => item.productId === product.id);
  }, [feedbackItems, product.id]);

  // Metric counts for hero scorecard aligned with status types
  const openCount = useMemo(() => {
    return productFeedback.filter((item) => item.status === 'under_review' || (item.status as any) === 'considering').length;
  }, [productFeedback]);

  const plannedCount = useMemo(() => {
    return productFeedback.filter((item) => item.status === 'planned').length;
  }, [productFeedback]);

  const inProgressCount = useMemo(() => {
    return productFeedback.filter((item) => item.status === 'in_progress').length;
  }, [productFeedback]);

  const shippedCount = useMemo(() => {
    return productFeedback.filter((item) => item.status === 'shipped').length;
  }, [productFeedback]);

  // Formalised Filter & Sort pipeline (identical logic to homepage)
  const displayedItems = useMemo(() => {
    return productFeedback
      .filter((item) => {
        if (statusFilter !== 'all') {
          if (statusFilter === 'open' || statusFilter === 'active') {
            if (item.status !== 'under_review' && (item.status as any) !== 'considering') return false;
          } else if (item.status !== statusFilter) {
            return false;
          }
        }

        if (categoryFilter !== 'all' && item.category !== categoryFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'trending') {
          return b.meTooCount + b.repostCount * 2 - (a.meTooCount + a.repostCount * 2);
        } else if (sortBy === 'top') {
          return b.meTooCount - a.meTooCount;
        } else {
          return b.id.localeCompare(a.id);
        }
      });
  }, [productFeedback, statusFilter, categoryFilter, sortBy]);

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

        {company && onOpenCompany && (
          <>
            <button
              type="button"
              onClick={() => onOpenCompany(company)}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-medium truncate max-w-[150px]"
              title={`View ${company.name}`}
            >
              {company.name}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 flex-shrink-0" />
          </>
        )}

        <span className="font-semibold text-zinc-900 dark:text-white truncate max-w-[220px]" aria-current="page">
          {product.name}
        </span>
      </nav>

      {/* Unclaimed Product / Org Callout */}
      {(!product.verifiedOwner && (!company || !company.isClaimed)) && (
        <div className="mb-6 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <div>
              <span className="font-semibold text-zinc-900 dark:text-white">
                Unverified Product
              </span>
              <span className="text-zinc-600 dark:text-zinc-400 ml-1.5">
                {company 
                  ? `Claim ${company.name} to automatically verify and manage ${product.name} alongside the full suite.`
                  : `Claim the parent organization to manage ${product.name} and track roadmap updates.`}
              </span>
            </div>
          </div>
          {company && !company.isClaimed && onOpenCompany && (
            <button
              type="button"
              onClick={() => onOpenCompany(company)}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap self-end sm:self-auto shadow-xs"
            >
              Claim {company.name}
            </button>
          )}
        </div>
      )}

      {/* Admin Moderation Banner */}
      {userRole === 'admin' && (
        <div className="mb-6 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
            <div>
              <span className="font-semibold text-zinc-900 dark:text-white mr-1.5">
                Admin Controls
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                Manage verification and curation for this product listing
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => onToggleVerifyProduct && onToggleVerifyProduct(product.id)}
              className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 rounded-lg font-medium transition-colors cursor-pointer"
            >
              {product.verifiedOwner ? 'Revoke Verification' : 'Verify Team'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Are you sure you want to permanently delete "${product.name}" and remove it from Publisense?`)) {
                  onDeleteProduct && onDeleteProduct(product.id);
                }
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors cursor-pointer"
            >
              Delete Product
            </button>
          </div>
        </div>
      )}

      {/* Hero Product Card */}
      <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <img
              src={product.logo}
              alt={product.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-zinc-200 dark:border-zinc-700 shadow-sm flex-shrink-0"
            />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                  {product.name}
                </h1>

                {product.verifiedOwner && (
                  <span title="Verified" className="inline-flex items-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </span>
                )}

                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {product.category}
                </span>

                {company && onOpenCompany && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <button
                      type="button"
                      onClick={() => onOpenCompany(company)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:underline transition-colors cursor-pointer"
                    >
                      <Building2 className="w-3 h-3 text-zinc-400" />
                      <span>{company.name}</span>
                    </button>
                  </>
                )}
              </div>

              <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-xl">
                {product.description || product.tagline}
              </p>

              {/* Links & Sub-meta */}
              <div className="flex items-center gap-3 pt-1 text-xs text-zinc-400 flex-wrap">
                <a
                  href={product.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 transition-colors group/link"
                  title={`Visit ${product.name} website (${product.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')})`}
                >
                  <Globe className="w-3 h-3 text-zinc-400 group-hover/link:text-zinc-600 dark:group-hover/link:text-zinc-200" />
                  <span>{product.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                </a>

                {company && onOpenCompany && (
                  <>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => onOpenCompany(company)}
                      className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:underline transition-colors cursor-pointer group/comp font-medium"
                      title={`View ${company.name} Organisation Page`}
                    >
                      <Building2 className="w-3 h-3 text-zinc-400 group-hover/comp:text-zinc-600 dark:group-hover/comp:text-zinc-200" />
                      <span>{company.name}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Primary Action Buttons: Add feedback + Follow feature */}
          <div className="w-full sm:w-auto pt-2 sm:pt-0 flex-shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenSubmit(product.id)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add feedback</span>
            </button>

            <button
              type="button"
              onClick={handleToggleFollow}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer border ${
                activeFollowing
                  ? 'bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700'
                  : 'bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              {activeFollowing ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Following</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Follow</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Pipeline Cards Row (Open, Planned, In Progress, Shipped) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-center">
          {/* Open Card */}
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'open' || statusFilter === 'active' ? 'all' : 'open')}
            className={`p-3 rounded-xl transition-all cursor-pointer text-center group border ${
              statusFilter === 'open' || statusFilter === 'active'
                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-500 shadow-2xs ring-1 ring-zinc-400 dark:ring-zinc-500'
                : 'bg-zinc-50 dark:bg-zinc-850/60 border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
            title="Filter by Open status"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Open</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
              {openCount}
            </p>
          </button>

          {/* Planned Card */}
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'planned' ? 'all' : 'planned')}
            className={`p-3 rounded-xl transition-all cursor-pointer text-center group border ${
              statusFilter === 'planned'
                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-900 dark:border-white shadow-2xs ring-1 ring-zinc-900 dark:ring-white'
                : 'bg-zinc-50 dark:bg-zinc-850/60 border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
            title="Filter by Planned status"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Planned</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
              {plannedCount}
            </p>
          </button>

          {/* In Progress Card */}
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
            className={`p-3 rounded-xl transition-all cursor-pointer text-center group border ${
              statusFilter === 'in_progress'
                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-900 dark:border-white shadow-2xs ring-1 ring-zinc-900 dark:ring-white'
                : 'bg-zinc-50 dark:bg-zinc-850/60 border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
            title="Filter by In Progress status"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">In Progress</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
              {inProgressCount}
            </p>
          </button>

          {/* Shipped Card */}
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'shipped' ? 'all' : 'shipped')}
            className={`p-3 rounded-xl transition-all cursor-pointer text-center group border ${
              statusFilter === 'shipped'
                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-900 dark:border-white shadow-2xs ring-1 ring-zinc-900 dark:ring-white'
                : 'bg-zinc-50 dark:bg-zinc-850/60 border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
            title="Filter by Shipped status"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Shipped</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
              {shippedCount}
            </p>
          </button>
        </div>
      </div>

      {/* Filter and Sorting Controls Toolbar (matching homepage) */}
      <div className="relative z-30 flex items-center justify-between gap-2 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        {/* Left: Feedback Sorting items (Trending, Top, Newest) on the left end */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60 flex-shrink-0">
          {[
            { id: 'trending', label: 'Trending' },
            { id: 'top', label: 'Top' },
            { id: 'newest', label: 'Newest' },
          ].map((sortOption) => (
            <button
              key={sortOption.id}
              onClick={() => setSortBy(sortOption.id as any)}
              className={`px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-medium transition-all cursor-pointer ${
                sortBy === sortOption.id
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {sortOption.label}
            </button>
          ))}
        </div>

        {/* Right: Custom Modern Status & Category Dropdowns grouped on the opposite (right) end */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-shrink-0">
          <FilterDropdown
            label="Status"
            selectedValue={statusFilter}
            onSelect={setStatusFilter}
            options={[
              { id: 'all', label: 'All Statuses' },
              { id: 'open', label: 'Open' },
              { id: 'planned', label: 'Planned' },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'shipped', label: 'Shipped' },
            ]}
          />

          <FilterDropdown
            label="Type"
            selectedValue={categoryFilter}
            onSelect={setCategoryFilter}
            options={[
              { id: 'all', label: 'All Types' },
              { id: 'bug', label: 'Bugs' },
              { id: 'ux', label: 'UX / Usability' },
              { id: 'feature', label: 'Features' },
              { id: 'performance', label: 'Performance' },
            ]}
          />
        </div>
      </div>

      {/* Feedback List for this Product */}
      <div className="space-y-3">
        {displayedItems.length === 0 ? (
          <div className="py-16 text-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 space-y-3">
            <p>
              {statusFilter !== 'all' || categoryFilter !== 'all'
                ? 'No feedback items match your selected filters.'
                : 'No feedback items found for this product yet.'}
            </p>
            {(statusFilter !== 'all' || categoryFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setCategoryFilter('all');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 transition-colors cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          displayedItems.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              product={product}
              onVote={onVote}
              onOpenDetails={onOpenDetails}
              onOpenShare={onOpenShare}
              onOpenProfile={onOpenProfile}
            />
          ))
        )}
      </div>
    </div>
  );
};
