import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  Globe,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { SignalCard } from '../components/SignalCard';

export const OrgPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const { getOrgBySlug, products, posts } = useStore();
  const [selectedProdId, setSelectedProdId] = useState<string>('all');

  const org = getOrgBySlug(slug);

  const orgProducts = useMemo(() => {
    if (!org) return [];
    return products.filter((p) => p.orgId === org.id);
  }, [products, org]);

  const orgPosts = useMemo(() => {
    const prodIds = new Set(orgProducts.map((p) => p.id));
    return posts.filter((post) => {
      if (!prodIds.has(post.productId)) return false;
      if (selectedProdId !== 'all' && post.productId !== selectedProdId) return false;
      return true;
    });
  }, [posts, orgProducts, selectedProdId]);

  if (!org) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center space-y-2">
        <h2 className="text-base font-bold">Organization not found</h2>
        <Link to="/explore" className="text-xs text-emerald-600 hover:underline">
          Return to directory →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Link to="/explore" className="hover:text-zinc-900 dark:hover:text-white">
          Organizations
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
        <span className="font-semibold text-zinc-900 dark:text-white">{org.name}</span>
      </nav>

      {/* Org Hero */}
      <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <img
              src={org.logoUrl}
              alt={org.name}
              className="w-14 h-14 rounded-2xl object-cover border border-zinc-200 dark:border-zinc-700"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
                  {org.name}
                </h1>
                {org.isVerified && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
                {org.tagline}
              </p>
              <a
                href={org.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 mt-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{org.websiteUrl.replace(/^https?:\/\//, '')}</span>
              </a>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <span className="block text-[10px] uppercase font-mono text-zinc-400">
                Products
              </span>
              <span className="font-bold text-sm">{orgProducts.length}</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <span className="block text-[10px] uppercase font-mono text-zinc-400">
                Total Signals
              </span>
              <span className="font-bold text-sm">{orgPosts.length}</span>
            </div>
          </div>
        </div>

        {/* Products Suite Grid */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Products by {org.name}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {orgProducts.map((p) => (
              <Link
                key={p.id}
                to={`/p/${p.slug}`}
                className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/70 transition-all flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={p.logoUrl}
                    alt={p.name}
                    className="w-7 h-7 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">{p.tagline}</div>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {p.responsivenessRate}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Pills for Org Signals */}
      <div className="flex items-center gap-1.5 text-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedProdId('all')}
          className={`px-3 py-1 rounded-lg font-medium cursor-pointer ${
            selectedProdId === 'all'
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800'
          }`}
        >
          All {org.name} Products
        </button>
        {orgProducts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedProdId(p.id)}
            className={`px-3 py-1 rounded-lg font-medium cursor-pointer ${
              selectedProdId === p.id
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Signals List */}
      <div className="space-y-3">
        {orgPosts.map((post) => (
          <SignalCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
};
