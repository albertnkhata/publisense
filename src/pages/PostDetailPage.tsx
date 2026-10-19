import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FEEDBACK_STATUSES,
  PRODUCT_CATEGORIES,
  FeedbackStatus,
} from '../types';
import { useStore } from '../context/StoreContext';
import { SignalCard, getPostKindLabel } from '../components/SignalCard';
import { formatRelativeTime } from '../lib/time';

export const PostDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    posts,
    comments,
    currentUser,
    getProductById,
    getOrgById,
    getProfileById,
    canManageProduct,
    isFollowingProduct,
    toggleFollowProduct,
    updatePostStatus,
    deletePost,
  } = useStore();

  const post = useMemo(() => posts.find((p) => p.id === id), [posts, id]);
  const product = post ? getProductById(post.productId) : undefined;
  const org = product ? getOrgById(product.orgId) : undefined;
  const author = post ? getProfileById(post.authorId) : undefined;

  const postComments = useMemo(
    () => comments.filter((c) => c.postId === id),
    [comments, id]
  );

  const workaroundCount = useMemo(
    () => postComments.filter((c) => c.kind === 'workaround').length,
    [postComments]
  );

  const relatedPosts = useMemo(() => {
    if (!post) return [];
    return posts
      .filter((p) => p.productId === post.productId && p.id !== post.id)
      .sort((a, b) => b.upvoteCount - a.upvoteCount)
      .slice(0, 4);
  }, [posts, post]);

  // Maintainer Status Triage State
  const isMaintainer = post ? canManageProduct(post.productId) : false;
  const [selectedStatus, setSelectedStatus] = useState<FeedbackStatus>(
    post?.status || 'open'
  );
  const [officialNote, setOfficialNote] = useState(post?.officialNote || '');
  const [statusSavedMsg, setStatusSavedMsg] = useState(false);
  const [copiedPermalink, setCopiedPermalink] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [id]);

  useEffect(() => {
    if (post) {
      setSelectedStatus(post.status);
      setOfficialNote(post.officialNote || '');
    }
  }, [post]);

  if (!post) {
    return (
      <section className="central-command-zone">
        <div className="live-pill mono">404 · Signal Not Found</div>
        <h1 className="hero-headline" style={{ fontSize: '26px' }}>
          This signal permalink doesn't exist or was removed.
        </h1>
        <p className="hero-subtitle" style={{ marginBottom: '16px' }}>
          Return to the global index to browse active product boards and community workarounds.
        </p>
        <Link to="/" className="btn-primary mono">
          ← Back to Open Index
        </Link>
      </section>
    );
  }

  const categoryMeta = PRODUCT_CATEGORIES.find((c) => c.id === product?.category);
  const kindLabel = getPostKindLabel(post);
  const canDeletePost = Boolean(
    currentUser && (currentUser.id === post.authorId || currentUser.role === 'admin')
  );

  const handleSaveOfficialStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePostStatus(post.id, selectedStatus, officialNote);
    setStatusSavedMsg(true);
    setTimeout(() => setStatusSavedMsg(false), 2400);
  };

  const handleCopyPermalink = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedPermalink(true);
    setTimeout(() => setCopiedPermalink(false), 1500);
  };

  return (
    <>
      {/* TOP PERMALINK BREADCRUMB HERO */}
      <section className="product-page-hero active">
        <div className="p-hero-inner" style={{ paddingBottom: '20px' }}>
          <div className="p-breadcrumbs mono" style={{ marginBottom: 0 }}>
            <Link to="/" className="p-back-btn">
              ← Open Index
            </Link>
            <span>/</span>
            {product && (
              <>
                <Link to={`/p/${product.slug}`} className="p-back-btn">
                  /p/{product.slug}
                </Link>
                <span>/</span>
              </>
            )}
            <span style={{ color: 'var(--text-primary)' }}>Signal Permalink</span>
          </div>
        </div>
      </section>

      {/* WORKSPACE: Left = Focused Thread + Related Signals | Right = Product & Signal Telemetry */}
      <div className="board-workspace">
        <main className="feed-column">
          <div className="feed-filter-bar">
            <div className="filter-row-top" style={{ padding: '10px 24px' }}>
              <div
                className="mono"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ color: 'var(--accent-emerald)' }}>●</span>
                <span>Focused Signal Permalink</span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span>{kindLabel}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-ghost mono"
                  onClick={handleCopyPermalink}
                >
                  {copiedPermalink ? '✓ Link Copied' : '🔗 Copy Permalink'}
                </button>
                {canDeletePost && (
                  <button
                    type="button"
                    className="btn-ghost mono"
                    style={{ color: 'var(--accent-rose)' }}
                    onClick={async () => {
                      await deletePost(post.id);
                      navigate(product ? `/p/${product.slug}` : '/');
                    }}
                  >
                    ✕ Delete
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Primary Signal Card (Expanded by Default) */}
          <div className="signal-list">
            <SignalCard post={post} defaultExpanded={true} />
          </div>

          {/* Maintainer / Builder Official Triage Controls */}
          {isMaintainer && (
            <div
              style={{
                padding: '20px 28px',
                borderTop: '1px solid var(--border-hairline)',
                background: 'var(--bg-elevated)',
              }}
            >
              <form onSubmit={handleSaveOfficialStatus} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ✓ Verified Maintainer Triage · {product?.name}
                  </div>
                  {statusSavedMsg && (
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--accent-emerald)' }}>
                      ✓ Builder Note & Status Published
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <label className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Signal Status:
                  </label>
                  <select
                    className="select-pill mono"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as FeedbackStatus)}
                  >
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  className="composer-textarea"
                  style={{ minHeight: '64px', background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-hairline)' }}
                  value={officialNote}
                  onChange={(e) => setOfficialNote(e.target.value)}
                  placeholder={`Write an official Builder Note from the ${product?.name || 'Product'} team...`}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn-primary mono">
                    Save Official Update
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Related Signals on this Product Board */}
          {relatedPosts.length > 0 && (
            <>
              <div
                className="mono"
                style={{
                  padding: '12px 28px',
                  borderTop: '1px solid var(--border-hairline)',
                  borderBottom: '1px solid var(--border-hairline)',
                  background: 'var(--bg-elevated)',
                  fontSize: '10.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>More Signals on @{product?.name}</span>
                {product && (
                  <Link to={`/p/${product.slug}`} style={{ color: 'var(--text-secondary)' }}>
                    View All →
                  </Link>
                )}
              </div>
              <div className="signal-list">
                {relatedPosts.map((rel) => (
                  <SignalCard key={rel.id} post={rel} defaultExpanded={false} />
                ))}
              </div>
            </>
          )}
        </main>

        {/* RIGHT RAIL: Product Board Context & Signal Metadata */}
        <aside className="side-rail">
          <div className="rail-header mono">
            <span>Product Board</span>
            <span>{categoryMeta?.label || 'Directory'}</span>
          </div>

          {product && (
            <div className="rail-section" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="p-emblem" style={{ width: '36px', height: '36px', fontSize: '15px' }}>
                  {product.name[0]}
                </div>
                <div>
                  <Link
                    to={`/p/${product.slug}`}
                    style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}
                  >
                    {product.name}
                  </Link>
                  {org && (
                    <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      by {org.name}
                    </div>
                  )}
                </div>
              </div>

              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {product.tagline || product.description}
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Link
                  to={`/p/${product.slug}`}
                  className="btn-primary mono"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Open /p/{product.slug}
                </Link>
                <button
                  type="button"
                  className="btn-ghost mono"
                  onClick={() => toggleFollowProduct(product.id)}
                >
                  {isFollowingProduct(product.id) ? '✓ Following' : '+ Follow'}
                </button>
              </div>
            </div>
          )}

          <div className="rail-section">
            <div className="rail-subhead mono">
              <span>Signal Telemetry</span>
              <span>#{post.id.slice(0, 8)}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Logged by</span>
                {author ? (
                  <Link to={`/u/${author.handle}`} className="mono" style={{ color: 'var(--text-primary)' }}>
                    @{author.handle}
                  </Link>
                ) : (
                  <span className="mono">@member</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Submitted</span>
                <span className="mono">{formatRelativeTime(post.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Upvotes</span>
                <span className="mono" style={{ color: 'var(--text-primary)' }}>
                  ▲ {post.upvoteCount}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Community Workarounds</span>
                <span className="mono" style={{ color: 'var(--accent-indigo)' }}>
                  {workaroundCount}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Thread Replies</span>
                <span className="mono">{postComments.length}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};
