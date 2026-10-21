import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { PRODUCT_CATEGORIES, ProductCategory, FeedbackType } from '../types';
import { useStore } from '../context/StoreContext';
import { claimEmailPlaceholder } from '../lib/claimEmail';
import { SignalCard, SignalKindFilter, getPostKindLabel } from '../components/SignalCard';
import { OPEN_COMPOSER_EVENT } from '../components/AppShell';

// Baseline telemetry counts so every product board starts with realistic momentum and reacts to live 7d activity
const PRODUCT_TELEMETRY: Record<string, { baseSignals: number; baseVelocity7d: number }> = {
  claude: { baseSignals: 64, baseVelocity7d: 67 },
  chatgpt: { baseSignals: 51, baseVelocity7d: 44 },
  perplexity: { baseSignals: 27, baseVelocity7d: 19 },
  cursor: { baseSignals: 92, baseVelocity7d: 84 },
  raycast: { baseSignals: 58, baseVelocity7d: 29 },
  supabase: { baseSignals: 48, baseVelocity7d: 31 },
  figma: { baseSignals: 74, baseVelocity7d: 52 },
  framer: { baseSignals: 31, baseVelocity7d: 18 },
  linear: { baseSignals: 63, baseVelocity7d: 41 },
  notion: { baseSignals: 53, baseVelocity7d: 24 },
  obsidian: { baseSignals: 39, baseVelocity7d: 22 },
  spotify: { baseSignals: 81, baseVelocity7d: 38 },
  arc: { baseSignals: 45, baseVelocity7d: 15 },
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'when',
  'into',
  'from',
  'that',
  'this',
  'does',
  'not',
  'cant',
  'should',
  'allow',
  'please',
  'add',
  'support',
]);

export const HomePage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const {
    organizations,
    products,
    posts,
    comments,
    votes,
    reposts,
    currentUser,
    getProductBySlug,
    hasUserVoted,
    hasUserReposted,
    toggleUpvote,
    toggleRepost,
    createPost,
    createProduct,
    claimProductBoard,
    canManageProduct,
    isFollowingProduct,
    toggleFollowProduct,
    openAuthModal,
  } = useStore();

  const activeProduct = slug ? getProductBySlug(slug) : undefined;
  const isManagingActiveProduct = activeProduct ? canManageProduct(activeProduct.id) : false;

  // Phase 3.1: Domain-Verified Board Claiming state
  const [isClaimDrawerOpen, setIsClaimDrawerOpen] = useState(false);
  const [claimEmail, setClaimEmail] = useState('');
  const [claimRoleTitle, setClaimRoleTitle] = useState('');
  const [claimMethod, setClaimMethod] = useState<'email_domain' | 'dns_txt'>('email_domain');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);

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

  // Phase 1.1: Instant Inline New Product Indexing inside Omni-Bar
  const [isInlineNewProduct, setIsInlineNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<ProductCategory>('ai_agents');

  const omniInputRef = useRef<HTMLInputElement>(null);
  const newProductInputRef = useRef<HTMLInputElement>(null);

  // Sync selected product into composer & ensure its category is open in the right rail
  useEffect(() => {
    if (activeProduct) {
      setComposerProductId(activeProduct.id);
      setIsInlineNewProduct(false);
      setIsClaimDrawerOpen(false);
      setClaimSuccess(false);
      setClaimError(null);
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

    if (!currentUser) {
      openAuthModal('Sign in to publish your signal.');
      return;
    }

    const title = composerTitle.trim();
    if (!title) {
      omniInputRef.current?.focus();
      return;
    }

    let targetProdId = composerProductId;
    let newlyCreatedSlug: string | null = null;

    if (isInlineNewProduct) {
      const cleanProdName = newProductName.trim().replace(/^@/, '');
      if (!cleanProdName) {
        newProductInputRef.current?.focus();
        return;
      }
      const existingMatch = products.find(
        (p) => p.name.toLowerCase() === cleanProdName.toLowerCase()
      );
      if (existingMatch) {
        targetProdId = existingMatch.id;
        newlyCreatedSlug = existingMatch.slug;
      } else {
        const slugGenerated = cleanProdName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const communityOrg =
          organizations.find((o) => o.slug === 'community-index') || organizations[0];
        const createdProd = await createProduct({
          name: cleanProdName,
          slug: slugGenerated || `prod-${Date.now().toString(36)}`,
          orgId: communityOrg?.id || 'org-community',
          category: newProductCategory,
          tagline: `Community feedback & product board for ${cleanProdName}`,
          description: `Community-indexed product board for ${cleanProdName}. Report friction, vote on wishlists, and share workarounds.`,
          websiteUrl: `https://${slugGenerated}.com`,
        });
        targetProdId = createdProd.id;
        newlyCreatedSlug = createdProd.slug;
      }
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
      productId: targetProdId,
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
    setNewProductName('');
    setIsInlineNewProduct(false);
    setIsComposerOpen(false);

    if (newlyCreatedSlug) {
      navigate(`/p/${newlyCreatedSlug}`);
    }
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

  // Phase 1.4: Real-Time 7d Velocity Calculation across posts, votes, reposts & workarounds
  const productMetricsMap = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const map: Record<
      string,
      { totalSignals: number; velocityScore: number; velocityLabel: string }
    > = {};

    for (const prod of products) {
      const prodPosts = posts.filter((p) => p.productId === prod.id);
      const prodPostIds = new Set(prodPosts.map((p) => p.id));

      // Count 7-day events
      const recentPostsCount = prodPosts.filter(
        (p) => new Date(p.createdAt).getTime() >= sevenDaysAgo
      ).length;
      const recentVotesCount = votes.filter(
        (v) => prodPostIds.has(v.postId) && new Date(v.createdAt).getTime() >= sevenDaysAgo
      ).length;
      const recentRepostsCount = reposts.filter(
        (r) => prodPostIds.has(r.postId) && new Date(r.createdAt).getTime() >= sevenDaysAgo
      ).length;
      const prodComments = comments.filter((c) => prodPostIds.has(c.postId));
      const recentWorkaroundsCount = prodComments.filter(
        (c) => c.kind === 'workaround' && new Date(c.createdAt).getTime() >= sevenDaysAgo
      ).length;
      const recentDiscussionsCount = prodComments.filter(
        (c) => c.kind !== 'workaround' && new Date(c.createdAt).getTime() >= sevenDaysAgo
      ).length;
      const workaroundUpvotes = prodComments.reduce((acc, c) => acc + (c.likesCount || 0), 0);

      const baseMeta = PRODUCT_TELEMETRY[prod.slug];
      const baseSignals = baseMeta?.baseSignals ?? 1;
      const totalSignals = baseMeta
        ? Math.max(prodPosts.length, baseSignals + Math.max(0, prodPosts.length - 1))
        : Math.max(1, prodPosts.length);

      const live7dDelta =
        recentPostsCount * 3 +
        recentVotesCount * 2 +
        recentRepostsCount * 2 +
        recentWorkaroundsCount * 3 +
        recentDiscussionsCount * 1 +
        Math.round(workaroundUpvotes * 0.25);

      const velocityScore = baseMeta
        ? Math.max(1, baseMeta.baseVelocity7d + live7dDelta - 3)
        : Math.max(4, live7dDelta + prodPosts.reduce((s, p) => s + p.upvoteCount, 0));

      map[prod.id] = {
        totalSignals,
        velocityScore,
        velocityLabel: `+${velocityScore} ▲`,
      };
    }

    return map;
  }, [products, posts, votes, reposts, comments]);

  const getProductSignalCount = (productId: string, productSlug: string) => {
    return (
      productMetricsMap[productId]?.totalSignals ??
      PRODUCT_TELEMETRY[productSlug]?.baseSignals ??
      1
    );
  };

  const getProductVelocity = (productSlug: string) => {
    const prod = products.find((p) => p.slug === productSlug);
    if (prod && productMetricsMap[prod.id]) {
      return productMetricsMap[prod.id].velocityLabel;
    }
    const base = PRODUCT_TELEMETRY[productSlug]?.baseVelocity7d || 14;
    return `+${base} ▲`;
  };

  // Top 5 Trending Products sorted dynamically by live 7d velocity score
  const trendingProducts = useMemo(() => {
    return [...products]
      .sort(
        (a, b) =>
          (productMetricsMap[b.id]?.velocityScore || 0) -
          (productMetricsMap[a.id]?.velocityScore || 0)
      )
      .slice(0, 5);
  }, [products, productMetricsMap]);

  const activeCategoryMeta = activeProduct
    ? PRODUCT_CATEGORIES.find((c) => c.id === activeProduct.category)
    : undefined;

  const composerTargetProduct =
    products.find((p) => p.id === composerProductId) || activeProduct || products[0];

  // Phase 1.3: Live Duplicate Detection inside Omni-Bar when typing a signal headline
  const duplicateMatches = useMemo(() => {
    if (!isComposerOpen) return [];
    const q = composerTitle.trim().toLowerCase();
    if (q.length < 3) return [];

    const tokens = q
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

    const scored = posts
      .map((post) => {
        const titleLower = post.title.toLowerCase();
        const bodyLower = post.body.toLowerCase();
        let score = 0;

        if (titleLower.includes(q)) {
          score += 6;
        } else if (bodyLower.includes(q)) {
          score += 3;
        }

        for (const token of tokens) {
          if (titleLower.includes(token)) score += 3;
          else if (bodyLower.includes(token)) score += 1;
        }

        // Boost matches on the currently selected product when there is text overlap
        if (!isInlineNewProduct && post.productId === composerProductId && score > 0) {
          score += 2;
        }

        return { post, score };
      })
      .filter((item) => item.score >= 3)
      .sort((a, b) => b.score - a.score || b.post.upvoteCount - a.post.upvoteCount)
      .slice(0, 3);

    return scored.map((item) => item.post);
  }, [isComposerOpen, composerTitle, posts, isInlineNewProduct, composerProductId]);

  const handleJumpToExistingSignal = (postId: string) => {
    setIsComposerOpen(false);
    setTimeout(() => {
      const el = document.getElementById(postId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 40);
  };

  return (
    <>
      {/* 1A. HOME VIEW: FULL-WIDTH SYMMETRICAL HERO */}
      {!activeProduct && (
        <section className="central-command-zone" id="homeHeroZone">
          <img
            className="hero-brand-mark"
            src="/brand/publisense-icon-white-on-indigo.svg"
            alt="Publisense"
            width={56}
            height={56}
          />
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
                    {activeProduct.isVerified && (
                      <span
                        className="callout-badge badge-builder mono"
                        style={{ textTransform: 'none', fontSize: '11px', padding: '2px 7px' }}
                        title="Verified Product Team on Publisense"
                      >
                        ✓ Verified Team
                      </span>
                    )}
                    {isManagingActiveProduct && (
                      <span
                        className="callout-badge badge-workaround mono"
                        style={{ textTransform: 'none', fontSize: '11px', padding: '2px 7px' }}
                      >
                        ⚙ Maintainer Access
                      </span>
                    )}
                  </div>
                  <p className="p-desc">{activeProduct.tagline || activeProduct.description}</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {!isManagingActiveProduct && (
                  <button
                    type="button"
                    className="btn-ghost mono"
                    style={{
                      color: 'var(--accent-emerald)',
                      borderColor: 'var(--accent-emerald-border)',
                      background: isClaimDrawerOpen ? 'var(--accent-emerald-bg)' : undefined,
                    }}
                    onClick={() => {
                      if (!currentUser) {
                        openAuthModal(`Sign in to claim and verify the ${activeProduct.name} board.`);
                        return;
                      }
                      const defaultDomain = (() => {
                        try {
                          return new URL(activeProduct.websiteUrl).hostname.replace(/^www\./, '');
                        } catch {
                          return `${activeProduct.slug}.com`;
                        }
                      })();
                      if (!claimEmail) {
                        setClaimEmail(`${currentUser.handle}@${defaultDomain}`);
                      }
                      setIsClaimDrawerOpen((prev) => !prev);
                    }}
                  >
                    ⚡ Claim Board
                  </button>
                )}

                <button
                  type="button"
                  className="btn-ghost mono"
                  onClick={() => toggleFollowProduct(activeProduct.id)}
                >
                  {isFollowingProduct(activeProduct.id) ? '✓ Following Board' : '+ Follow Board'}
                </button>
              </div>
            </div>

            {/* Phase 3.1: Domain-Verified Board Claiming Drawer */}
            {isClaimDrawerOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setClaimError(null);
                  const res = await claimProductBoard(activeProduct.id, {
                    workEmail: claimEmail,
                    roleTitle: claimRoleTitle || `${activeProduct.name} Product Team`,
                    verificationMethod: claimMethod,
                  });
                  if (res.error) {
                    setClaimError(res.error);
                  } else {
                    setClaimSuccess(true);
                    setTimeout(() => {
                      setIsClaimDrawerOpen(false);
                    }, 1200);
                  }
                }}
                style={{
                  marginBottom: '18px',
                  padding: '16px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--accent-emerald-border)',
                  background: 'var(--bg-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⚡ Claim /p/{activeProduct.slug} · Domain Verification
                  </div>
                  <div className="type-selector">
                    <button
                      type="button"
                      className={`type-btn ${claimMethod === 'email_domain' ? 'active' : ''}`}
                      onClick={() => setClaimMethod('email_domain')}
                    >
                      Work Email Domain
                    </button>
                    <button
                      type="button"
                      className={`type-btn ${claimMethod === 'dns_txt' ? 'active' : ''}`}
                      onClick={() => setClaimMethod('dns_txt')}
                    >
                      DNS TXT Record
                    </button>
                  </div>
                </div>

                {claimMethod === 'dns_txt' && (
                  <div
                    className="mono"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-hairline)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Add TXT record on <strong>{activeProduct.websiteUrl.replace(/^https?:\/\//, '')}</strong>:{' '}
                    <code style={{ color: 'var(--accent-emerald)' }}>
                      publisense-verify={activeProduct.slug}-{activeProduct.id.slice(-4)}
                    </code>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <input
                    type="email"
                    required
                    className="select-pill mono"
                    value={claimEmail}
                    onChange={(e) => setClaimEmail(e.target.value)}
                    placeholder={claimEmailPlaceholder(activeProduct)}
                  />
                  <input
                    type="text"
                    className="select-pill"
                    value={claimRoleTitle}
                    onChange={(e) => setClaimRoleTitle(e.target.value)}
                    placeholder={`Role Title (e.g. ${activeProduct.name} Maintainer)`}
                  />
                </div>

                {claimError && (
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--accent-rose)' }}>
                    {claimError}
                  </div>
                )}
                {claimSuccess && (
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--accent-emerald)' }}>
                    ✓ Board claimed & verified! Inline Maintainer Triage Controls (`⚙ Triage`) are now unlocked below.
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Unlocks inline status triage (`Planned`, `In Progress`, `Shipped`) & official emerald Builder Notes.
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-ghost mono"
                      onClick={() => setIsClaimDrawerOpen(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary mono">
                      Verify & Claim Board ↵
                    </button>
                  </div>
                </div>
              </form>
            )}

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
                    ? `Write a concise signal headline for @${
                        isInlineNewProduct
                          ? newProductName.trim() || 'NewProduct'
                          : composerTargetProduct?.name || 'Product'
                      }...`
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
              {/* Phase 1.3: Live Duplicate Detection Tray */}
              {duplicateMatches.length > 0 && (
                <div className="composer-duplicates-tray">
                  <div className="duplicates-tray-header mono">
                    <span>⚡ Similar Existing Signals Found</span>
                    <span>Back an existing thread instead of duplicating</span>
                  </div>
                  <div className="duplicates-tray-list">
                    {duplicateMatches.map((dup) => {
                      const dupProd = products.find((p) => p.id === dup.productId);
                      const isVoted = hasUserVoted(dup.id);
                      const isMeToo = hasUserReposted(dup.id);
                      return (
                        <div key={dup.id} className="duplicate-match-row">
                          <div
                            className="duplicate-match-info"
                            onClick={() => handleJumpToExistingSignal(dup.id)}
                            title="Jump to this signal in the feed"
                          >
                            {dupProd && (
                              <span className="product-chip" style={{ padding: '1px 6px' }}>
                                <span className="prod-micro-icon">{dupProd.name[0]}</span>
                                <span>{dupProd.name}</span>
                              </span>
                            )}
                            <span className="duplicate-match-title">{dup.title}</span>
                          </div>
                          <div className="duplicate-match-actions mono">
                            <button
                              type="button"
                              className={`pill-vote-btn ${isVoted ? 'voted' : ''} mono`}
                              style={{ padding: '2px 8px', fontSize: '10.5px' }}
                              onClick={() => toggleUpvote(dup.id)}
                            >
                              <span>▲</span>
                              <span>{dup.upvoteCount}</span>
                            </button>
                            <button
                              type="button"
                              className={`pill-action ${isMeToo ? 'active-me-too' : ''} mono`}
                              style={{ padding: '2px 8px', fontSize: '10.5px' }}
                              onClick={() => toggleRepost(dup.id)}
                            >
                              <span>{isMeToo ? '⚡ +1 Backed' : '⚡ +1 Same Issue'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  {!isInlineNewProduct ? (
                    <select
                      className="select-pill"
                      value={composerProductId}
                      onChange={(e) => {
                        if (e.target.value === '__inline_new__') {
                          setIsInlineNewProduct(true);
                          setTimeout(() => newProductInputRef.current?.focus(), 20);
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
                      <option value="__inline_new__">+ Index a New Product...</option>
                    </select>
                  ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <input
                        ref={newProductInputRef}
                        type="text"
                        className="select-pill mono"
                        style={{ width: '135px' }}
                        placeholder="@Product name..."
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                      />
                      <select
                        className="select-pill mono"
                        value={newProductCategory}
                        onChange={(e) => setNewProductCategory(e.target.value as ProductCategory)}
                      >
                        {PRODUCT_CATEGORIES.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="action-btn mono"
                        onClick={() => setIsInlineNewProduct(false)}
                        title="Pick existing product instead"
                      >
                        ✕
                      </button>
                    </div>
                  )}

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
                    onClick={() => {
                      setIsInlineNewProduct(false);
                      setIsComposerOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    <span>{isInlineNewProduct ? 'Index & Post Signal' : 'Post Signal'}</span>
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

          {/* Phase 3.3: Changelog & "Shipped" Rollup Banner when Shipped tab is active */}
          {activeTab === 'shipped' && (
            <div
              style={{
                padding: '16px 28px',
                borderBottom: '1px solid var(--border-hairline)',
                background: 'var(--accent-emerald-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  className="mono"
                  style={{
                    fontSize: '10.5px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--accent-emerald)',
                    marginBottom: '3px',
                  }}
                >
                  ● Official Shipped Rollup & Community Changelog
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {activeProduct
                    ? `Community requests resolved & shipped by ${activeProduct.name}`
                    : 'Community-requested features and friction points resolved across indexed products'}
                </div>
              </div>

              <div
                className="mono"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '18px',
                  fontSize: '11.5px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Responsiveness: </span>
                  <strong style={{ color: 'var(--accent-emerald)' }}>
                    {activeProduct ? `${activeProduct.responsivenessRate}%` : '91%'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Avg Triage: </span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {activeProduct?.avgResponseTime || '< 18h'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Votes Closed: </span>
                  <strong style={{ color: 'var(--accent-emerald)' }}>
                    ▲{' '}
                    {scopedPosts
                      .filter((p) => p.status === 'shipped')
                      .reduce((acc, p) => acc + p.upvoteCount, 0)}
                  </strong>
                </div>
              </div>
            </div>
          )}

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
              onClick={() => {
                setIsComposerOpen(true);
                setIsInlineNewProduct(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => newProductInputRef.current?.focus(), 60);
              }}
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
