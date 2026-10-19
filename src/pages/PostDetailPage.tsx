import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronUp,
  Repeat2,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Trash2,
  Send,
  Wrench,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  FeedbackStatus,
  CommentKind,
} from '../types';
import { useStore } from '../context/StoreContext';
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
    hasUserVoted,
    hasUserReposted,
    canManageProduct,
    toggleUpvote,
    toggleRepost,
    addComment,
    deleteComment,
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

  const [commentBody, setCommentBody] = useState('');
  const [commentKind, setCommentKind] = useState<CommentKind>('discussion');

  // Official Status Triage State
  const isMaintainer = post ? canManageProduct(post.productId) : false;
  const [selectedStatus, setSelectedStatus] = useState<FeedbackStatus>(
    post?.status || 'open'
  );
  const [officialNote, setOfficialNote] = useState(post?.officialNote || '');
  const [statusSavedMsg, setStatusSavedMsg] = useState(false);

  if (!post) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center space-y-2">
        <h2 className="text-base font-bold">Signal not found</h2>
        <Link to="/" className="text-xs text-emerald-600 hover:underline">
          Back to feed →
        </Link>
      </div>
    );
  }

  const voted = hasUserVoted(post.id);
  const reposted = hasUserReposted(post.id);
  const statusMeta =
    FEEDBACK_STATUSES.find((s) => s.id === post.status) || FEEDBACK_STATUSES[0];
  const typeMeta =
    FEEDBACK_TYPES.find((t) => t.id === post.type) || FEEDBACK_TYPES[0];
  const canDeletePost =
    currentUser && (currentUser.id === post.authorId || currentUser.role === 'admin');

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    await addComment(post.id, commentBody, commentKind);
    setCommentBody('');
  };

  const handleSaveOfficialStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePostStatus(post.id, selectedStatus, officialNote);
    setStatusSavedMsg(true);
    setTimeout(() => setStatusSavedMsg(false), 2500);
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-zinc-500 flex-wrap">
        <Link to="/" className="hover:text-zinc-900 dark:hover:text-white">
          Feed
        </Link>
        {product && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            <Link
              to={`/p/${product.slug}`}
              className="hover:text-zinc-900 dark:hover:text-white font-medium"
            >
              {product.name}
            </Link>
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-xs">
          {post.title}
        </span>
      </nav>

      {/* Main Signal Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {product && (
              <Link
                to={`/p/${product.slug}`}
                className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                <img
                  src={product.logoUrl}
                  alt={product.name}
                  className="w-4 h-4 rounded-md object-cover"
                />
                <span>{product.name}</span>
                {product.isVerified && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
              </Link>
            )}
            {org && (
              <Link
                to={`/org/${org.slug}`}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                by {org.name}
              </Link>
            )}
            <span>•</span>
            <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
              {typeMeta.label}
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 capitalize">
              Severity: {post.severity}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusMeta.badgeClass}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotColor}`} />
            {statusMeta.label}
          </span>
        </div>

        <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white leading-snug">
          {post.title}
        </h1>

        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
          {post.body}
        </p>

        {post.tags && post.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {post.tags.map((t) => (
              <span
                key={t}
                className="text-xs font-mono text-zinc-400 bg-zinc-50 dark:bg-zinc-800/60 px-2 py-0.5 rounded"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Official Update Callout */}
        {post.officialNote && (
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                Official Update from {post.officialUpdatedBy || `${product?.name} Team`}
              </span>
              {post.officialUpdatedAt && (
                <span className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
                  {formatRelativeTime(post.officialUpdatedAt)}
                </span>
              )}
            </div>
            <p className="text-zinc-700 dark:text-zinc-200 leading-relaxed">
              {post.officialNote}
            </p>
          </div>
        )}

        {/* Action Bar */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleUpvote(post.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                voted
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950'
                  : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
              }`}
            >
              <ChevronUp className="w-4 h-4 stroke-[2.5]" />
              <span>Upvote ({post.upvoteCount})</span>
            </button>

            <button
              type="button"
              onClick={() => toggleRepost(post.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                reposted
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <Repeat2 className="w-4 h-4" />
              <span>{reposted ? 'Boosted' : 'Boost'} ({post.repostCount})</span>
            </button>

            {canDeletePost && (
              <button
                type="button"
                onClick={async () => {
                  await deletePost(post.id);
                  navigate('/');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                title="Delete signal"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>

          {author && (
            <Link
              to={`/u/${author.handle}`}
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <img
                src={author.avatarUrl}
                alt={author.name}
                className="w-5 h-5 rounded-full object-cover"
              />
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {author.name}
              </span>
              <span className="font-mono text-[11px] text-zinc-400">@{author.handle}</span>
              <span>•</span>
              <span>{formatRelativeTime(post.createdAt)}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Maintainer / Admin Status Update Panel */}
      {isMaintainer && (
        <form
          onSubmit={handleSaveOfficialStatus}
          className="bg-white dark:bg-zinc-900 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl p-4 sm:p-5 space-y-3 text-xs shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Maintainer Triage Controls ({product?.name})
            </span>
            {statusSavedMsg && (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ✓ Status updated!
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as FeedbackStatus)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              >
                {FEEDBACK_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Official Team Note
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={officialNote}
                  onChange={(e) => setOfficialNote(e.target.value)}
                  placeholder="Share roadmap context, release version, or resolution note..."
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shrink-0 cursor-pointer"
                >
                  Save Update
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Comments & Workarounds Section */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 text-xs shadow-2xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-zinc-400" />
            <span>Discussion &amp; Community Workarounds ({postComments.length})</span>
          </h2>
        </div>

        {/* Add Comment Form */}
        <form onSubmit={handleCommentSubmit} className="space-y-2.5">
          <textarea
            rows={2}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Share a workaround, reproduction detail, or thought..."
            className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400">Comment type:</span>
              {(
                [
                  { id: 'discussion', label: 'Discussion' },
                  { id: 'workaround', label: 'Workaround / Fix' },
                  ...(isMaintainer
                    ? [{ id: 'official', label: 'Official Response' }]
                    : []),
                ] as { id: CommentKind; label: string }[]
              ).map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setCommentKind(k.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                    commentKind === k.id
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={!commentBody.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Reply</span>
            </button>
          </div>
        </form>

        {/* Comments List */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 pt-2">
          {postComments.length === 0 ? (
            <p className="py-6 text-center text-zinc-400">
              No comments yet. Be the first to share a workaround or thought.
            </p>
          ) : (
            postComments.map((c) => {
              const cAuthor = getProfileById(c.authorId);
              const canDelete =
                currentUser &&
                (currentUser.id === c.authorId || currentUser.role === 'admin');

              return (
                <div key={c.id} className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {cAuthor && (
                        <Link
                          to={`/u/${cAuthor.handle}`}
                          className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100 hover:underline"
                        >
                          <img
                            src={cAuthor.avatarUrl}
                            alt={cAuthor.name}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                          <span>{cAuthor.name}</span>
                          <span className="font-mono text-[11px] text-zinc-400 font-normal">
                            @{cAuthor.handle}
                          </span>
                        </Link>
                      )}

                      {c.kind === 'workaround' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-[10px] font-semibold">
                          <Wrench className="w-3 h-3" />
                          Community Workaround
                        </span>
                      )}

                      {c.kind === 'official' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-[10px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Official Team
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span>{formatRelativeTime(c.createdAt)}</span>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          className="text-zinc-400 hover:text-rose-500 cursor-pointer"
                          title="Delete comment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed pl-6">
                    {c.body}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
