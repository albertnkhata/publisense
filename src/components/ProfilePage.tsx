import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ArrowRight,
  BookOpen,
  Users
} from 'lucide-react';
import { UserProfile, FeedbackItem, Product, UserRole, Company } from '../types';
import { FeedbackCard } from './FeedbackCard';
import { loadProfile, saveProfile, STORAGE_PREFIX } from '../lib/profileStorage';
import { formatRelativeTime } from '../lib/timeUtils';
import { 
  getUserUpvotedIds, 
  getUserFollowedUsers, 
  setUserFollowedUsers 
} from '../lib/userInteractionStorage';

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
  onOpenProduct?: (product: Product) => void;
  onOpenCompany?: (company: Company | string) => void;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  onOpenInternalDocs?: () => void;
  onOpenAdminConsole?: () => void;
  onOpenProfile?: (handle: string, name: string, avatar: string) => void;
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
  onOpenProduct,
  onOpenCompany,
  isFollowing = false,
  onToggleFollow,
  onOpenInternalDocs,
  onOpenAdminConsole,
  onOpenProfile,
}) => {
  // Derive handle from route (e.g. /#profile-albert -> "albert")
  const routeHandle = useMemo(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const match = window.location.hash.match(/profile-([^?&/]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]).replace(/^@/, '');
      }
    }
    return (profile.handle || '').replace(/^@/, '');
  }, [profile.handle]);

  const [storedData, setStoredData] = useState<{
    name?: string;
    org?: string;
    bio?: string;
    avatar?: string;
    handle?: string;
    updatedAt?: number;
  } | null>(() => {
    const handle = typeof window !== 'undefined' && window.location.hash
      ? (window.location.hash.match(/profile-([^?&/]+)/)?.[1]?.replace(/^@/, '') || (profile.handle || '').replace(/^@/, ''))
      : (profile.handle || '').replace(/^@/, '');
    return loadProfile(handle);
  });

  const cleanProfileKey = (storedData?.handle || routeHandle || profile.handle || '').replace(/^@/, '').toLowerCase();
  const isAlbert = cleanProfileKey === 'albert' || profile.email === 'albertnkhata.s@gmail.com';

  const [activeTab, setActiveTab] = useState<'submissions' | 'upvoted' | 'activity' | 'followers' | 'following'>('submissions');
  const [internalFollowingSet, setInternalFollowingSet] = useState<Set<string>>(() => {
    if (isAlbert) {
      return new Set(['sarah_pm', 'alex_admin', 'kavita_ui', 'kevin_openai', 'claire_codes']);
    }
    const followed = getUserFollowedUsers(cleanProfileKey);
    return new Set(followed.map((h) => h.replace(/^@/, '')));
  });

  const toggleUserFollow = (targetHandle: string) => {
    const cleanTarget = targetHandle.replace(/^@/, '');
    setInternalFollowingSet((prev) => {
      const next = new Set(prev);
      if (next.has(cleanTarget)) {
        next.delete(cleanTarget);
      } else {
        next.add(cleanTarget);
      }
      setUserFollowedUsers(cleanProfileKey, Array.from(next).map((h) => `@${h}`));
      return next;
    });
  };
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(storedData?.name ?? profile.name);
  const [editBio, setEditBio] = useState(storedData?.bio ?? (profile.bio || ''));
  const [editLocation, setEditLocation] = useState(profile.location || '');
  const [editCompany, setEditCompany] = useState(storedData?.org ?? (profile.companyOrOrg || ''));
  const [editAvatar, setEditAvatar] = useState<string>(storedData?.avatar || profile.avatar);
  const [editHandle, setEditHandle] = useState<string>(
    (storedData?.handle || routeHandle || profile.handle || '').replace(/^@/, '')
  );
  const [handleError, setHandleError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const collectTakenHandles = (): Set<string> => {
    // (a) the app's mock/seed users
    const taken = new Set<string>([
      'albert', 'alex_admin', 'sarah_pm', 'arivera_dev', 'claire_codes',
      'devon_builds', 'dk_devops', 'elena_ai', 'elena_code', 'jsparks_design',
      'kavita_ui', 'kevin_openai', 'liam_oc', 'mateo_alvarez', 'mchen_tech',
      'npalmer', 'openai_eng', 'rami_ops', 'sjenkins_ux', 'sophia_ml',
      'tariqh_ai', 'dario_anthropic', 'mtruell', 'jordan_pulse', 'rauchg',
      'qasignup', 'retestuser'
    ]);
    feedbackItems.forEach((item) => {
      const h = item.authorHandle.replace(/^@/, '').toLowerCase().trim();
      if (h && h !== 'you') taken.add(h);
      item.comments?.forEach((c) => {
        const ch = c.authorHandle.replace(/^@/, '').toLowerCase().trim();
        if (ch && ch !== 'you') taken.add(ch);
      });
    });
    companies.forEach((comp) => {
      comp.verifiedMembers?.forEach((m) => {
        const mh = m.handle.replace(/^@/, '').toLowerCase().trim();
        if (mh) taken.add(mh);
      });
    });

    // (b) every profile stored via profileStorage (every stored profile's handle)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(STORAGE_PREFIX)) {
            const handleFromKey = key.slice(STORAGE_PREFIX.length).replace(/^@/, '').toLowerCase().trim();
            if (handleFromKey) {
              taken.add(handleFromKey);
            }
            try {
              const raw = window.localStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.handle) {
                  const h = String(parsed.handle).replace(/^@/, '').toLowerCase().trim();
                  if (h) taken.add(h);
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        console.warn('Failed to read profiles from localStorage:', err);
      }
    }

    // Exclude the current user's own current handle
    const currentHandles = [
      (storedData?.handle || '').replace(/^@/, '').toLowerCase().trim(),
      (routeHandle || '').replace(/^@/, '').toLowerCase().trim(),
      (profile.handle || '').replace(/^@/, '').toLowerCase().trim(),
    ].filter(Boolean);

    currentHandles.forEach((h) => taken.delete(h));

    return taken;
  };

  const validateHandle = (val: string): boolean => {
    const clean = val.trim().toLowerCase().replace(/^@/, '');
    if (!clean) {
      setHandleError('Handle is required');
      return false;
    }
    if (clean.length < 2 || clean.length > 30) {
      setHandleError('Handle must be 2-30 characters');
      return false;
    }
    if (!/^[a-z0-9_]{2,30}$/.test(clean)) {
      setHandleError('Only lowercase letters, numbers, and underscores allowed');
      return false;
    }
    const takenHandles = collectTakenHandles();
    if (takenHandles.has(clean)) {
      setHandleError('Handle already taken');
      return false;
    }
    setHandleError(null);
    return true;
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setEditAvatar(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // On mount and when handle changes, call loadProfile(handle)
  useEffect(() => {
    const stored = loadProfile(routeHandle);
    if (stored) {
      setStoredData(stored);
      if (stored.name !== undefined) setEditName(stored.name);
      if (stored.org !== undefined) setEditCompany(stored.org);
      if (stored.bio !== undefined) setEditBio(stored.bio);
      if (stored.avatar !== undefined) setEditAvatar(stored.avatar);
      if (stored.handle !== undefined) setEditHandle(stored.handle.replace(/^@/, ''));
      else setEditHandle(routeHandle);
    } else {
      setStoredData(null);
      setEditName(profile.name);
      setEditCompany(profile.companyOrOrg || '');
      setEditBio(profile.bio || '');
      setEditAvatar(profile.avatar);
      setEditHandle(routeHandle);
    }
    setHandleError(null);
  }, [routeHandle, profile.name, profile.companyOrOrg, profile.bio, profile.avatar, profile.handle]);

  const displayName = storedData?.name ?? profile.name;
  const displayCompany = storedData?.org !== undefined ? storedData.org : (profile.companyOrOrg || '');
  const displayBio = storedData?.bio !== undefined ? storedData.bio : (profile.bio || '');
  const displayAvatar = storedData?.avatar || profile.avatar;
  const displayHandle = storedData?.handle ? `@${storedData.handle.replace(/^@/, '')}` : profile.handle;

  // Follow State
  const [activeFollowing, setActiveFollowing] = useState(isFollowing);
  const [followerCount, setFollowerCount] = useState(
    profile.followerCount ?? (isAlbert ? 28 : 0)
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
    const cleanProfileHandle = (profile.handle || '').toLowerCase().replace(/^@/, '');
    return feedbackItems.filter((item) => {
      const cleanItemHandle = (item.authorHandle || '').toLowerCase().replace(/^@/, '');
      return cleanItemHandle === cleanProfileHandle;
    });
  }, [feedbackItems, profile.handle]);

  // Find items upvoted by this user (siloed per account)
  const userUpvotedItems = useMemo(() => {
    const upvotedIds = getUserUpvotedIds(cleanProfileKey);
    return feedbackItems.filter((item) => upvotedIds.has(item.id));
  }, [feedbackItems, cleanProfileKey]);

  // Find comments/activity by this user
  const userComments = useMemo(() => {
    const list: { comment: any; feedbackItem: FeedbackItem; product?: Product }[] = [];
    const cleanProfileHandle = (profile.handle || '').toLowerCase().replace(/^@/, '');
    feedbackItems.forEach((item) => {
      item.comments.forEach((c) => {
        const cleanCommentHandle = (c.authorHandle || '').toLowerCase().replace(/^@/, '');
        if (cleanCommentHandle === cleanProfileHandle) {
          list.push({
            comment: c,
            feedbackItem: item,
            product: products.find((p) => p.id === item.productId),
          });
        }
      });
    });
    return list;
  }, [feedbackItems, profile.handle, products]);

  // Count shipped issues posted by this user
  const shippedCount = useMemo(() => {
    return userSubmissions.filter((item) => item.status === 'shipped').length;
  }, [userSubmissions]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanNewHandle = editHandle.trim().toLowerCase().replace(/^@/, '');

    // Collect every taken handle from (a) mock/seed users and (b) every profile stored via profileStorage, lowercased, excluding current user's own current handle
    const takenHandles = collectTakenHandles();
    if (takenHandles.has(cleanNewHandle)) {
      setHandleError('Handle already taken');
      return;
    }

    const isHandleValid = validateHandle(editHandle);
    if (!isHandleValid) return;

    const finalName = editName.trim() || displayName;
    const finalOrg = editCompany.trim();
    const finalBio = editBio.trim();
    const finalAvatar = editAvatar || displayAvatar;
    const finalHandle = cleanNewHandle || routeHandle;

    saveProfile(routeHandle, {
      name: finalName,
      org: finalOrg,
      bio: finalBio,
      avatar: finalAvatar,
      handle: finalHandle,
    });

    setStoredData({
      name: finalName,
      org: finalOrg,
      bio: finalBio,
      avatar: finalAvatar,
      handle: finalHandle,
      updatedAt: Date.now(),
    });

    if (onUpdateProfile) {
      onUpdateProfile({
        name: finalName,
        bio: finalBio,
        location: editLocation.trim(),
        companyOrOrg: finalOrg,
        avatar: finalAvatar,
        handle: `@${finalHandle}`,
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
    if (displayCompany) {
      const q = displayCompany.toLowerCase();
      const match = companies.find((c) => c.name.toLowerCase() === q || c.slug.toLowerCase() === q);
      if (match) return match;
    }
    // Check if user's handle is in verifiedMembers of any company
    const memberMatch = companies.find((c) => 
      c.verifiedMembers.some((m) => m.handle.toLowerCase() === profile.handle.toLowerCase())
    );
    if (memberMatch) return memberMatch;

    return null;
  }, [companies, profile.companyId, displayCompany, profile.handle]);

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
          {displayName}
        </span>
      </nav>

      {/* Profile Card Header */}
      <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-xs mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center sm:items-start gap-4">
            <div className="relative">
              <img
                src={displayAvatar}
                alt={displayName}
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
                  {displayName}
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
              ) : displayCompany ? (
                <div className="pt-0.5 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  {companyRoleTitle ? `${companyRoleTitle} at ` : ''}{displayCompany}
                </div>
              ) : null}

              <p className="text-xs text-zinc-500 font-mono">
                {displayHandle}
              </p>

              {displayBio && (
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 pt-1 leading-relaxed max-w-xl">
                  {displayBio}
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
                ) : displayCompany ? (
                  <div className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    <span>{displayCompany}</span>
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

              {/* Followers & Following Counts (Clickable to switch tabs) */}
              <div className="flex items-center gap-3.5 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
                <button
                  type="button"
                  onClick={() => setActiveTab('followers')}
                  className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer group/stat"
                  title="View followers list"
                >
                  <span className="font-semibold text-zinc-900 dark:text-white group-hover/stat:underline">
                    {followerCount}
                  </span>
                  <span className="group-hover/stat:underline">{followerCount === 1 ? 'follower' : 'followers'}</span>
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('following')}
                  className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer group/stat"
                  title="View following list"
                >
                  <span className="font-semibold text-zinc-900 dark:text-white group-hover/stat:underline">
                    {profile.followingCount ?? (isAlbert ? 14 : internalFollowingSet.size)}
                  </span>
                  <span className="group-hover/stat:underline">following</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {isCurrentUser ? (
            <div className="flex sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
              {isAdmin && onOpenAdminConsole && (
                <button
                  type="button"
                  onClick={() => onOpenAdminConsole()}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="Open Admin Console for User & Company RBAC management"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin Console</span>
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onOpenInternalDocs && onOpenInternalDocs()}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="View internal features directory, behavioral functions & roadmap"
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Internal Docs</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    setEditName(displayName);
                    setEditCompany(displayCompany);
                    setEditBio(displayBio);
                    setEditAvatar(displayAvatar);
                    setEditHandle((storedData?.handle || routeHandle || profile.handle || '').replace(/^@/, ''));
                    setHandleError(null);
                  }
                  setIsEditing(!isEditing);
                }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
              </button>
            </div>
          ) : (
            <div className="w-full sm:w-auto pt-2 sm:pt-0 flex-shrink-0 flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onOpenInternalDocs && onOpenInternalDocs()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="View internal features directory, behavioral functions & roadmap"
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Internal Docs</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleFollow}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer ${
                  activeFollowing
                    ? 'bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 group/btn'
                    : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 border border-transparent'
                }`}
                title={activeFollowing ? `Unfollow ${displayName}` : `Follow ${displayName}`}
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

            {/* Avatar / Photo Upload */}
            <div className="flex items-center gap-3 pb-1">
              <img
                src={editAvatar}
                alt="Avatar preview"
                className="w-12 h-12 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs"
              />
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-750 transition-colors cursor-pointer"
                >
                  Change photo
                </button>
              </div>
            </div>

            {/* Handle / Username */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Handle
              </label>
              <div className={`flex items-center rounded-lg border ${handleError ? 'border-rose-400 dark:border-rose-500' : 'border-zinc-200 dark:border-zinc-700'} bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 focus-within:ring-1 ${handleError ? 'focus-within:ring-rose-400' : 'focus-within:ring-zinc-400 dark:focus-within:ring-zinc-500'}`}>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 select-none mr-1 font-mono">@</span>
                <input
                  type="text"
                  value={editHandle}
                  onChange={(e) => {
                    const val = e.target.value.toLowerCase().replace(/^@/, '');
                    setEditHandle(val);
                    validateHandle(val);
                  }}
                  onBlur={() => validateHandle(editHandle)}
                  className="w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none font-mono"
                  placeholder="username"
                />
              </div>
              {handleError && (
                <p className="text-[11px] text-rose-500 mt-1 font-medium">{handleError}</p>
              )}
            </div>

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
                  Organisation
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
                onClick={() => {
                  setEditName(displayName);
                  setEditCompany(displayCompany);
                  setEditBio(displayBio);
                  setEditAvatar(displayAvatar);
                  setEditHandle((storedData?.handle || routeHandle || profile.handle || '').replace(/^@/, ''));
                  setHandleError(null);
                  setIsEditing(false);
                }}
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

      {/* Admin Operations & Internal Documentation Banner */}
      {isAdmin && (
        <div className="p-4 sm:p-5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 shadow-2xs mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center flex-shrink-0 shadow-2xs">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  Internal Product Documentation & Technical Specs
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                  Platform Admin Portal
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl leading-relaxed">
                Centralized reference for system architecture, core features directory, intended behavioral functions, RBAC matrix, and phased engineering roadmap.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => onOpenInternalDocs && onOpenInternalDocs()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Open Internal Docs</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
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

          <button
            onClick={() => setActiveTab('followers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'followers'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Followers ({followerCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('following')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'following'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Following ({profile.followingCount ?? (isAlbert ? 14 : internalFollowingSet.size)})</span>
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
                    <span className="text-[11px] text-zinc-400">
                      {formatRelativeTime(comment.createdAt, comment.id)}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed bg-zinc-50 dark:bg-zinc-850 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/80">
                    "{comment.text}"
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: Followers List */}
        {activeTab === 'followers' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Community members and builders following {displayName}</span>
              <span className="font-semibold text-zinc-900 dark:text-white">{followerCount} total</span>
            </div>

            {followerCount === 0 ? (
              <div className="py-12 text-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-400">
                <Users className="w-8 h-8 mx-auto text-zinc-400 mb-2 opacity-60" />
                <p className="font-medium text-zinc-800 dark:text-zinc-200">No followers yet</p>
                <p className="text-zinc-500 mt-1 max-w-sm mx-auto">
                  Share product feedback and participate in discussions to build your community reputation.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  handle: 'sarah_pm',
                  name: 'Sarah Chen',
                  avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80',
                  role: 'company_pm',
                  roleTitle: 'Lead Product Manager at Anysphere (Cursor)',
                  bio: 'Guiding developer workflows, AI Composer mode, and compiler extensions for Cursor.',
                },
                {
                  handle: 'alex_admin',
                  name: 'Alex Vance',
                  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
                  role: 'admin',
                  roleTitle: 'Platform Administrator at CrowdPulse',
                  bio: 'Stewarding open community product intelligence, triage transparency, and feedback pipelines.',
                },
                {
                  handle: 'elena_ai',
                  name: 'Elena Rostova',
                  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
                  role: 'user',
                  roleTitle: 'ML Research Engineer',
                  bio: 'Benchmarking context window evictions and reasoning speed across modern LLM interfaces.',
                },
                {
                  handle: 'devon_builds',
                  name: 'Devon Ross',
                  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&auto=format&fit=crop&q=80',
                  role: 'user',
                  roleTitle: 'Fullstack Systems Architect',
                  bio: 'Profiling monorepos, docker volume mount speeds, and turbo workspace tooling.',
                },
                {
                  handle: 'kavita_ui',
                  name: 'Kavita Raman',
                  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&auto=format&fit=crop&q=80',
                  role: 'user',
                  roleTitle: 'Design Technologist',
                  bio: 'Crafting responsive UI systems, micro-interactions, and component bundle budgets.',
                },
                {
                  handle: 'tariqh_ai',
                  name: 'Tariq Hassan',
                  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&auto=format&fit=crop&q=80',
                  role: 'user',
                  roleTitle: 'Staff AI Engineer',
                  bio: 'Building autonomous code generation pipelines and multi-agent coordination.',
                },
              ].map((member) => {
                const isMemberFollowed = internalFollowingSet.has(member.handle);
                return (
                  <div
                    key={member.handle}
                    className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={member.avatar}
                        alt={member.name}
                        onClick={() => {
                          if (onOpenProfile) {
                            onOpenProfile(member.handle, member.name, member.avatar);
                          } else {
                            window.location.hash = `#profile-${member.handle}`;
                          }
                        }}
                        className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 cursor-pointer flex-shrink-0 hover:opacity-90"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenProfile) {
                                onOpenProfile(member.handle, member.name, member.avatar);
                              } else {
                                window.location.hash = `#profile-${member.handle}`;
                              }
                            }}
                            className="font-semibold text-xs text-zinc-900 dark:text-white hover:underline cursor-pointer truncate"
                          >
                            {member.name}
                          </button>
                          {member.role === 'admin' ? (
                            <span title="Admin" className="inline-flex items-center">
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                            </span>
                          ) : member.role === 'company_pm' ? (
                            <span title="Verified PM" className="inline-flex items-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-zinc-400 font-mono">@{member.handle}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                          {member.bio}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenProfile) {
                            onOpenProfile(member.handle, member.name, member.avatar);
                          } else {
                            window.location.hash = `#profile-${member.handle}`;
                          }
                        }}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium cursor-pointer"
                      >
                        View profile
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleUserFollow(member.handle)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          isMemberFollowed
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/80'
                            : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:bg-zinc-800'
                        }`}
                      >
                        {isMemberFollowed ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3 h-3" />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* Tab 5: Following List */}
        {activeTab === 'following' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Teams, builders, and verified PMs {displayName} follows</span>
              <span className="font-semibold text-zinc-900 dark:text-white">
                {profile.followingCount ?? (isAlbert ? 14 : internalFollowingSet.size)} total
              </span>
            </div>

            {(profile.followingCount ?? (isAlbert ? 14 : internalFollowingSet.size)) === 0 ? (
              <div className="py-12 text-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-400">
                <UserCheck className="w-8 h-8 mx-auto text-zinc-400 mb-2 opacity-60" />
                <p className="font-medium text-zinc-800 dark:text-zinc-200">Not following anyone yet</p>
                <p className="text-zinc-500 mt-1 max-w-sm mx-auto">
                  Follow verified PMs and community builders to stay updated on what they ship.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  handle: 'sarah_pm',
                  name: 'Sarah Chen',
                  avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80',
                  role: 'company_pm',
                  roleTitle: 'Lead Product Manager at Anysphere (Cursor)',
                  bio: 'Guiding developer workflows, AI Composer mode, and compiler extensions for Cursor.',
                },
                {
                  handle: 'alex_admin',
                  name: 'Alex Vance',
                  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
                  role: 'admin',
                  roleTitle: 'Platform Administrator at CrowdPulse',
                  bio: 'Stewarding open community product intelligence, triage transparency, and feedback pipelines.',
                },
                {
                  handle: 'kevin_openai',
                  name: 'Kevin Weil',
                  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&auto=format&fit=crop&q=80',
                  role: 'company_pm',
                  roleTitle: 'Product Lead at OpenAI',
                  bio: 'Building consumer and enterprise conversational intelligence platforms.',
                },
                {
                  handle: 'claire_codes',
                  name: 'Claire Chen',
                  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
                  role: 'user',
                  roleTitle: 'Mobile & Web Developer',
                  bio: 'Offline-first database synchronization, PWA engineering, and cross-platform apps.',
                },
                {
                  handle: 'liam_oc',
                  name: 'Liam O’Connor',
                  avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=128&auto=format&fit=crop&q=80',
                  role: 'user',
                  roleTitle: 'Frontend Engineer at Vercel / v0',
                  bio: 'Next.js server-client architecture and AI-assisted generative UI scaffolds.',
                },
                {
                  handle: 'mateo_alvarez',
                  name: 'Mateo Alvarez',
                  avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=128&auto=format&fit=crop&q=80',
                  role: 'user',
                  roleTitle: 'DevOps & Tooling Architect',
                  bio: 'Managing Turbo monorepos, CI pipelines, and high-performance development containers.',
                },
              ].map((member) => {
                const isMemberFollowed = internalFollowingSet.has(member.handle);
                return (
                  <div
                    key={member.handle}
                    className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={member.avatar}
                        alt={member.name}
                        onClick={() => {
                          if (onOpenProfile) {
                            onOpenProfile(member.handle, member.name, member.avatar);
                          } else {
                            window.location.hash = `#profile-${member.handle}`;
                          }
                        }}
                        className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 cursor-pointer flex-shrink-0 hover:opacity-90"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenProfile) {
                                onOpenProfile(member.handle, member.name, member.avatar);
                              } else {
                                window.location.hash = `#profile-${member.handle}`;
                              }
                            }}
                            className="font-semibold text-xs text-zinc-900 dark:text-white hover:underline cursor-pointer truncate"
                          >
                            {member.name}
                          </button>
                          {member.role === 'admin' ? (
                            <span title="Admin" className="inline-flex items-center">
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                            </span>
                          ) : member.role === 'company_pm' ? (
                            <span title="Verified PM" className="inline-flex items-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-zinc-400 font-mono">@{member.handle}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                          {member.bio}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenProfile) {
                            onOpenProfile(member.handle, member.name, member.avatar);
                          } else {
                            window.location.hash = `#profile-${member.handle}`;
                          }
                        }}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium cursor-pointer"
                      >
                        View profile
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleUserFollow(member.handle)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          isMemberFollowed
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/80'
                            : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:bg-zinc-800'
                        }`}
                      >
                        {isMemberFollowed ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3 h-3" />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
