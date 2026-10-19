import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Edit3,
  Check,
  Building2,
  Repeat2,
  ChevronUp,
  MessageSquare,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { SignalCard } from '../components/SignalCard';
import { formatRelativeTime } from '../lib/time';

export const ProfilePage: React.FC = () => {
  const { handle = '' } = useParams<{ handle: string }>();
  const {
    getProfileByHandle,
    getOrgById,
    posts,
    votes,
    reposts,
    comments,
    follows,
    currentUser,
    isFollowingUser,
    toggleFollowUser,
    updateCurrentProfile,
  } = useStore();

  const profile = getProfileByHandle(handle);
  const isMe = Boolean(currentUser && profile && currentUser.id === profile.id);
  const managedOrg = profile?.managedOrgId ? getOrgById(profile.managedOrgId) : undefined;

  const [activeTab, setActiveTab] = useState<'signals' | 'boosts' | 'upvoted' | 'comments'>('signals');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile?.name || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editLocation, setEditLocation] = useState(profile?.location || '');
  const [editRoleTitle, setEditRoleTitle] = useState(profile?.roleTitle || '');

  const submittedPosts = useMemo(() => {
    if (!profile) return [];
    return posts.filter((p) => p.authorId === profile.id);
  }, [posts, profile]);

  const boostedPosts = useMemo(() => {
    if (!profile) return [];
    const userReposts = reposts.filter((r) => r.userId === profile.id);
    return userReposts
      .map((r) => {
        const post = posts.find((p) => p.id === r.postId);
        return post ? { post, repost: r } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [reposts, posts, profile]);

  const upvotedPosts = useMemo(() => {
    if (!profile) return [];
    const votedPostIds = new Set(
      votes.filter((v) => v.userId === profile.id).map((v) => v.postId)
    );
    return posts.filter((p) => votedPostIds.has(p.id));
  }, [votes, posts, profile]);

  const userComments = useMemo(() => {
    if (!profile) return [];
    return comments.filter((c) => c.authorId === profile.id);
  }, [comments, profile]);

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
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center space-y-2">
        <h2 className="text-base font-bold">Builder profile not found</h2>
        <Link to="/" className="text-xs text-emerald-600 hover:underline">
          Back to feed →
        </Link>
      </div>
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
    <div className="space-y-5">
      {/* Profile Header Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-700 shrink-0"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
                  {profile.name}
                </h1>
                <span className="text-xs font-mono text-zinc-400">@{profile.handle}</span>
                {profile.roleTitle && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                    {profile.roleTitle}
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-xl leading-relaxed">
                {profile.bio}
              </p>

              <div className="flex items-center gap-4 pt-1 text-xs text-zinc-400 flex-wrap">
                {managedOrg && (
                  <Link
                    to={`/org/${managedOrg.slug}`}
                    className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-300 hover:underline font-medium"
                  >
                    <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{managedOrg.name}</span>
                  </Link>
                )}
                {profile.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{profile.location}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Joined {formatRelativeTime(profile.joinedAt)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isMe ? (
              <button
                type="button"
                onClick={() => {
                  setEditName(profile.name);
                  setEditBio(profile.bio);
                  setEditLocation(profile.location || '');
                  setEditRoleTitle(profile.roleTitle || '');
                  setIsEditing((prev) => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Cancel' : 'Edit Profile'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toggleFollowUser(profile.id)}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  following
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                    : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950'
                }`}
              >
                {following ? 'Following' : 'Follow Builder'}
              </button>
            )}
          </div>
        </div>

        {/* Inline Edit Profile Form (Relational: updates reflect across all posts/comments automatically!) */}
        {isMe && isEditing && (
          <form
            onSubmit={handleSaveProfile}
            className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-3 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Role / Headline
                </label>
                <input
                  type="text"
                  value={editRoleTitle}
                  onChange={(e) => setEditRoleTitle(e.target.value)}
                  placeholder="e.g. Full-Stack Engineer"
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Bio
              </label>
              <textarea
                rows={2}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        )}

        {/* Social Stats Row */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-6 text-xs">
          <div>
            <span className="font-bold text-zinc-900 dark:text-white">
              {submittedPosts.length}
            </span>{' '}
            <span className="text-zinc-500">Signals</span>
          </div>
          <div>
            <span className="font-bold text-zinc-900 dark:text-white">
              {boostedPosts.length}
            </span>{' '}
            <span className="text-zinc-500">Boosts</span>
          </div>
          <div>
            <span className="font-bold text-zinc-900 dark:text-white">
              {followersCount}
            </span>{' '}
            <span className="text-zinc-500">Followers</span>
          </div>
          <div>
            <span className="font-bold text-zinc-900 dark:text-white">
              {followingUsersCount}
            </span>{' '}
            <span className="text-zinc-500">Following</span>
          </div>
        </div>
      </div>

      {/* Activity Tabs */}
      <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs w-fit">
        {(
          [
            { id: 'signals', label: `Signals (${submittedPosts.length})` },
            { id: 'boosts', label: `Boosted (${boostedPosts.length})` },
            { id: 'upvoted', label: `Upvoted (${upvotedPosts.length})` },
            { id: 'comments', label: `Comments (${userComments.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              activeTab === t.id
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-3">
        {activeTab === 'signals' &&
          (submittedPosts.length === 0 ? (
            <p className="text-xs text-zinc-400 py-8 text-center">
              No signals posted yet.
            </p>
          ) : (
            submittedPosts.map((post) => <SignalCard key={post.id} post={post} />)
          ))}

        {activeTab === 'boosts' &&
          (boostedPosts.length === 0 ? (
            <p className="text-xs text-zinc-400 py-8 text-center">
              No boosted signals yet.
            </p>
          ) : (
            boostedPosts.map(({ post, repost }) => (
              <SignalCard key={post.id} post={post} repostContext={repost} />
            ))
          ))}

        {activeTab === 'upvoted' &&
          (upvotedPosts.length === 0 ? (
            <p className="text-xs text-zinc-400 py-8 text-center">
              No upvoted signals yet.
            </p>
          ) : (
            upvotedPosts.map((post) => <SignalCard key={post.id} post={post} />)
          ))}

        {activeTab === 'comments' &&
          (userComments.length === 0 ? (
            <p className="text-xs text-zinc-400 py-8 text-center">
              No comments posted yet.
            </p>
          ) : (
            userComments.map((c) => {
              const parentPost = posts.find((p) => p.id === c.postId);
              return (
                <Link
                  key={c.id}
                  to={`/post/${c.postId}`}
                  className="block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-4 space-y-1.5 text-xs"
                >
                  <div className="text-zinc-400 flex items-center justify-between">
                    <span>
                      Replied on{' '}
                      <strong className="text-zinc-800 dark:text-zinc-200">
                        {parentPost?.title || 'Signal'}
                      </strong>
                    </span>
                    <span>{formatRelativeTime(c.createdAt)}</span>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300">{c.body}</p>
                </Link>
              );
            })
          ))}
      </div>
    </div>
  );
};
