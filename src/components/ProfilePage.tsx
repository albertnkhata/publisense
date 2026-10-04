import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  ChevronRight,
  ShieldCheck, 
  CheckCircle2,
  UserCheck, 
  MapPin, 
  Calendar, 
  Building2, 
  Mail, 
  Edit3, 
  Check, 
  X, 
  MessageCircle, 
  ChevronUp, 
  Sparkles, 
  Layers, 
  FileText, 
  UserPlus, 
  UserMinus,
  ArrowRight
} from 'lucide-react';
import { UserProfile, FeedbackItem, Product, UserRole, Company } from '../types';
import { FeedbackCard } from './FeedbackCard';

interface ProfilePageProps {
  profile: UserProfile;
  isCurrentUser: boolean;
  feedbackItems: FeedbackItem[];
  products: Product[];
  companies?: Company[];
  onBack: () => void;
  onOpenDetails: (item: FeedbackItem) => void;
  onVote: (itemId: string) => void;
  onOpenShare: (item: FeedbackItem) => void;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onRoleChange?: (newRole: UserRole) => void;
  onOpenProduct?: (product: Product) => void;
  onOpenCompany?: (company: Company | string) => void;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  profile,
  isCurrentUser,
  feedbackItems,
  products,
  companies = [],
  onBack,
  onOpenDetails,
  onVote,
  onOpenShare,
  onUpdateProfile,
  onRoleChange,
  onOpenProduct,
  onOpenCompany,
  isFollowing = false,
  onToggleFollow,
}) => {
  const [activeTab, setActiveTab] = useState<'submissions' | 'upvoted' | 'activity'>('submissions');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editBio, setEditBio] = useState(profile.bio || '');
  const [editLocation, setEditLocation] = useState(profile.location || '');
  const [editCompany, setEditCompany] = useState(profile.companyOrOrg || '');

  // Follow State
  const [activeFollowing, setActiveFollowing] = useState(isFollowing);
  const [followerCount, setFollowerCount] = useState(
    profile.followerCount ?? (isCurrentUser ? 28 : 42)
  );

  useEffect(() => {
    setActiveFollowing(isFollowing);
  }, [isFollowing]);

  const handleToggleFollow = () => {
    const next = !activeFollowing;
    setActiveFollowing(next);
    setFollowerCount((prev) => (next ? prev + 1 : Math.max(0, prev - 1)));
    if (onToggleFollow) {
      onToggleFollow();
    }
  };

  // Find submissions by this user
  const userSubmissions = useMemo(() => {
    return feedbackItems.filter((item) => {
      const matchHandle = item.authorHandle.toLowerCase() === profile.handle.toLowerCase();
      const matchSelf = isCurrentUser && (item.authorHandle === '@you' || item.authorHandle === profile.handle);
      return matchHandle || matchSelf;
    });
  }, [feedbackItems, profile.handle, isCurrentUser]);

  // Find items upvoted by this user
  const userUpvotedItems = useMemo(() => {
    if (isCurrentUser) {
      return feedbackItems.filter((item) => item.hasUserVoted);
    }
    return feedbackItems.filter((item) => 
      profile.upvotedItemIds ? profile.upvotedItemIds.includes(item.id) : false
    );
  }, [feedbackItems, isCurrentUser, profile.upvotedItemIds]);

  // Find comments/activity by this user
  const userComments = useMemo(() => {
    const list: { comment: any; feedbackItem: FeedbackItem; product?: Product }[] = [];
    feedbackItems.forEach((item) => {
      item.comments.forEach((c) => {
        const matchHandle = c.authorHandle.toLowerCase() === profile.handle.toLowerCase();
        const matchSelf = isCurrentUser && (c.authorHandle === '@you' || c.authorHandle === profile.handle);
        if (matchHandle || matchSelf) {
          list.push({
            comment: c,
            feedbackItem: item,
            product: products.find((p) => p.id === item.productId),
          });
        }
      });
    });
    return list;
  }, [feedbackItems, profile.handle, isCurrentUser, products]);

  // Count shipped issues posted by this user
  const shippedCount = useMemo(() => {
    return userSubmissions.filter((item) => item.status === 'shipped').length;
  }, [userSubmissions]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateProfile) {
      onUpdateProfile({
        name: editName.trim() || profile.name,
        bio: editBio.trim(),
        location: editLocation.trim(),
        companyOrOrg: editCompany.trim(),
      });
    }
    setIsEditing(false);
  };

  const isPM = profile.role === 'company_pm';
  const isAdmin = profile.role === 'admin';

  // Match profile with company (e.g. Sarah Chen -> Anysphere)
  const userCompany = useMemo(() => {
    if (!companies || companies.length === 0) return null;
    if (profile.companyId) {
      const match = companies.find((c) => c.id === profile.companyId || c.slug === profile.companyId);
      if (match) return match;
    }
    if (profile.companyOrOrg) {
      const q = profile.companyOrOrg.toLowerCase();
      const match = companies.find((c) => c.name.toLowerCase() === q || c.slug.toLowerCase() === q);
      if (match) return match;
    }
    // Check if user's handle is in verifiedMembers of any company
    const memberMatch = companies.find((c) => 
      c.verifiedMembers.some((m) => m.handle.toLowerCase() === profile.handle.toLowerCase())
    );
    if (memberMatch) return memberMatch;

    return null;
  }, [companies, profile.companyId, profile.companyOrOrg, profile.handle]);

  // Member role title from company verifiedMembers if available
  const companyRoleTitle = useMemo(() => {
    if (profile.roleTitle) return profile.roleTitle;
    if (userCompany) {
      const member = userCompany.verifiedMembers.find((m) => m.handle.toLowerCase() === profile.handle.toLowerCase());
      if (member) return member.roleTitle;
      if (isPM) return 'Product Manager';
    }
    return isPM ? 'Product Manager' : undefined;
  }, [profile.roleTitle, userCompany, profile.handle, isPM]);

  // Products belonging to user's company
  const managedProducts = useMemo(() => {
    if (!userCompany) return [];
    return products.filter(
      (p) => p.companyId === userCompany.id || (p.companyName && p.companyName.toLowerCase() === userCompany.name.toLowerCase())
    );
  }, [products, userCompany]);

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

        <span className="font-semibold text-zinc-900 dark:text-white truncate max-w-[240px]" aria-current="page">
          {profile.name}
        </span>
      </nav>

      {/* Profile Card Header */}
      <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-xs mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center sm:items-start gap-4">
            <div className="relative">
              <img
                src={profile.avatar}
                alt={profile.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-zinc-200 dark:border-zinc-700 shadow-sm"
              />
              <span
                className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-white dark:border-zinc-900 ${
                  isAdmin
                    ? 'bg-purple-600 text-white'
                    : isPM
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                }`}
                title={isAdmin ? 'Platform Admin' : isPM ? 'Verified Product Team' : 'Community Member'}
              >
                {isAdmin ? (
                  <ShieldCheck className="w-3 h-3" />
                ) : isPM ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <UserCheck className="w-3 h-3" />
                )}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                  {profile.name}
                </h1>
                {isAdmin ? (
                  <span title="Platform Admin" className="inline-flex items-center">
                    <ShieldCheck className="w-4 h-4 text-purple-500" />
                  </span>
                ) : isPM ? (
                  <span title="Verified PM" className="inline-flex items-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </span>
                ) : null}
              </div>

              {/* Organization & PM Title Affiliation */}
              {userCompany ? (
                <div className="pt-0.5 flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                    {companyRoleTitle} at
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenCompany && onOpenCompany(userCompany)}
                    className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white hover:underline cursor-pointer group/comp"
                  >
                    <img
                      src={userCompany.logo}
                      alt={userCompany.name}
                      className="w-4 h-4 rounded-md object-cover border border-zinc-200 dark:border-zinc-700 group-hover/comp:scale-105 transition-transform"
                    />
                    <span>{userCompany.name}</span>
                    <span title="Verified Organization" className="inline-flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    </span>
                  </button>
                </div>
              ) : profile.companyOrOrg ? (
                <div className="pt-0.5 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  {companyRoleTitle ? `${companyRoleTitle} at ` : ''}{profile.companyOrOrg}
                </div>
              ) : null}

              <p className="text-xs text-zinc-500 font-mono">
                {profile.handle}
              </p>

              {profile.bio && (
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 pt-1 leading-relaxed max-w-xl">
                  {profile.bio}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-zinc-400">
                {userCompany ? (
                  <button
                    type="button"
                    onClick={() => onOpenCompany && onOpenCompany(userCompany)}
                    className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer group/link"
                  >
                    <Building2 className="w-3 h-3 text-zinc-400 group-hover/link:text-zinc-600 dark:group-hover/link:text-zinc-200" />
                    <span className="group-hover/link:underline">{userCompany.name}</span>
                  </button>
                ) : profile.companyOrOrg ? (
                  <div className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    <span>{profile.companyOrOrg}</span>
                  </div>
                ) : null}
                {profile.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{profile.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Joined {profile.joinedDate || 'March 2024'}</span>
                </div>
              </div>

              {/* Followers & Following Counts */}
              <div className="flex items-center gap-3.5 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-zinc-900 dark:text-white">
                    {followerCount}
                  </span>
                  <span>{followerCount === 1 ? 'follower' : 'followers'}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-zinc-900 dark:text-white">
                    {profile.followingCount ?? (isCurrentUser ? 14 : 29)}
                  </span>
                  <span>following</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {isCurrentUser ? (
            <div className="flex sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
              </button>

              {onRoleChange && (
                <button
                  type="button"
                  onClick={() => onRoleChange(isPM ? 'user' : 'company_pm')}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  <span>Switch to {isPM ? 'User' : 'PM'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="w-full sm:w-auto pt-2 sm:pt-0 flex-shrink-0">
              <button
                type="button"
                onClick={handleToggleFollow}
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer ${
                  activeFollowing
                    ? 'bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 group/btn'
                    : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 border border-transparent'
                }`}
                title={activeFollowing ? `Unfollow ${profile.name}` : `Follow ${profile.name}`}
              >
                {activeFollowing ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500 group-hover/btn:hidden" />
                    <UserMinus className="w-3.5 h-3.5 text-rose-500 hidden group-hover/btn:inline" />
                    <span className="group-hover/btn:hidden">Following</span>
                    <span className="hidden group-hover/btn:inline text-rose-600 dark:text-rose-400">Unfollow</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Inline Edit Form */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Update Profile Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Company / Organization
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cursor, Anthropic, or Freelance"
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Bio
              </label>
              <textarea
                rows={2}
                placeholder="Tell others what you build and what tools you love testing..."
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-center">
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg font-bold text-zinc-900 dark:text-white">
              {userSubmissions.length}
            </p>
            <p className="text-[11px] text-zinc-500">Submissions</p>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg font-bold text-zinc-900 dark:text-white">
              {userUpvotedItems.length}
            </p>
            <p className="text-[11px] text-zinc-500">Upvoted</p>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg font-bold text-zinc-900 dark:text-white">
              {userComments.length}
            </p>
            <p className="text-[11px] text-zinc-500">Comments</p>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {shippedCount}
            </p>
            <p className="text-[11px] text-zinc-500">Resolved</p>
          </div>
        </div>
      </div>

      {/* Official Org & Managed Products Card for Verified PMs */}
      {userCompany && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <img
              src={userCompany.logo}
              alt={userCompany.name}
              className="w-12 h-12 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs flex-shrink-0"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-400">{companyRoleTitle} at</span>
                <button
                  type="button"
                  onClick={() => onOpenCompany && onOpenCompany(userCompany)}
                  className="font-bold text-sm text-zinc-900 dark:text-white hover:underline cursor-pointer flex items-center gap-1.5"
                >
                  <span>{userCompany.name}</span>
                  <span title="Verified Organization" className="inline-flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </span>
                </button>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 max-w-xl">
                {userCompany.tagline}
              </p>
              {managedProducts.length > 0 && (
                <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap">
                  <span className="font-medium text-zinc-600 dark:text-zinc-400">Products:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {managedProducts.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => onOpenProduct && onOpenProduct(prod)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium transition-colors cursor-pointer"
                      >
                        <img src={prod.logo} alt={prod.name} className="w-3.5 h-3.5 rounded object-cover" />
                        <span>{prod.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => onOpenCompany && onOpenCompany(userCompany)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              <span>{userCompany.name} Hub</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        </div>
      )}

      {/* Profile Content Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab('submissions')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'submissions'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Submissions ({userSubmissions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('upvoted')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'upvoted'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>Upvoted ({userUpvotedItems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Discussion ({userComments.length})</span>
          </button>
        </div>

        {/* Tab 1: Submissions */}
        {activeTab === 'submissions' && (
          <div className="space-y-3">
            {userSubmissions.length === 0 ? (
              <div className="py-12 text-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-400">
                No feedback submissions yet.
              </div>
            ) : (
              userSubmissions.map((item) => {
                const itemProduct = products.find((p) => p.id === item.productId);
                return (
                  <FeedbackCard
                    key={item.id}
                    item={item}
                    product={itemProduct}
                    onVote={onVote}
                    onOpenDetails={onOpenDetails}
                    onOpenShare={onOpenShare}
                    onOpenProduct={onOpenProduct}
                  />
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Upvoted */}
        {activeTab === 'upvoted' && (
          <div className="space-y-3">
            {userUpvotedItems.length === 0 ? (
              <div className="py-12 text-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-400">
                No upvoted feedback items yet.
              </div>
            ) : (
              userUpvotedItems.map((item) => {
                const itemProduct = products.find((p) => p.id === item.productId);
                return (
                  <FeedbackCard
                    key={item.id}
                    item={item}
                    product={itemProduct}
                    onVote={onVote}
                    onOpenDetails={onOpenDetails}
                    onOpenShare={onOpenShare}
                    onOpenProduct={onOpenProduct}
                  />
                );
              })
            )}
          </div>
        )}

        {/* Tab 3: Comments & Activity */}
        {activeTab === 'activity' && (
          <div className="space-y-3">
            {userComments.length === 0 ? (
              <div className="py-12 text-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-400">
                No comments or discussion activity yet.
              </div>
            ) : (
              userComments.map(({ comment, feedbackItem, product }) => (
                <div
                  key={comment.id}
                  onClick={() => onOpenDetails(feedbackItem)}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <div className="flex items-center gap-2">
                      {product && (
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {product.name}
                        </span>
                      )}
                      <span>•</span>
                      <span className="text-zinc-600 dark:text-zinc-400 group-hover:underline">
                        On "{feedbackItem.title}"
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400">{comment.createdAt}</span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed bg-zinc-50 dark:bg-zinc-850 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/80">
                    "{comment.text}"
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
