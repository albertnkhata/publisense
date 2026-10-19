import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PRODUCT_CATEGORIES } from '../types';
import { useStore } from '../context/StoreContext';
import { SignalCard } from '../components/SignalCard';
import { formatRelativeTime } from '../lib/time';

export const ProfilePage: React.FC = () => {
  const { handle = '' } = useParams<{ handle: string }>();
  const {
    products,
    posts,
    votes,
    reposts,
    comments,
    follows,
    currentUser,
    getProfileByHandle,
    getOrgById,
    isFollowingUser,
    toggleFollowUser,
    updateCurrentProfile,
  } = useStore();

  const profile = getProfileByHandle(handle);
  const isMe = Boolean(currentUser && profile && currentUser.id === profile.id);
  const managedOrg = profile?.managedOrgId ? getOrgById(profile.managedOrgId) : undefined;

  const [activeTab, setActiveTab] = useState<'signals' | 'workarounds' | 'upvoted'>('signals');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile?.name || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editLocation, setEditLocation] = useState(profile?.location || '');
  const [editRoleTitle, setEditRoleTitle] = useState(profile?.roleTitle || '');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [handle]);

  const submittedPosts = useMemo(() => {
    if (!profile) return [];
    return posts
      .filter((p) => p.authorId === profile.id)
      .sort((a, b) => b.upvoteCount - a.upvoteCount);
  }, [posts, profile]);

  const userWorkarounds = useMemo(() => {
    if (!profile) return [];
    return comments
      .filter((c) => c.authorId === profile.id && c.kind === 'workaround')
      .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  }, [comments, profile]);

  const workaroundPosts = useMemo(() => {
    const postIds = new Set(userWorkarounds.map((c) => c.postId));
    return posts.filter((p) => postIds.has(p.id));
  }, [userWorkarounds, posts]);

  const upvotedPosts = useMemo(() => {
    if (!profile) return [];
    const votedIds = new Set([
      ...votes.filter((v) => v.userId === profile.id).map((v) => v.postId),
      ...reposts.filter((r) => r.userId === profile.id).map((r) => r.postId),
    ]);
    return posts.filter((p) => votedIds.has(p.id));
  }, [votes, reposts, posts, profile]);

  const totalImpactVotes = useMemo(() => {
    const postVotesSum = submittedPosts.reduce((acc, p) => acc + p.upvoteCount, 0);
    const workaroundVotesSum = userWorkarounds.reduce((acc, c) => acc + (c.likesCount || 0), 0);
    return postVotesSum + workaroundVotesSum;
  }, [submittedPosts, userWorkarounds]);

  // Distinct products this contributor has signaled, written workarounds for, or backed
  const backedProducts = useMemo(() => {
    if (!profile) return [];
    const prodCounts = new Map<string, number>();

    for (const p of submittedPosts) {
      prodCounts.set(p.productId, (prodCounts.get(p.productId) || 0) + 2);
    }
    for (const p of workaroundPosts) {
      prodCounts.set(p.productId, (prodCounts.get(p.productId) || 0) + 2);
    }
    for (const p of upvotedPosts) {
      prodCounts.set(p.productId, (prodCounts.get(p.productId) || 0) + 1);
    }

    return Array.from(prodCounts.entries())
      .map(([prodId, count]) => ({
        product: products.find((pr) => pr.id === prodId),
        count,
      }))
      .filter((item): item is { product: NonNullable<typeof item.product>; count: number } =>
        Boolean(item.product)
      )
      .sort((a, b) => b.count - a.count);
  }, [profile, submittedPosts, workaroundPosts, upvotedPosts, products]);

  const followersCount = useMemo(() => {
    if (!profile) return 0;
    return follows.filter((f) => f.targetType === 'user' && f.targetId === profile.id).length;
  }, [follows, profile]);

  const followingUsersCount = useMemo(() => {
    if (!profile) return 0;
    return follows.filter((f) => f.followerId === profile.id && f.targetType === 'user').length;
  }, [follows, profile]);

  if (!profile) {
    return (
      <section className="central-command-zone">
        <div className="live-pill mono">404 · Contributor Not Found</div>
        <h1 className="hero-headline" style={{ fontSize: '26px' }}>
          No contributor profile found for @{handle.replace(/^@/, '')}
        </h1>
        <p className="hero-subtitle" style={{ marginBottom: '16px' }}>
          Explore the open index to discover community contributors and product boards.
        </p>
        <Link to="/" className="btn-primary mono">
          ← Back to Open Index
        </Link>
      </section>
    );
  }

  const following = isFollowingUser(profile.id);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateCurrentProfile({
      name: editName.trim() || profile.name,
      bio: editBio.trim(),
      location: editLocation.trim() || undefined,
      roleTitle: editRoleTitle.trim() || undefined,
    });
    setIsEditing(false);
  };

  return (
    <>
      {/* 1. CONTRIBUTOR PORTFOLIO HERO */}
      <section className="product-page-hero active">
        <div className="p-hero-inner">
          <div className="p-breadcrumbs mono">
            <Link to="/" className="p-back-btn">
              ← Back to Index
            </Link>
            <span>/</span>
            <span>Contributors</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>/u/{profile.handle}</span>
          </div>

          <div className="p-identity-row">
            <div className="p-identity-left">
              <div className="p-emblem">{profile.name[0]}</div>
              <div>
                <div className="p-title-row">
                  <h1 className="p-title">{profile.name}</h1>
                  <span className="p-route-badge mono">@{profile.handle}</span>
                  {profile.roleTitle && (
                    <span
                      className="callout-badge badge-builder mono"
                      style={{ textTransform: 'none', fontSize: '11px', padding: '2px 7px' }}
                    >
                      {profile.roleTitle}
                    </span>
                  )}
                </div>
                <p className="p-desc">{profile.bio}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isMe ? (
                <button
                  type="button"
                  className="btn-ghost mono"
                  onClick={() => {
                    setEditName(profile.name);
                    setEditBio(profile.bio);
                    setEditLocation(profile.location || '');
                    setEditRoleTitle(profile.roleTitle || '');
                    setIsEditing((prev) => !prev);
                  }}
                >
                  {isEditing ? '✕ Cancel Edit' : '✎ Edit Portfolio'}
                </button>
              ) : (
                <button
                  type="button"
                  className={following ? 'btn-ghost mono' : 'btn-primary mono'}
                  onClick={() => toggleFollowUser(profile.id)}
                >
                  {following ? '✓ Following Contributor' : '+ Follow Contributor'}
                </button>
              )}
            </div>
          </div>

          {/* Inline Edit Profile Drawer */}
          {isMe && isEditing && (
            <form
              onSubmit={handleSaveProfile}
              style={{
                marginBottom: '18px',
                padding: '16px 18px',
                borderRadius: '8px',
                border: '1px solid var(--border-focus)',
                background: 'var(--bg-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div className="mono" style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                Update Contributor Portfolio
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <input
                  type="text"
                  className="select-pill"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Display Name"
                  required
                />
                <input
                  type="text"
                  className="select-pill"
                  value={editRoleTitle}
                  onChange={(e) => setEditRoleTitle(e.target.value)}
                  placeholder="Role / Headline (e.g. Staff Engineer)"
                />
                <input
                  type="text"
                  className="select-pill"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Location (e.g. San Francisco, CA)"
                />
              </div>
              <textarea
                className="composer-textarea"
                style={{ minHeight: '54px', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-hairline)', background: 'var(--bg-canvas)' }}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Short bio describing the tools you build with and care about..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="submit" className="btn-primary mono">
                  Save Portfolio ↵
                </button>
              </div>
            </form>
          )}

          {/* 4-Column Product Sense Telemetry Grid */}
          <div className="p-stats-grid mono">
            <div className="p-stat-cell">
              <div className="p-stat-label">Signals Logged</div>
              <div className="p-stat-val">{submittedPosts.length}</div>
            </div>
            <div className="p-stat-cell">
              <div className="p-stat-label">Workarounds Authored</div>
              <div className="p-stat-val" style={{ color: 'var(--accent-indigo)' }}>
                {userWorkarounds.length}
              </div>
            </div>
            <div className="p-stat-cell">
              <div className="p-stat-label">Community Impact</div>
              <div className="p-stat-val" style={{ color: 'var(--accent-emerald)' }}>
                ▲ {totalImpactVotes}
              </div>
            </div>
            <div className="p-stat-cell">
              <div className="p-stat-label">Products Backed</div>
              <div className="p-stat-val">{backedProducts.length}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. BOARD WORKSPACE */}
      <div className="board-workspace">
        <main className="feed-column">
          <div className="feed-filter-bar">
            <div className="filter-row-top">
              <div className="stream-tabs">
                <button
                  type="button"
                  className={`stream-tab ${activeTab === 'signals' ? 'active' : ''}`}
                  onClick={() => setActiveTab('signals')}
                >
                  <span>Logged Signals</span>
                  <span className="tab-count mono">{submittedPosts.length}</span>
                </button>
                <button
                  type="button"
                  className={`stream-tab ${activeTab === 'workarounds' ? 'active' : ''}`}
                  onClick={() => setActiveTab('workarounds')}
                >
                  <span style={{ color: 'var(--accent-indigo)' }}>◆</span>
                  <span>Authored Workarounds</span>
                  <span className="tab-count mono">{userWorkarounds.length}</span>
                </button>
                <button
                  type="button"
                  className={`stream-tab ${activeTab === 'upvoted' ? 'active' : ''}`}
                  onClick={() => setActiveTab('upvoted')}
                >
                  <span style={{ color: 'var(--accent-emerald)' }}>▲</span>
                  <span>Upvoted & Backed</span>
                  <span className="tab-count mono">{upvotedPosts.length}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="signal-list">
            {activeTab === 'signals' &&
              (submittedPosts.length === 0 ? (
                <div style={{ padding: '56px 28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  @{profile.handle} hasn't logged any standalone signals yet.
                </div>
              ) : (
                submittedPosts.map((post, idx) => (
                  <SignalCard key={post.id} post={post} defaultExpanded={idx === 0} />
                ))
              ))}

            {activeTab === 'workarounds' &&
              (workaroundPosts.length === 0 ? (
                <div style={{ padding: '56px 28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  @{profile.handle} hasn't shared any community workarounds yet.
                </div>
              ) : (
                workaroundPosts.map((post) => (
                  <SignalCard key={post.id} post={post} defaultExpanded={true} />
                ))
              ))}

            {activeTab === 'upvoted' &&
              (upvotedPosts.length === 0 ? (
                <div style={{ padding: '56px 28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  @{profile.handle} hasn't backed any signals yet.
                </div>
              ) : (
                upvotedPosts.map((post) => (
                  <SignalCard key={post.id} post={post} defaultExpanded={false} />
                ))
              ))}
          </div>
        </main>

        {/* RIGHT RAIL: Backed Products & Contributor Standing */}
        <aside className="side-rail">
          <div className="rail-header mono">
            <span>Products Backed</span>
            <span>Activity</span>
          </div>

          <div className="rail-section">
            {backedProducts.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>
                No products backed yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {backedProducts.map(({ product: prod, count }) => {
                  const catMeta = PRODUCT_CATEGORIES.find((c) => c.id === prod.category);
                  return (
                    <Link
                      key={prod.id}
                      to={`/p/${prod.slug}`}
                      className="prod-select-btn"
                    >
                      <span className="prod-select-left">
                        <span className="mini-prod-badge">{prod.name[0]}</span>
                        <span>{prod.name}</span>
                        <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {catMeta?.label}
                        </span>
                      </span>
                      <span className="velocity-pill mono">+{count} ▲</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rail-section">
            <div className="rail-subhead mono">
              <span>Contributor Telemetry</span>
              <span>@{profile.handle}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              {managedOrg && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Verified Team</span>
                  <span className="mono" style={{ color: 'var(--accent-emerald)' }}>
                    {managedOrg.name}
                  </span>
                </div>
              )}
              {profile.location && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Location</span>
                  <span className="mono">{profile.location}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Followers</span>
                <span className="mono">{followersCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Following</span>
                <span className="mono">{followingUsersCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Joined</span>
                <span className="mono">{formatRelativeTime(profile.joinedAt)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};
