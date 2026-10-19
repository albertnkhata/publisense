import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FeedbackPost, FeedbackComment, PostRepost, PRODUCT_CATEGORIES, CommentKind } from '../types';
import { useStore } from '../context/StoreContext';
import { formatRelativeTime } from '../lib/time';

export type SignalKindFilter = 'ALL' | 'Wishlist' | 'Friction' | 'Praise';

export function getPostKindLabel(post: FeedbackPost): 'Wishlist' | 'Friction' | 'Praise' {
  if (post.tags?.includes('praise')) return 'Praise';
  if (post.type === 'feature') return 'Wishlist';
  return 'Friction';
}

export function getKindClass(kind: 'Wishlist' | 'Friction' | 'Praise'): string {
  if (kind === 'Friction') return 'kind-friction';
  if (kind === 'Praise') return 'kind-praise';
  return '';
}

interface SignalCardProps {
  post: FeedbackPost;
  defaultExpanded?: boolean;
  repostContext?: PostRepost;
}

export const SignalCard: React.FC<SignalCardProps> = ({ post, defaultExpanded = false }) => {
  const {
    comments,
    getProductById,
    getProfileById,
    hasUserVoted,
    hasUserReposted,
    hasUserLikedComment,
    toggleUpvote,
    toggleRepost,
    addComment,
    toggleCommentLike,
  } = useStore();

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [replyText, setReplyText] = useState('');
  const [replyKind, setReplyKind] = useState<CommentKind>('discussion');
  const [copied, setCopied] = useState(false);
  const replyInputRef = useRef<HTMLInputElement>(null);

  const product = getProductById(post.productId);
  const author = getProfileById(post.authorId);
  const voted = hasUserVoted(post.id);
  const meToo = hasUserReposted(post.id);

  const postComments = comments.filter((c) => c.postId === post.id);
  // Sort workarounds by highest likesCount so the top community workaround is automatically promoted
  const workaroundComments: FeedbackComment[] = postComments
    .filter((c) => c.kind === 'workaround')
    .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  const workaroundComment: FeedbackComment | undefined = workaroundComments[0];
  const officialComment: FeedbackComment | undefined = postComments.find(
    (c) => c.kind === 'official'
  );

  // Order thread comments: official first, then workarounds by votes, then discussion
  const sortedThreadComments = [...postComments].sort((a, b) => {
    const rank = (k: CommentKind) => (k === 'official' ? 0 : k === 'workaround' ? 1 : 2);
    if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
    if (a.kind === 'workaround' && b.kind === 'workaround') {
      return (b.likesCount || 0) - (a.likesCount || 0);
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const categoryMeta = PRODUCT_CATEGORIES.find((c) => c.id === product?.category);
  const categoryLabel = categoryMeta?.label || 'General';
  const kindLabel = getPostKindLabel(post);

  // Determine status badge appearance & label matching the mockup
  let statusBadgeClass = 'status-open';
  let statusLabel = 'Open';

  if (post.status === 'shipped') {
    statusBadgeClass = 'status-shipped';
    statusLabel = 'Shipped';
  } else if (workaroundComment) {
    statusBadgeClass = 'status-workaround';
    statusLabel = 'Has Workaround';
  } else if (post.status === 'planned' || post.status === 'in_progress' || post.upvoteCount >= 250) {
    statusBadgeClass = 'status-trending';
    statusLabel = post.status === 'in_progress' ? 'In Progress' : 'Trending';
  } else if (kindLabel === 'Praise') {
    statusBadgeClass = 'status-open';
    statusLabel = 'Craft Note';
  } else if (post.upvoteCount >= 150) {
    statusBadgeClass = 'status-open';
    statusLabel = 'High Signal';
  }

  // Determine highlighted callout block (Builder Note or Top Community Workaround)
  let calloutBlock: {
    kind: 'builder' | 'workaround';
    badge: string;
    handle: string;
    text: string;
    commentId?: string;
    likesCount?: number;
  } | null = null;

  if (post.officialNote) {
    calloutBlock = {
      kind: 'builder',
      badge: `Builder Note · ${product?.name || 'Team'}`,
      handle: post.officialUpdatedBy || `@${product?.slug || 'team'}`,
      text: post.officialNote,
    };
  } else if (officialComment) {
    const offAuthor = getProfileById(officialComment.authorId);
    calloutBlock = {
      kind: 'builder',
      badge: `Builder Note · ${product?.name || 'Team'}`,
      handle: offAuthor ? `@${offAuthor.handle}` : '@maintainer',
      text: officialComment.body,
      commentId: officialComment.id,
      likesCount: officialComment.likesCount,
    };
  } else if (workaroundComment) {
    const waAuthor = getProfileById(workaroundComment.authorId);
    calloutBlock = {
      kind: 'workaround',
      badge: 'Top Community Workaround',
      handle: waAuthor ? `@${waAuthor.handle}` : '@community',
      text: workaroundComment.body,
      commentId: workaroundComment.id,
      likesCount: workaroundComment.likesCount,
    };
  }

  const sameIssueCount = Math.max(post.repostCount || 0, Math.max(4, Math.round(post.upvoteCount * 0.08)));

  const handleOpenWorkaroundReply = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(true);
    setReplyKind('workaround');
    setTimeout(() => {
      replyInputRef.current?.focus();
    }, 40);
  };

  const handleToggleThread = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const handleCopyShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!replyText.trim()) return;
    await addComment(post.id, replyText.trim(), replyKind);
    setReplyText('');
    setReplyKind('discussion');
  };

  return (
    <article id={post.id} className={`signal-item ${isExpanded ? 'expanded' : ''}`}>
      <div className="signal-card-inner" onClick={() => handleToggleThread()}>
        {/* Top Header Row: Product / Category · Type on left, Status Badge alone on top-right */}
        <div className="card-header-bar">
          <div className="signal-meta-top" style={{ marginBottom: 0 }}>
            {product ? (
              <Link
                to={`/p/${product.slug}`}
                className="product-chip"
                onClick={(e) => e.stopPropagation()}
                title={`Open /p/${product.slug}`}
              >
                <span className="prod-micro-icon">{product.name[0]}</span>
                <span>{product.name}</span>
              </Link>
            ) : (
              <span className="product-chip">
                <span className="prod-micro-icon">P</span>
                <span>Product</span>
              </span>
            )}
            <span className="meta-sep">/</span>
            <span className="category-crumb mono">{categoryLabel}</span>
            <span className="meta-sep">·</span>
            <span className={`kind-badge ${getKindClass(kindLabel)} mono`}>{kindLabel}</span>
          </div>

          <span className={`status-badge ${statusBadgeClass} mono`}>
            <span className="status-dot"></span>
            {statusLabel}
          </span>
        </div>

        {/* Full-Width Signal Title & Excerpt */}
        <h3 className="signal-title">{post.title}</h3>
        <p className="signal-excerpt">{post.body}</p>

        {/* Highlighted Workaround or Builder Callout Block */}
        {calloutBlock && (
          <div
            className={`signal-callout ${
              calloutBlock.kind === 'builder' ? 'callout-builder' : 'callout-workaround'
            }`}
          >
            <div className="callout-header">
              <div className="callout-id">
                <span
                  className={`callout-badge ${
                    calloutBlock.kind === 'builder' ? 'badge-builder' : 'badge-workaround'
                  } mono`}
                >
                  {calloutBlock.badge}
                </span>
                {calloutBlock.handle.startsWith('@') ? (
                  <Link
                    to={`/u/${calloutBlock.handle.replace(/^@/, '')}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: 'var(--text-primary)', fontWeight: 500 }}
                  >
                    {calloutBlock.handle}
                  </Link>
                ) : (
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {calloutBlock.handle}
                  </strong>
                )}
                {calloutBlock.kind === 'workaround' && workaroundComments.length > 1 && (
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    · +{workaroundComments.length - 1} more in thread
                  </span>
                )}
              </div>

              {calloutBlock.commentId && (
                <button
                  type="button"
                  className={`comment-vote-pill ${
                    hasUserLikedComment(calloutBlock.commentId) ? 'liked' : ''
                  } mono`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCommentLike(calloutBlock!.commentId!);
                  }}
                  title="Upvote this workaround"
                >
                  <span>▲</span>
                  <span>{calloutBlock.likesCount || 0} Helpful</span>
                </button>
              )}
            </div>
            <div className="callout-copy">{calloutBlock.text}</div>
          </div>
        )}

        {/* Hairline Bottom Bar + Tactile Upvote Pill Bar */}
        <div className="card-bottom-bar">
          <div className="card-actions-left mono">
            <button
              type="button"
              className={`pill-vote-btn ${voted ? 'voted' : ''} mono`}
              onClick={(e) => {
                e.stopPropagation();
                toggleUpvote(post.id);
              }}
              title="Upvote signal"
            >
              <span>▲</span>
              <span>{post.upvoteCount}</span>
            </button>

            <button
              type="button"
              className="pill-action mono"
              onClick={(e) => handleToggleThread(e)}
            >
              <span>💬 {postComments.length} Replies</span>
            </button>

            <button
              type="button"
              className={`pill-action ${meToo ? 'active-me-too' : ''} mono`}
              onClick={(e) => {
                e.stopPropagation();
                toggleRepost(post.id);
              }}
            >
              <span>⚡ +{sameIssueCount + (meToo ? 1 : 0)} Same Issue</span>
            </button>

            <button
              type="button"
              className="pill-action mono"
              onClick={handleOpenWorkaroundReply}
            >
              <span>🛠 + Workaround</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="mono">
            <span className="signal-author">
              {author ? (
                <Link
                  to={`/u/${author.handle}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: 'var(--text-secondary)' }}
                  title={`View @${author.handle}'s contributor profile`}
                >
                  @{author.handle}
                </Link>
              ) : (
                '@member'
              )}{' '}
              · {formatRelativeTime(post.createdAt)}
            </span>
            <Link
              to={`/post/${post.id}`}
              className="action-btn mono"
              onClick={(e) => e.stopPropagation()}
              title="Open dedicated signal permalink"
            >
              <span>↗ Thread</span>
            </Link>
            <button type="button" className="action-btn mono" onClick={handleCopyShare}>
              <span>{copied ? '✓ Copied' : '🔗 Share'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Community Thread Drawer */}
      <div className="signal-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-comments">
          <div
            className="mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            <span>Community Thread ({postComments.length})</span>
            {workaroundComments.length > 0 && (
              <span style={{ color: 'var(--accent-indigo)' }}>
                Highest-voted workaround auto-pinned to card
              </span>
            )}
          </div>

          {sortedThreadComments.length === 0 ? (
            <div className="comment-row" style={{ color: 'var(--text-muted)' }}>
              No replies yet. Share a workaround or add context below.
            </div>
          ) : (
            sortedThreadComments.map((cmt) => {
              const cmtAuthor = getProfileById(cmt.authorId);
              const isPinnedWorkaround =
                cmt.kind === 'workaround' && workaroundComment?.id === cmt.id;
              const isLiked = hasUserLikedComment(cmt.id);
              return (
                <div
                  key={cmt.id}
                  className={`comment-row ${isPinnedWorkaround ? 'pinned-workaround-row' : ''}`}
                >
                  <div className="comment-row-body">
                    {cmtAuthor ? (
                      <Link
                        to={`/u/${cmtAuthor.handle}`}
                        style={{ color: 'var(--text-primary)', fontWeight: 500 }}
                      >
                        @{cmtAuthor.handle}
                      </Link>
                    ) : (
                      <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        @user
                      </strong>
                    )}
                    {cmt.kind === 'workaround' && (
                      <span
                        className="callout-badge badge-workaround mono"
                        style={{ marginLeft: '6px', marginRight: '4px' }}
                      >
                        {isPinnedWorkaround ? '★ Top Workaround' : 'Workaround'}
                      </span>
                    )}
                    {cmt.kind === 'official' && (
                      <span
                        className="callout-badge badge-builder mono"
                        style={{ marginLeft: '6px', marginRight: '4px' }}
                      >
                        Builder
                      </span>
                    )}
                    <span>: {cmt.body}</span>
                  </div>

                  <button
                    type="button"
                    className={`comment-vote-pill ${isLiked ? 'liked' : ''} mono`}
                    onClick={() => toggleCommentLike(cmt.id)}
                    title={
                      cmt.kind === 'workaround'
                        ? 'Upvote workaround (highest-voted is pinned to card)'
                        : 'Upvote reply'
                    }
                  >
                    <span>▲</span>
                    <span>{cmt.likesCount || 0}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <form className="reply-box" onSubmit={handleReplySubmit}>
          <button
            type="button"
            className={`filter-chip mono ${replyKind === 'workaround' ? 'active' : ''}`}
            onClick={() =>
              setReplyKind((prev) => (prev === 'workaround' ? 'discussion' : 'workaround'))
            }
            title="Toggle whether this reply is a Community Workaround"
            style={
              replyKind === 'workaround'
                ? {
                    color: 'var(--accent-indigo)',
                    borderColor: 'var(--accent-indigo-border)',
                    background: 'var(--accent-indigo-bg)',
                  }
                : undefined
            }
          >
            {replyKind === 'workaround' ? '🛠 Workaround' : '💬 Reply'}
          </button>

          <input
            ref={replyInputRef}
            type="text"
            className="reply-input"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={
              replyKind === 'workaround'
                ? `Share a community workaround for ${product?.name || 'this issue'}...`
                : `Share a workaround, +1 context, or reply to ${product?.name || 'thread'}...`
            }
          />
          <button type="submit" className="btn-ghost">
            Reply
          </button>
        </form>
      </div>
    </article>
  );
};
