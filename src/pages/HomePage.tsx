import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { PRODUCT_CATEGORIES, ProductCategory, FeedbackType } from '../types';
import { useStore } from '../context/StoreContext';
import { SignalCard, SignalKindFilter, getPostKindLabel } from '../components/SignalCard';
import { OPEN_COMPOSER_EVENT } from '../components/AppShell';

// Baseline telemetry counts so every product board feels alive like the mockup
const PRODUCT_TELEMETRY: Record<string, { baseSignals: number; velocity: string }> = {
  claude: { baseSignals: 64, velocity: '+67 ▲' },
  chatgpt: { baseSignals: 51, velocity: '+44 ▲' },
  perplexity: { baseSignals: 27, velocity: '+19 ▲' },
  cursor: { baseSignals: 92, velocity: '+84 ▲' },
  raycast: { baseSignals: 58, velocity: '+29 ▲' },
  supabase: { baseSignals: 48, velocity: '+31 ▲' },
  figma: { baseSignals: 74, velocity: '+52 ▲' },
  framer: { baseSignals: 31, velocity: '+18 ▲' },
  linear: { baseSignals: 63, velocity: '+41 ▲' },
  notion: { baseSignals: 53, velocity: '+24 ▲' },
  obsidian: { baseSignals: 39, velocity: '+22 ▲' },
  spotify: { baseSignals: 81, velocity: '+38 ▲' },
  arc: { baseSignals: 45, velocity: '+15 ▲' },
};

export const HomePage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const {
    products,
    posts,
    comments,
    getProductBySlug,
    createPost,
    isFollowingProduct,
    toggleFollowProduct,
    openCreateProductModal,
  } = useStore();

  const activeProduct = slug ? getProductBySlug(slug) : undefined;

  // Right Rail Accordion State
  const [openCategories, setOpenCategories] = useState<ProductCategory[]>([
    'ai_agents',
    'dev_tools',
  ]);

  // Feed Filter State
  const [activeTab, setActiveTab] = useState<'all' | 'workarounds' | 'shipped'>('all');
  const [activeKind, setActiveKind] = useState<SignalKindFilter>('ALL');
  const [feedCategoryFilter, setFeedCategoryFilter] = useState<ProductCategory | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'votes' | 'recent'>('votes');
  const [searchQuery, setSearchQuery] = useState('');

  // Central Omni-Bar Composer State
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerTitle, setComposerTitle] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [composerProductId, setComposerProductId] = useState<string>(
    activeProduct?.id || products[0]?.id || 'prod-claude'
  );
  const [composerKind, setComposerKind] = useState<'Wishlist' | 'Friction' | 'Praise'>('Wishlist');

  const omniInputRef = useRef<HTMLInputElement>(null);

  // Sync selected product into composer & ensure its category is open in the right rail
  useEffect(() => {
    if (activeProduct) {
      setComposerProductId(activeProduct.id);
      setOpenCategories((prev) =>
        prev.includes(activeProduct.category) ? prev : [...prev, activeProduct.category]
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeProduct]);

  // Listen for Topbar "+ Post Signal" button trigger
  useEffect(() => {
    const handler = () => {
      setIsComposerOpen(true);
      if (activeProduct) {
        setComposerProductId(activeProduct.id);
      }
      setTimeout(() => {
        omniInputRef.current?.focus();
      }, 20);
    };
    window.addEventListener(OPEN_COMPOSER_EVENT, handler);
    return () => window.removeEventListener(OPEN_COMPOSER_EVENT, handler);
  }, [activeProduct]);

  // Global keyboard shortcuts ('/' for Search, 'C' for Post Composer, 'Escape' to close)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !inInput) {
        e.preventDefault();
        setIsComposerOpen(false);
        omniInputRef.current?.focus();
      } else if ((e.key === 'c' || e.key === 'C') && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsComposerOpen(true);
        setTimeout(() => omniInputRef.current?.focus(), 20);
      } else if (e.key === 'Escape' && isComposerOpen) {
        setIsComposerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isComposerOpen]);

  const toggleCategoryAccordion = (catId: ProductCategory) => {
    setOpenCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  const hasWorkaround = (postId: string) =>
    comments.some((c) => c.postId === postId && c.kind === 'workaround');

  // Posts scoped to either the active /p/:slug product or the global index
  const scopedPosts = useMemo(() => {
    if (!activeProduct) return posts;
    return posts.filter((p) => p.productId === activeProduct.id);
  }, [posts, activeProduct]);

  // Filtered & sorted posts for the main feed
  const filteredPosts = useMemo(() => {
    return scopedPosts
      .filter((post) => {
        const prod = products.find((p) => p.id === post.productId);
        if (!activeProduct && feedCategoryFilter !== 'ALL' && prod?.category !== feedCategoryFilter) {
          return false;
        }
        const kindLabel = getPostKindLabel(post);
        if (activeKind !== 'ALL' && kindLabel !== activeKind) {
          return false;
        }
        if (activeTab === 'workarounds' && !hasWorkaround(post.id)) {
          return false;
        }
        if (activeTab === 'shipped' && post.status !== 'shipped') {
          return false;
        }
        if (!isComposerOpen && searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const catMeta = PRODUCT_CATEGORIES.find((c) => c.id === prod?.category);
          return (
            post.title.toLowerCase().includes(q) ||
            post.body.toLowerCase().includes(q) ||
            (prod?.name.toLowerCase().includes(q) ?? false) ||
            (catMeta?.label.toLowerCase().includes(q) ?? false)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'votes') {
          return b.upvoteCount - a.upvoteCount;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [
    scopedPosts,
    products,
    activeProduct,
    feedCategoryFilter,
    activeKind,
    activeTab,
    isComposerOpen,
    searchQuery,
    sortBy,
    comments,
  ]);

  const handleOmniSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComposerOpen) return;

    const title = composerTitle.trim();
    if (!title) {
      omniInputRef.current?.focus();
      return;
    }

    const mappedType: FeedbackType =
      composerKind === 'Wishlist' ? 'feature' : composerKind === 'Friction' ? 'bug' : 'ux';
    const tags =
      composerKind === 'Praise'
        ? ['praise']
        : composerKind === 'Wishlist'
        ? ['wishlist']
        : ['friction'];

    await createPost({
      productId: composerProductId,
      title,
      body:
        composerBody.trim() ||
        'Submitted via the Publisense open index. Upvote or add a workaround below.',
      type: mappedType,
      severity: composerKind === 'Friction' ? 'friction' : 'annoyance',
      tags,
    });

    setComposerTitle('');
    setComposerBody('');
    setIsComposerOpen(false);
  };

  const hasActiveFilter =
    feedCategoryFilter !== 'ALL' ||
    activeTab !== 'all' ||
    activeKind !== 'ALL' ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setFeedCategoryFilter('ALL');
    setActiveTab('all');
    setActiveKind('ALL');
    setSearchQuery('');
  };

  // Trending products list (top 5 matching mockup order)
  const trendingProductSlugs = ['cursor', 'claude', 'figma', 'linear', 'spotify'];
  const trendingProducts = trendingProductSlugs
    .map((s) => products.find((p) => p.slug === s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const getProductSignalCount = (productId: string, productSlug: string) => {
    const liveCount = posts.filter((p) => p.productId === productId).length;
    const base = PRODUCT_TELEMETRY[productSlug]?.baseSignals || 12;
    return Math.max(liveCount, base + liveCount - 1);
  };

  const getProductVelocity = (productSlug: string) => {
    return PRODUCT_TELEMETRY[productSlug]?.velocity || '+14 ▲';
  };

  const activeCategoryMeta = activeProduct
    ? PRODUCT_CATEGORIES.find((c) => c.id === activeProduct.category)
    : undefined;

  const composerTargetProduct =
    products.find((p) => p.id === composerProductId) || activeProduct || products[0];

  return (
    <>
      {/* 1A. HOME VIEW: FULL-WIDTH SYMMETRICAL HERO */}
      {!activeProduct && (
        <section className="central-command-zone" id="homeHeroZone">
          <div className="live-pill">
            <span className="pulse-dot"></span>
            <span className="mono">4,120+ community signals</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="mono">{products.length} products indexed by users</span>
          </div>

          <h1 className="hero-headline">
            Crowdsourced product sense, <span>in the open.</span>
          </h1>
          <p className="hero-subtitle">
            Discover real workflow friction, feature wishlists, and community workarounds across the
            software you use every day.
          </p>
        </section>
      )}

      {/* 1B. PRODUCT PAGE VIEW (/p/:slug): Dedicated Product Header when a Product is clicked */}
      {activeProduct && (
        <section className="product-page-hero active" id="productPageHero">
          <div className="p-hero-inner">
            <div className="p-breadcrumbs mono">
              <Link to="/" className="p-back-btn">
                ← Back to Index
              </Link>
              <span>/</span>
              <span>{activeCategoryMeta?.label || 'Directory'}</span>
              <span>/</span>
              <span style={{ color: 'var(--text-primary)' }}>/p/{activeProduct.slug}</span>
            </div>

            <div className="p-identity-row">
              <div className="p-identity-left">
                <div className="p-emblem">{activeProduct.name[0]}</div>
                <div>
                  <div className="p-title-row">
                    <h1 className="p-title">{activeProduct.name}</h1>
                    <span className="p-route-badge mono">
                      {activeCategoryMeta?.label || 'Product'}
                    </span>
                  </div>
                  <p className="p-desc">{activeProduct.tagline || activeProduct.description}</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-ghost mono"
                  onClick={() => toggleFollowProduct(activeProduct.id)}
                >
                  {isFollowingProduct(activeProduct.id) ? '✓ Following Board' : '+ Follow Board'}
                </button>
              </div>
            </div>

            <div className="p-stats-grid mono">
              <div className="p-stat-cell">
                <div className="p-stat-label">Total Signals</div>
                <div className="p-stat-val">
                  {getProductSignalCount(activeProduct.id, activeProduct.slug)}
                </div>
              </div>
              <div className="p-stat-cell">
                <div className="p-stat-label">7d Velocity</div>
                <div className="p-stat-val" style={{ color: 'var(--accent-emerald)' }}>
                  {getProductVelocity(activeProduct.slug)}
                </div>
              </div>
              <div className="p-stat-cell">
                <div className="p-stat-label">Community Workarounds</div>
                <div className="p-stat-val">
                  {Math.max(
                    scopedPosts.filter((p) => hasWorkaround(p.id)).length,
                    Math.round(getProductSignalCount(activeProduct.id, activeProduct.slug) * 0.28)
                  )}
                </div>
              </div>
              <div className="p-stat-cell">
                <div className="p-stat-label">Shipped / Resolved</div>
                <div className="p-stat-val">
                  {Math.max(
                    scopedPosts.filter((p) => p.status === 'shipped').length,
                    Math.round(getProductSignalCount(activeProduct.id, activeProduct.slug) * 0.16)
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SHARED WIDE CENTRAL COMMAND BAR (Adapts to Global Index or /p/:slug Product Page!) */}
      <section
        style={{
          padding: '0 32px 28px',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          justifyContent: 'center',
          background: 'var(--bg-canvas)',
        }}
        id="omnibarWrapperSection"
      >
        <div className="omnibar-container" style={{ marginTop: '-26px' }}>
          <form
            className={`omnibar ${isComposerOpen ? 'composer-open' : ''}`}
            onSubmit={handleOmniSubmit}
          >
            <div className="omnibar-main-row">
              <span
                className="omnibar-search-icon"
                style={{ color: isComposerOpen ? 'var(--accent-emerald)' : 'var(--text-muted)' }}
              >
                {isComposerOpen ? '✦' : '⌕'}
              </span>

              <input
                ref={omniInputRef}
                type="text"
                className="omnibar-input"
                value={isComposerOpen ? composerTitle : searchQuery}
                onChange={(e) => {
                  if (isComposerOpen) {
                    setComposerTitle(e.target.value);
                  } else {
                    setSearchQuery(e.target.value);
                  }
                }}
                placeholder={
                  isComposerOpen
                    ? `Write a concise signal headline for @${composerTargetProduct?.name || 'Product'}...`
                    : activeProduct
                    ? `Search @${activeProduct.name} signals — or press C to post to ${activeProduct.name}...`
                    : 'Search products, pain points, wishlists, or workarounds... (Press /)'
                }
                autoComplete="off"
              />

              {/* Clean Segmented Mode Switcher: Search vs Post */}
              <div className="omni-mode-switch">
                <button
                  type="button"
                  className={`omni-mode-btn ${!isComposerOpen ? 'active' : ''}`}
                  onClick={() => {
                    setIsComposerOpen(false);
                    omniInputRef.current?.focus();
                  }}
                >
                  <span>Search</span>
                  <span className="kbd">/</span>
                </button>
                <button
                  type="button"
                  className={`omni-mode-btn ${isComposerOpen ? 'active' : ''}`}
                  onClick={() => {
                    setIsComposerOpen(true);
                    setTimeout(() => omniInputRef.current?.focus(), 20);
                  }}
                >
                  <span>+ Post</span>
                  <span className="kbd">C</span>
                </button>
              </div>
            </div>

            {/* Expandable Inline Composer inside the Central Omni-Bar */}
            <div className="omnibar-composer">
              <textarea
                className="composer-textarea"
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    handleOmniSubmit(e);
                  }
                }}
                placeholder="Share details, why this matters, or a workaround you've found (uses the headline above as your title)..."
              />
              <div className="composer-controls-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Product:
                  </span>
                  <select
                    className="select-pill"
                    value={composerProductId}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        openCreateProductModal();
                        return;
                      }
                      setComposerProductId(e.target.value);
                    }}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        @{p.name}
                      </option>
                    ))}
                    <option value="__new__">+ Index a New Product...</option>
                  </select>

                  <div className="type-selector">
                    {(['Wishlist', 'Friction', 'Praise'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={`type-btn ${composerKind === kind ? 'active' : ''}`}
                        onClick={() => setComposerKind(kind)}
                      >
                        {kind}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setIsComposerOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    <span>Post Signal</span>
                    <span
                      className="kbd"
                      style={{
                        background: 'transparent',
                        color: 'inherit',
                        borderColor: 'rgba(128,128,128,0.3)',
                      }}
                    >
                      ↵
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* 2. BOARD WORKSPACE (Left = Feed + Dedicated Feed Filters | Right = Category -> Product Browser) */}
      <div className="board-workspace">
        {/* PRIMARY FEED COLUMN */}
        <main className="feed-column">
          {/* DEDICATED FILTER BAR ABOVE THE MAIN FEEDBACK FEED */}
          <div className="feed-filter-bar">
            {/* Row 1: Stream Tabs & Sort */}
            <div className="filter-row-top">
              <div className="stream-tabs">
                <button
                  type="button"
                  className={`stream-tab ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  <span>All Signals</span>
                  <span className="tab-count mono">{scopedPosts.length}</span>
                </button>
                <button
                  type="button"
                  className={`stream-tab ${activeTab === 'workarounds' ? 'active' : ''}`}
                  onClick={() => setActiveTab('workarounds')}
                >
                  <span style={{ color: 'var(--accent-indigo)' }}>◆</span>
                  <span>With Workarounds</span>
                  <span className="tab-count mono">
                    {scopedPosts.filter((p) => hasWorkaround(p.id)).length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`stream-tab ${activeTab === 'shipped' ? 'active' : ''}`}
                  onClick={() => setActiveTab('shipped')}
                >
                  <span style={{ color: 'var(--accent-emerald)' }}>●</span>
                  <span>Shipped / Resolved</span>
                  <span className="tab-count mono">
                    {scopedPosts.filter((p) => p.status === 'shipped').length}
                  </span>
                </button>
              </div>

              <div className="sort-group mono">
                <span>Sort:</span>
                <button
                  type="button"
                  className={`sort-btn ${sortBy === 'votes' ? 'active' : ''}`}
                  onClick={() => setSortBy('votes')}
                >
                  Top Upvoted
                </button>
                <span>·</span>
                <button
                  type="button"
                  className={`sort-btn ${sortBy === 'recent' ? 'active' : ''}`}
                  onClick={() => setSortBy('recent')}
                >
                  Newest
                </button>
              </div>
            </div>

            {/* Row 2: Signal Type Filter Chips & Category Filter Dropdown */}
            <div className="filter-row-bottom">
              <div className="type-filter-group">
                <span
                  className="mono"
                  style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginRight: '4px' }}
                >
                  Filter:
                </span>
                <button
                  type="button"
                  className={`filter-chip ${activeKind === 'ALL' ? 'active' : ''}`}
                  onClick={() => setActiveKind('ALL')}
                >
                  All Types
                </button>
                <button
                  type="button"
                  className={`filter-chip ${activeKind === 'Wishlist' ? 'active' : ''}`}
                  onClick={() => setActiveKind('Wishlist')}
                >
                  ✦ Wishlist
                </button>
                <button
                  type="button"
                  className={`filter-chip ${activeKind === 'Friction' ? 'active' : ''}`}
                  onClick={() => setActiveKind('Friction')}
                >
                  ⚡ Friction / Bug
                </button>
                <button
                  type="button"
                  className={`filter-chip ${activeKind === 'Praise' ? 'active' : ''}`}
                  onClick={() => setActiveKind('Praise')}
                >
                  ♥ Praise
                </button>
              </div>

              <div className="feed-right-controls">
                {!activeProduct && (
                  <select
                    className="feed-select mono"
                    value={feedCategoryFilter}
                    onChange={(e) =>
                      setFeedCategoryFilter(e.target.value as ProductCategory | 'ALL')
                    }
                    title="Filter feed by category"
                  >
                    <option value="ALL">Category: All</option>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                )}

                {hasActiveFilter && (
                  <button
                    type="button"
                    className="filter-chip mono"
                    onClick={resetFilters}
                    style={{ color: 'var(--accent-emerald)' }}
                  >
                    ✕ Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live Signal Stream */}
          <div className="signal-list">
            {filteredPosts.length === 0 ? (
              <div
                style={{
                  padding: '64px 32px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                }}
              >
                No signals match the active filters yet. Click{' '}
                <button
                  type="button"
                  className="kbd"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setIsComposerOpen(true);
                    setTimeout(() => omniInputRef.current?.focus(), 20);
                  }}
                >
                  + Post
                </button>{' '}
                above to share the first one!
              </div>
            ) : (
              filteredPosts.map((post, idx) => (
                <SignalCard key={post.id} post={post} defaultExpanded={idx === 0} />
              ))
            )}
          </div>
        </main>

        {/* RIGHT RAIL: Trending Products first, then Category -> Product Directory Browser */}
        <aside className="side-rail" id="directory">
          <div className="rail-header mono" id="trending">
            <span>Trending Products</span>
            <span>7d Velocity</span>
          </div>

          {/* 1. Trending Products This Week */}
          <div className="rail-section">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {trendingProducts.map((prod) => {
                const catMeta = PRODUCT_CATEGORIES.find((c) => c.id === prod.category);
                const isSelected = activeProduct?.id === prod.id;
                return (
                  <Link
                    key={prod.id}
                    to={isSelected ? '/' : `/p/${prod.slug}`}
                    className={`prod-select-btn ${isSelected ? 'selected' : ''}`}
                  >
                    <span className="prod-select-left">
                      <span className="mini-prod-badge">{prod.name[0]}</span>
                      <span>{prod.name}</span>
                      <span
                        className="mono"
                        style={{ fontSize: '10px', color: 'var(--text-muted)' }}
                      >
                        {catMeta?.label}
                      </span>
                    </span>
                    <span className="velocity-pill mono">{getProductVelocity(prod.slug)}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 2. Categories Accordion that expands to show Products inside that Category */}
          <div className="rail-section">
            <div className="rail-subhead mono">
              <span>Browse by Category</span>
              <span>Select Product</span>
            </div>
            <div className="cat-accordion">
              {PRODUCT_CATEGORIES.map((cat) => {
                const isOpen = openCategories.includes(cat.id);
                const catProducts = products.filter((p) => p.category === cat.id);
                return (
                  <div key={cat.id} className={`cat-group ${isOpen ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="cat-trigger"
                      onClick={() => toggleCategoryAccordion(cat.id)}
                    >
                      <span className="cat-trigger-left">
                        <span className="cat-chevron">▶</span>
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </span>
                      <span className="cat-meta mono">{catProducts.length} products</span>
                    </button>

                    <div className="cat-products">
                      {catProducts.map((prod) => {
                        const isSelected = activeProduct?.id === prod.id;
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            className={`prod-select-btn ${isSelected ? 'selected' : ''}`}
                            onClick={() => navigate(isSelected ? '/' : `/p/${prod.slug}`)}
                          >
                            <span className="prod-select-left">
                              <span className="mini-prod-badge">{prod.name[0]}</span>
                              <span>{prod.name}</span>
                            </span>
                            <span className="prod-sig-count mono">
                              {getProductSignalCount(prod.id, prod.slug)} signals
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Community-First Product Indexing Callout */}
          <div className="community-card">
            <div className="community-title">Don't see a product?</div>
            <p className="community-desc">
              Anyone can index a product. Post a signal and tag it to launch its community board.
            </p>
            <button
              type="button"
              className="btn-ghost"
              onClick={openCreateProductModal}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <span>+ Post to a New Product</span>
            </button>
          </div>
        </aside>
      </div>
    </>
  );
};
