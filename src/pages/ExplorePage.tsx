import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Layers,
  Building2,
  CheckCircle2,
  Plus,
  ArrowRight,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { PRODUCT_CATEGORIES, ProductCategory } from '../types';
import { useStore } from '../context/StoreContext';

export const ExplorePage: React.FC = () => {
  const {
    products,
    organizations,
    posts,
    getOrgById,
    isFollowingProduct,
    toggleFollowProduct,
    openCreateProductModal,
  } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = (searchParams.get('category') || 'all') as
    | ProductCategory
    | 'all';

  const [viewTab, setViewTab] = useState<'products' | 'organizations'>('products');
  const [filterText, setFilterText] = useState('');

  const filteredProducts = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return products
      .filter((p) => {
        if (activeCategory !== 'all' && p.category !== activeCategory) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.tagline.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.responsivenessRate - a.responsivenessRate);
  }, [products, activeCategory, filterText]);

  const filteredOrgs = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return organizations.filter((o) => {
      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        o.tagline.toLowerCase().includes(q)
      );
    });
  }, [organizations, filterText]);

  return (
    <div className="space-y-5">
      {/* Directory Header */}
      <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
            Products &amp; Organizations Directory
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Product-first feedback hubs organized by category and parent organization
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateProductModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-semibold shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Tabs & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 w-fit">
          <button
            type="button"
            onClick={() => setViewTab('products')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              viewTab === 'products'
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Products ({products.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('organizations')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              viewTab === 'organizations'
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Organizations ({organizations.length})</span>
          </button>
        </div>

        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={`Filter ${viewTab}...`}
          className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none w-full sm:w-64"
        />
      </div>

      {viewTab === 'products' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredProducts.map((prod) => {
            const org = getOrgById(prod.orgId);
            const prodPosts = posts.filter((p) => p.productId === prod.id);
            const shippedCount = prodPosts.filter((p) => p.status === 'shipped').length;
            const following = isFollowingProduct(prod.id);
            const catMeta = PRODUCT_CATEGORIES.find((c) => c.id === prod.category);

            return (
              <div
                key={prod.id}
                className="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-4 flex flex-col justify-between gap-4 transition-all shadow-2xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/p/${prod.slug}`}
                      className="flex items-center gap-3 group min-w-0"
                    >
                      <img
                        src={prod.logoUrl}
                        alt={prod.name}
                        className="w-10 h-10 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                            {prod.name}
                          </h3>
                          {prod.isVerified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                        </div>
                        {org && (
                          <Link
                            to={`/org/${org.slug}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                          >
                            by {org.name}
                          </Link>
                        )}
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => toggleFollowProduct(prod.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                        following
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold'
                      }`}
                    >
                      {following ? 'Following' : 'Follow'}
                    </button>
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
                    {prod.tagline}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                      {catMeta?.shortLabel || prod.category}
                    </span>
                    <span>{prodPosts.length} signals</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {shippedCount} shipped
                    </span>
                  </div>

                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {prod.responsivenessRate}% resp
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredOrgs.map((org) => {
            const orgProducts = products.filter((p) => p.orgId === org.id);
            const orgProductIds = new Set(orgProducts.map((p) => p.id));
            const orgPosts = posts.filter((post) => orgProductIds.has(post.productId));

            return (
              <div
                key={org.id}
                className="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 rounded-xl p-5 space-y-4 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <Link to={`/org/${org.slug}`} className="flex items-center gap-3 group">
                    <img
                      src={org.logoUrl}
                      alt={org.name}
                      className="w-11 h-11 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {org.name}
                        </h3>
                        {org.isVerified && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {org.tagline}
                      </p>
                    </div>
                  </Link>

                  <Link
                    to={`/org/${org.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                  >
                    <span>View Org Suite ({orgPosts.length} signals)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Grouped Products under this Org */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
                  {orgProducts.map((p) => (
                    <Link
                      key={p.id}
                      to={`/p/${p.slug}`}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 hover:bg-zinc-100/80 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/60 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={p.logoUrl}
                          alt={p.name}
                          className="w-5 h-5 rounded-md object-cover shrink-0"
                        />
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {p.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                        {p.responsivenessRate}%
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
