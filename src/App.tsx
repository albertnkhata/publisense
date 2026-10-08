/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, ArrowRight, Bell } from 'lucide-react';
import { 
  INITIAL_PRODUCTS, 
  INITIAL_FEEDBACK,
  INITIAL_NOTIFICATIONS
} from './data/mockData';
import { INITIAL_COMPANIES } from './data/companyData';
import { 
  FeedbackItem, 
  Product, 
  Company,
  VerifiedTeamMember,
  FeedbackStatus, 
  FeedbackCategory, 
  Severity, 
  UserRole,
  UserProfile,
  Comment 
} from './types';
import { Header } from './components/Header';
import { ProductHeader } from './components/ProductHeader';
import { FeedbackCard } from './components/FeedbackCard';
import { FeedbackDetailPage } from './components/FeedbackDetailPage';
import { ProfilePage } from './components/ProfilePage';
import { ProductPage } from './components/ProductPage';
import { CompanyPage } from './components/CompanyPage';
import { InternalDocsPage } from './components/InternalDocsPage';
import { SettingsPage } from './components/SettingsPage';
import { SubmitFeedbackModal } from './components/SubmitFeedbackModal';
import { AddProductModal } from './components/AddProductModal';
import { FloatingActionButton } from './components/FloatingActionButton';
import { ShareModal } from './components/ShareModal';
import { AuthModal } from './components/AuthModal';
import { ClaimOrgModal } from './components/ClaimOrgModal';
import { AdminConsoleModal } from './components/AdminConsoleModal';
import { FilterDropdown } from './components/FilterDropdown';
import { 
  getStoredProfile, 
  saveStoredProfile, 
  getHandleFromProfileRoute,
  loadProfile 
} from './lib/profileStorage';
import { 
  bootstrapFirestoreData, 
  subscribeToFeedback, 
  subscribeToCompanies, 
  subscribeToProducts, 
  subscribeToNotifications,
  syncFeedbackDoc,
  deleteFeedbackDoc,
  syncCompanyDoc,
  syncProductDoc,
  dispatchRealtimeNotification,
  markNotificationAsReadInDb,
  deleteNotificationInDb,
  clearAllNotificationsInDb,
  subscribeToAuthUser,
  logOutFirebaseUser,
  syncUserProfileDoc,
  RealtimeNotification
} from './lib/firebase';
import {
  getUserUpvotedIds,
  toggleUserUpvote,
  getUserRepostedIds,
  toggleUserRepost,
  getUserFollowedProducts,
  setUserFollowedProducts,
  getUserFollowedUsers,
  setUserFollowedUsers,
  getUserDismissedNotifIds,
  markUserDismissedNotif,
  getUserReadNotifIds,
  markUserReadNotif,
} from './lib/userInteractionStorage';

export default function App() {
  // Products, Companies & Feedback Data
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>(INITIAL_FEEDBACK);
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);

  // User Profile & Authentication State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      const activeHandle = localStorage.getItem('crowdpulse_active_handle');
      if (activeHandle) {
        const stored = loadProfile(activeHandle);
        return {
          id: `usr-${activeHandle}`,
          name: stored?.name || activeHandle,
          email: `${activeHandle}@community.crowdpulse.dev`,
          handle: `@${stored?.handle || activeHandle}`,
          avatar: stored?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
          role: 'user',
          companyOrOrg: stored?.org || '',
          bio: stored?.bio || '',
          followerCount: 0,
          followingCount: 0,
        };
      }
    }
    return {
      id: 'usr-albert',
      name: 'Albert N.',
      email: 'albertnkhata.s@gmail.com',
      handle: '@albert',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
      role: 'admin',
      roleTitle: 'Platform Administrator',
      companyOrOrg: 'CrowdPulse',
      companyId: 'comp-crowdpulse',
      bio: 'Platform Administrator and Founder at CrowdPulse.',
      joinedDate: 'March 2024',
      followerCount: 28,
      followingCount: 14,
    };
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const userRole: UserRole = currentUser?.role || 'user';

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('crowdpulse_active_handle', user.handle.replace(/^@/, ''));
    }
  };

  const [interactionTick, setInteractionTick] = useState(0);

  // Firebase Real-time Synchronization & Bootstrap
  useEffect(() => {
    // 1. Seed sample data if Firestore is fresh
    bootstrapFirestoreData();

    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    const upvotedIds = getUserUpvotedIds(userKey);
    const repostedIds = getUserRepostedIds(userKey);

    // 2. Real-time subscription to Feedback
    const unsubFeedback = subscribeToFeedback((liveFeedback) => {
      const mergedMap = new Map<string, FeedbackItem>();
      INITIAL_FEEDBACK.forEach((item) => mergedMap.set(item.id, item));
      liveFeedback.forEach((item) => mergedMap.set(item.id, item));
      const combined = Array.from(mergedMap.values()).map((item) => ({
        ...item,
        hasUserVoted: upvotedIds.has(item.id),
        hasUserReposted: repostedIds.has(item.id),
      }));
      setFeedbackItems(combined);
      if (detailItem) {
        const found = combined.find((f) => f.id === detailItem.id);
        if (found) setDetailItem(found);
      }
    });

    // 3. Real-time subscription to Companies
    const unsubCompanies = subscribeToCompanies((liveCompanies) => {
      const mergedMap = new Map<string, Company>();
      INITIAL_COMPANIES.forEach((c) => mergedMap.set(c.id, c));
      liveCompanies.forEach((c) => mergedMap.set(c.id, c));
      const combined = Array.from(mergedMap.values());
      setCompanies(combined);
      if (viewingCompany) {
        const found = combined.find((c) => c.id === viewingCompany.id);
        if (found) setViewingCompany(found);
      }
    });

    // 4. Real-time subscription to Products
    const unsubProducts = subscribeToProducts((liveProducts) => {
      const mergedMap = new Map<string, Product>();
      INITIAL_PRODUCTS.forEach((p) => mergedMap.set(p.id, p));
      liveProducts.forEach((p) => mergedMap.set(p.id, p));
      const combined = Array.from(mergedMap.values());
      setProducts(combined);
      if (viewingProduct) {
        const found = combined.find((p) => p.id === viewingProduct.id);
        if (found) setViewingProduct(found);
      }
    });

    // 5. Real-time subscription to Notifications (strictly siloed per account)
    const userTarget = currentUser ? { id: currentUser.id, handle: currentUser.handle } : 'guest';
    const unsubNotifications = subscribeToNotifications(userTarget, (liveNotifs) => {
      const notifMap = new Map<string, RealtimeNotification>();
      const isAlbert = currentUser?.email === 'albertnkhata.s@gmail.com' || 
                       currentUser?.handle === '@albert' || 
                       currentUser?.id === 'usr-albert';
      if (isAlbert) {
        INITIAL_NOTIFICATIONS.forEach((n) => notifMap.set(n.id, n));
      }
      liveNotifs.forEach((n) => notifMap.set(n.id, n));
      
      const dismissedIds = getUserDismissedNotifIds(userKey);
      const readIds = getUserReadNotifIds(userKey);

      const combined = Array.from(notifMap.values())
        .filter((n) => !dismissedIds.has(n.id))
        .map((n) => readIds.has(n.id) ? { ...n, isRead: true } : n)
        .sort((a, b) => {
          const timeA = a.timestamp || parseInt(a.id.replace(/\D/g, ''), 10) || 0;
          const timeB = b.timestamp || parseInt(b.id.replace(/\D/g, ''), 10) || 0;
          return timeB - timeA;
        });
      setNotifications(combined);
    });

    // 6. Real-time subscription to Firebase Auth state
    const unsubAuth = subscribeToAuthUser((authUser) => {
      if (authUser) {
        setCurrentUser(authUser);
      }
    });

    return () => {
      unsubFeedback();
      unsubCompanies();
      unsubProducts();
      unsubNotifications();
      unsubAuth();
    };
  }, [currentUser?.id, currentUser?.handle, currentUser?.email, interactionTick]);

  // Sync feedback upvotes/reposts whenever currentUser changes
  useEffect(() => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    const upvotedIds = getUserUpvotedIds(userKey);
    const repostedIds = getUserRepostedIds(userKey);
    setFeedbackItems((prev) =>
      prev.map((item) => ({
        ...item,
        hasUserVoted: upvotedIds.has(item.id),
        hasUserReposted: repostedIds.has(item.id),
      }))
    );
  }, [currentUser?.id, currentUser?.handle, interactionTick]);

  // Live Toast Banner State
  const [activeToast, setActiveToast] = useState<RealtimeNotification | null>(null);

  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  const handleMarkNotificationRead = async (id: string) => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    markUserReadNotif(userKey, id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await markNotificationAsReadInDb(id);
  };

  const handleDismissNotification = async (id: string) => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    markUserDismissedNotif(userKey, id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await deleteNotificationInDb(id);
  };

  const handleMarkAllNotificationsRead = async () => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    notifications.forEach((n) => markUserReadNotif(userKey, n.id));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    for (const notif of notifications) {
      if (!notif.isRead) {
        await markNotificationAsReadInDb(notif.id);
      }
    }
  };

  const handleClearNotifications = async () => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    notifications.forEach((n) => markUserDismissedNotif(userKey, n.id));
    setNotifications([]);
    await clearAllNotificationsInDb(currentUser?.id || 'all');
  };

  // Product Filter
  const [selectedProductId, setSelectedProductId] = useState<string | 'all'>('all');
  
  // Feed Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'trending' | 'top' | 'newest' | 'shipped'>('trending');
  
  // Modals & Navigation
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [viewingCompany, setViewingCompany] = useState<Company | null>(null);
  const [viewingInternalDocs, setViewingInternalDocs] = useState(false);
  const [viewingSettings, setViewingSettings] = useState(false);
  const [shareItem, setShareItem] = useState<FeedbackItem | null>(null);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [claimCompanyTarget, setClaimCompanyTarget] = useState<Company | null>(null);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [isAdminConsoleOpen, setIsAdminConsoleOpen] = useState(false);

  // Claim Organization Handlers
  const handleOpenClaimOrg = (company: Company) => {
    setClaimCompanyTarget(company);
    setIsClaimModalOpen(true);
  };

  const handleClaimOrgSuccess = (
    companyId: string,
    claimant: { name: string; email: string; roleTitle: string }
  ) => {
    const newMemberId = `vm-${Date.now()}`;
    const newHandle = `@${claimant.name.toLowerCase().replace(/\s+/g, '_')}_pm`;
    const newAvatar = currentUser?.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80';

    const newMember: VerifiedTeamMember = {
      id: newMemberId,
      name: claimant.name,
      handle: newHandle,
      avatar: newAvatar,
      roleTitle: claimant.roleTitle,
    };

    // 1. Update company in companies state and Firestore
    let updatedCompanyDoc: Company | null = null;
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id === companyId) {
          const updated = {
            ...c,
            isClaimed: true,
            claimedById: newMemberId,
            claimedByName: claimant.name,
            claimedAt: 'Just now',
            verifiedMembers: [newMember, ...c.verifiedMembers],
          };
          updatedCompanyDoc = updated;
          return updated;
        }
        return c;
      })
    );
    if (updatedCompanyDoc) {
      syncCompanyDoc(updatedCompanyDoc);
    }

    // 2. Automatically subsume all products under this company in state and Firestore
    setProducts((prev) =>
      prev.map((p) => {
        if (p.companyId === companyId) {
          const subsumed = {
            ...p,
            verifiedOwner: true,
            officialTeamName: `${p.companyName || 'Official'} Product Team`,
          };
          syncProductDoc(subsumed);
          return subsumed;
        }
        return p;
      })
    );

    // 3. Dispatch real-time notification
    dispatchRealtimeNotification({
      id: `notif-${Date.now()}`,
      userId: 'all',
      actorName: claimant.name,
      actorAvatar: newAvatar,
      title: `${claimant.name} Claimed Organisation!`,
      message: `Verified ownership of ${companies.find((c) => c.id === companyId)?.name || 'the organisation'}. All suite products are now subsumed and verified.`,
      type: 'claim',
      isRead: false,
      createdAt: 'Just now',
    });

    // 3. Update current user to be the PM of this company
    const targetCompany = companies.find((c) => c.id === companyId);
    const companyName = targetCompany?.name || 'Verified Org';
    const nextUser: UserProfile = {
      id: currentUser?.id || `usr-${Date.now()}`,
      name: claimant.name,
      email: claimant.email,
      handle: newHandle,
      avatar: newAvatar,
      role: 'company_pm',
      roleTitle: claimant.roleTitle,
      companyOrOrg: companyName,
      companyId: companyId,
      bio: `${claimant.roleTitle} at ${companyName}, overseeing product intelligence and community feedback.`,
      location: targetCompany?.hqLocation || 'San Francisco, CA',
      joinedDate: 'October 2026',
      followerCount: (currentUser?.followerCount || 28) + 120,
      followingCount: currentUser?.followingCount || 14,
    };
    setCurrentUser(nextUser);

    // 4. Update viewing company if currently viewing it
    if (viewingCompany && viewingCompany.id === companyId) {
      setViewingCompany((prev) =>
        prev
          ? {
              ...prev,
              isClaimed: true,
              claimedById: newMemberId,
              claimedByName: claimant.name,
              claimedAt: 'Just now',
              verifiedMembers: [newMember, ...prev.verifiedMembers],
            }
          : null
      );
    }
  };

  const handleInviteOrgMember = (
    companyId: string,
    member: { name: string; email: string; roleTitle: string }
  ) => {
    const newMember: VerifiedTeamMember = {
      id: `vm-${Date.now()}`,
      name: member.name,
      handle: `@${member.name.toLowerCase().replace(/\s+/g, '_')}`,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
      roleTitle: member.roleTitle,
    };

    let updatedComp: Company | null = null;
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id === companyId) {
          const updated = { ...c, verifiedMembers: [...c.verifiedMembers, newMember] };
          updatedComp = updated;
          return updated;
        }
        return c;
      })
    );
    if (updatedComp) {
      syncCompanyDoc(updatedComp);
    }

    if (viewingCompany && viewingCompany.id === companyId) {
      setViewingCompany((prev) =>
        prev ? { ...prev, verifiedMembers: [...prev.verifiedMembers, newMember] } : null
      );
    }
  };

  // Add Product Handler
  const handleAddProduct = (newProduct: Product) => {
    setProducts((prev) => [newProduct, ...prev]);
    handleOpenProduct(newProduct);
  };

  // Followed Products (Siloed per user account)
  const [followedProductIds, setFollowedProductIds] = useState<string[]>(() => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    return getUserFollowedProducts(userKey);
  });

  // Followed Users (Siloed per user account)
  const [followedUserHandles, setFollowedUserHandles] = useState<string[]>(() => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    return getUserFollowedUsers(userKey);
  });

  // Re-sync followed items whenever active user changes
  useEffect(() => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    setFollowedProductIds(getUserFollowedProducts(userKey));
    setFollowedUserHandles(getUserFollowedUsers(userKey));
  }, [currentUser?.id, currentUser?.handle]);

  const handleToggleFollowProduct = (productId: string) => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    setFollowedProductIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      setUserFollowedProducts(userKey, next);
      return next;
    });
  };

  const handleToggleFollowUser = (handle: string) => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    setFollowedUserHandles((prev) => {
      const next = prev.includes(handle)
        ? prev.filter((h) => h !== handle)
        : [...prev, handle];
      setUserFollowedUsers(userKey, next);
      return next;
    });
  };

  // Navigate to full feedback page
  const handleOpenDetails = (item: FeedbackItem) => {
    setViewingCompany(null);
    setViewingProfile(null);
    setViewingProduct(null);
    setDetailItem(item);
    window.location.hash = `#feedback-${item.id}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigate to user profile page
  const handleOpenProfile = (handle: string, name?: string, avatar?: string) => {
    setDetailItem(null);
    setViewingCompany(null);
    setViewingProduct(null);
    if (currentUser && (handle === currentUser.handle || handle === '@you')) {
      setViewingProfile(currentUser);
      window.location.hash = `#profile-${currentUser.handle.replace('@', '')}`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const isSarah = handle.toLowerCase() === '@sarah_pm' || handle.toLowerCase().includes('sarah');
    const isPM = isSarah || handle.includes('pm') || handle.includes('official') || handle.includes('cursor') || handle.includes('anthropic');
    const isAdmin = handle.includes('admin') || handle.includes('alex');

    const userObj: UserProfile = {
      id: `usr-${handle.replace('@', '')}`,
      name: isSarah ? 'Sarah Chen' : (name || handle.replace('@', '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())),
      email: isSarah ? 'sarah.pm@cursor.sh' : `${handle.replace('@', '')}@community.crowdpulse.dev`,
      handle: isSarah ? '@sarah_pm' : handle,
      avatar: isSarah 
        ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80' 
        : (avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80'),
      role: isAdmin ? 'admin' : (isPM ? 'company_pm' : 'user'),
      roleTitle: isSarah ? 'Lead Product Manager' : (isPM ? 'Product Manager' : (isAdmin ? 'Platform Administrator' : undefined)),
      companyOrOrg: isSarah ? 'Anysphere' : (isAdmin ? 'CrowdPulse' : (isPM ? 'Verified Partner' : 'Community Contributor')),
      companyId: isSarah ? 'comp-anysphere' : (isAdmin ? 'comp-crowdpulse' : undefined),
      bio: isSarah
        ? 'Lead Product Manager at Anysphere, shaping the future of Cursor with AI coding agents and intelligent developer workflows.'
        : isAdmin
        ? 'Platform Administrator and Founder at CrowdPulse, stewarding community feedback and transparent product intelligence.'
        : isPM 
        ? 'Official Product Team member reviewing feedback and deploying improvements.'
        : 'Active builder & community member testing dev tools and sharing feedback.',
      location: 'San Francisco, CA',
      joinedDate: isSarah ? 'March 2024' : 'August 2026',
      followerCount: isSarah ? 342 : (isPM ? 186 : 42),
      followingCount: isSarah ? 48 : (isPM ? 35 : 29),
    };
    setViewingProfile(userObj);
    window.location.hash = `#profile-${handle.replace('@', '')}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigate to product page
  const handleOpenProduct = (product: Product) => {
    setViewingInternalDocs(false);
    setDetailItem(null);
    setViewingProfile(null);
    setViewingCompany(null);
    setViewingProduct(product);
    window.location.hash = `#product-${product.slug}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigate to company page
  const handleOpenCompany = (companyOrIdOrSlug: Company | string) => {
    let targetCompany: Company | undefined;
    if (typeof companyOrIdOrSlug === 'object') {
      targetCompany = companyOrIdOrSlug;
    } else {
      const q = companyOrIdOrSlug.toLowerCase();
      targetCompany = companies.find(
        (c) => c.id.toLowerCase() === q || c.slug.toLowerCase() === q || c.name.toLowerCase() === q
      );
    }
    if (targetCompany) {
      setViewingInternalDocs(false);
      setDetailItem(null);
      setViewingProfile(null);
      setViewingProduct(null);
      setViewingCompany(targetCompany);
      window.location.hash = `#org-${targetCompany.slug}`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Navigate to internal docs page
  const handleOpenInternalDocs = () => {
    setDetailItem(null);
    setViewingProfile(null);
    setViewingProduct(null);
    setViewingCompany(null);
    setViewingSettings(false);
    setViewingInternalDocs(true);
    window.location.hash = '#admin-docs';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigate to settings page
  const handleOpenSettings = () => {
    setDetailItem(null);
    setViewingProfile(null);
    setViewingProduct(null);
    setViewingCompany(null);
    setViewingInternalDocs(false);
    setViewingSettings(true);
    window.location.hash = '#settings';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Back to feedback feed
  const handleBackToFeed = () => {
    setDetailItem(null);
    setViewingProfile(null);
    setViewingProduct(null);
    setViewingCompany(null);
    setViewingInternalDocs(false);
    setViewingSettings(false);
    setSelectedProductId('all');
    setStatusFilter('all');
    setCategoryFilter('all');
    if (
      window.location.hash.startsWith('#feedback-') || 
      window.location.hash.startsWith('#profile-') || 
      window.location.hash.startsWith('#product-') ||
      window.location.hash.startsWith('#org-') ||
      window.location.hash.startsWith('#company-') ||
      window.location.hash === '#admin-docs' ||
      window.location.hash === '#settings'
    ) {
      window.history.pushState(null, '', window.location.pathname);
    }
  };

  // Handle URL hash changes (deep linking & browser back/forward button)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#settings') {
        setDetailItem(null);
        setViewingProfile(null);
        setViewingProduct(null);
        setViewingCompany(null);
        setViewingInternalDocs(false);
        setViewingSettings(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (hash === '#admin-docs') {
        setViewingSettings(false);
        setDetailItem(null);
        setViewingProfile(null);
        setViewingProduct(null);
        setViewingCompany(null);
        setViewingInternalDocs(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (hash.startsWith('#feedback-')) {
        const id = hash.replace('#feedback-', '');
        const found = feedbackItems.find((f) => f.id === id);
        if (found) {
          setViewingSettings(false);
          setViewingInternalDocs(false);
          setViewingCompany(null);
          setViewingProduct(null);
          setViewingProfile(null);
          setDetailItem(found);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (hash.startsWith('#profile-')) {
        const cleanHandle = hash.replace('#profile-', '');
        setViewingSettings(false);
        setViewingInternalDocs(false);
        setViewingCompany(null);
        setViewingProduct(null);
        setDetailItem(null);
        handleOpenProfile('@' + cleanHandle);
      } else if (hash.startsWith('#product-')) {
        const slug = hash.replace('#product-', '');
        const found = products.find((p) => p.slug === slug || p.id === slug);
        if (found) {
          setViewingSettings(false);
          setViewingInternalDocs(false);
          setDetailItem(null);
          setViewingCompany(null);
          setViewingProfile(null);
          setViewingProduct(found);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (hash.startsWith('#org-') || hash.startsWith('#company-')) {
        const slug = hash.replace(/^#(org|company)-/, '');
        const found = companies.find((c) => c.slug === slug || c.id === slug);
        if (found) {
          setViewingSettings(false);
          setViewingInternalDocs(false);
          setDetailItem(null);
          setViewingProfile(null);
          setViewingProduct(null);
          setViewingCompany(found);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        setViewingSettings(false);
        setDetailItem(null);
        setViewingProfile(null);
        setViewingProduct(null);
        setViewingCompany(null);
        setViewingInternalDocs(false);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('popstate', handleHash);
    return () => {
      window.removeEventListener('hashchange', handleHash);
      window.removeEventListener('popstate', handleHash);
    };
  }, [feedbackItems, products, companies]);

  // Voting action: Upvote (+1)
  const handleVote = (itemId: string) => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    const nextVoted = toggleUserUpvote(userKey, itemId);
    setInteractionTick((t) => t + 1);

    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextCount = nextVoted ? item.meTooCount + 1 : Math.max(0, item.meTooCount - 1);
          const updated = {
            ...item,
            hasUserVoted: nextVoted,
            meTooCount: nextCount,
          };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );

    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
      const synced = itemToSync as FeedbackItem;
      const authorTarget = (synced.authorHandle || '').replace(/^@/, '').toLowerCase();
      const currentCleanHandle = (currentUser?.handle || '').replace(/^@/, '').toLowerCase();

      // Only dispatch notification if item is upvoted and author is someone else
      if (nextVoted && authorTarget && authorTarget !== currentCleanHandle) {
        const targetProd = products.find((p) => p.id === synced.productId);
        const voteNotif: RealtimeNotification = {
          id: `notif-${Date.now()}`,
          userId: authorTarget,
          actorName: currentUser?.name || 'A builder',
          actorHandle: currentUser?.handle || '@builder',
          actorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&auto=format&fit=crop&q=80',
          title: `+1 Upvote on ${targetProd?.name || 'Signal'}`,
          message: `${currentUser?.name || 'A builder'} upvoted "${synced.title}" (now at ${synced.meTooCount} upvotes)!`,
          type: 'vote',
          targetFeedbackId: itemId,
          targetProductId: synced.productId,
          isRead: false,
          createdAt: new Date().toISOString(),
          timestamp: Date.now(),
        };
        dispatchRealtimeNotification(voteNotif);
      }
    }

    // If modal is open for this item, keep it synced
    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          hasUserVoted: nextVoted,
          meTooCount: nextVoted ? prev.meTooCount + 1 : Math.max(0, prev.meTooCount - 1),
        };
      });
    }
  };

  // Share / Repost action
  const handleShare = (itemId: string) => {
    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    const nextReposted = toggleUserRepost(userKey, itemId);
    setInteractionTick((t) => t + 1);

    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated = {
            ...item,
            hasUserReposted: nextReposted,
            repostCount: nextReposted ? item.repostCount + 1 : Math.max(0, item.repostCount - 1),
          };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );
    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
    }
  };

  // Add comment
  const handleAddComment = (itemId: string, text: string, type: Comment['type']) => {
    let authorRoleBadge: Comment['roleBadge'] = 'user';
    if (userRole === 'admin') authorRoleBadge = 'admin_verified';
    else if (userRole === 'company_pm') authorRoleBadge = 'team_verified';

    const newComment: Comment = {
      id: `c-${Date.now()}`,
      authorName: currentUser ? (userRole === 'company_pm' ? `${currentUser.name} (PM)` : userRole === 'admin' ? `${currentUser.name} (Admin)` : currentUser.name) : 'User',
      authorHandle: currentUser?.handle || '@user',
      authorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&auto=format&fit=crop&q=80',
      roleBadge: authorRoleBadge,
      text,
      createdAt: new Date().toISOString(),
      type,
      likes: 1,
    };

    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated = {
            ...item,
            comments: [newComment, ...item.comments],
          };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );

    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
      const synced = itemToSync as FeedbackItem;
      const authorTarget = (synced.authorHandle || '').replace(/^@/, '').toLowerCase();
      const currentCleanHandle = (currentUser?.handle || '').replace(/^@/, '').toLowerCase();

      // Only notify the original author if someone else commented on their submission
      if (authorTarget && authorTarget !== currentCleanHandle) {
        const commentNotif: RealtimeNotification = {
          id: `notif-${Date.now()}`,
          userId: authorTarget,
          actorName: newComment.authorName,
          actorHandle: currentUser?.handle,
          actorAvatar: newComment.authorAvatar,
          title: `New Comment on "${synced.title}"`,
          message: `${newComment.authorName}: "${text.slice(0, 75)}${text.length > 75 ? '...' : ''}"`,
          type: 'reply',
          targetFeedbackId: itemId,
          isRead: false,
          createdAt: new Date().toISOString(),
          timestamp: Date.now(),
        };
        dispatchRealtimeNotification(commentNotif);
        setActiveToast(commentNotif);
      }
    }

    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) =>
        prev
          ? {
              ...prev,
              comments: [newComment, ...prev.comments],
            }
          : null
      );
    }
  };

  // Author / Admin Edit Feedback
  const handleEditFeedback = (
    itemId: string,
    updates: {
      title: string;
      experienceDescription: string;
      desiredChange?: string;
      category: FeedbackCategory;
      severity: Severity;
      tags: string[];
    }
  ) => {
    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated: FeedbackItem = {
            ...item,
            ...updates,
            isEdited: true,
            editedAt: new Date().toISOString(),
          };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );

    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
    }

    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) =>
        prev
          ? {
              ...prev,
              ...updates,
              isEdited: true,
              editedAt: new Date().toISOString(),
            }
          : null
      );
    }
  };

  // Author / Admin Withdraw Feedback
  const handleWithdrawFeedback = (itemId: string) => {
    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated: FeedbackItem = {
            ...item,
            isWithdrawn: true,
            statusUpdateNote: item.statusUpdateNote || 'Withdrawn by author',
          };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );

    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
    }

    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) =>
        prev
          ? {
              ...prev,
              isWithdrawn: true,
              statusUpdateNote: prev.statusUpdateNote || 'Withdrawn by author',
            }
          : null
      );
    }
  };

  // Author / Admin Delete Feedback
  const handleDeleteFeedback = (itemId: string) => {
    const itemToDelete = feedbackItems.find((i) => i.id === itemId);
    if (itemToDelete) {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id === itemToDelete.productId) {
            const updated = { ...p, totalFeedbackCount: Math.max(0, p.totalFeedbackCount - 1) };
            syncProductDoc(updated);
            return updated;
          }
          return p;
        })
      );
    }
    setFeedbackItems((prev) => prev.filter((i) => i.id !== itemId));
    deleteFeedbackDoc(itemId);
    setDetailItem(null);
  };

  // Author / Admin Edit Comment
  const handleEditComment = (itemId: string, commentId: string, newText: string) => {
    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated: FeedbackItem = {
            ...item,
            comments: item.comments.map((c) =>
              c.id === commentId ? { ...c, text: newText, isEdited: true, editedAt: 'Just now' } : c
            ),
          };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );

    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
    }

    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === commentId ? { ...c, text: newText, isEdited: true, editedAt: 'Just now' } : c
              ),
            }
          : null
      );
    }
  };

  // Author / Admin Delete Comment
  const handleDeleteComment = (itemId: string, commentId: string) => {
    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated = { ...item, comments: item.comments.filter((c) => c.id !== commentId) };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );
    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
    }
    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) =>
        prev
          ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }
          : null
      );
    }
  };

  // Admin Product Verification Toggle
  const handleToggleVerifyProduct = (productId: string) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const updated = { ...p, verifiedOwner: !p.verifiedOwner };
          syncProductDoc(updated);
          return updated;
        }
        return p;
      })
    );
    if (viewingProduct && viewingProduct.id === productId) {
      setViewingProduct((prev) =>
        prev ? { ...prev, verifiedOwner: !prev.verifiedOwner } : null
      );
    }
  };

  // Admin Delete Product
  const handleDeleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setFeedbackItems((prev) => prev.filter((i) => i.productId !== productId));
    setViewingProduct(null);
    handleBackToFeed();
  };

  // PM Status Update
  const handleUpdateStatus = (
    itemId: string,
    newStatus: FeedbackStatus,
    note: string
  ) => {
    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated = {
            ...item,
            status: newStatus,
            statusUpdateNote: note,
            statusUpdatedAt: 'Just now',
            statusUpdatedBy: currentUser?.name || 'Product Team',
          };
          itemToSync = updated;
          return updated;
        }
        return item;
      })
    );

    if (itemToSync) {
      syncFeedbackDoc(itemToSync);
      const syncedItem = itemToSync as FeedbackItem;
      const targetProd = products.find((p) => p.id === syncedItem.productId);
      const authorTarget = (syncedItem.authorHandle || '').replace(/^@/, '').toLowerCase();
      const statusNotif: RealtimeNotification = {
        id: `notif-${Date.now()}`,
        userId: authorTarget || 'usr-albert',
        actorName: currentUser?.name || 'Verified PM',
        actorHandle: currentUser?.handle,
        actorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80',
        title: `${targetProd?.name || 'Product'} • Status: ${newStatus.replace('_', ' ').toUpperCase()}`,
        message: `${currentUser?.name || 'Verified PM'} moved "${syncedItem.title}" to ${newStatus.replace('_', ' ')}. ${note ? `"${note}"` : ''}`,
        type: newStatus === 'shipped' ? 'status_shipped' : 'status_progress',
        targetFeedbackId: itemId,
        targetProductId: syncedItem.productId,
        isRead: false,
        createdAt: new Date().toISOString(),
        timestamp: Date.now(),
      };
      dispatchRealtimeNotification(statusNotif);
      setActiveToast(statusNotif);
    }

    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
              statusUpdateNote: note,
              statusUpdatedAt: new Date().toISOString(),
              statusUpdatedBy: currentUser?.name || 'Product Team',
            }
          : null
      );
    }
  };

  // Submit new feedback item
  const handleCreateFeedback = (newItem: {
    productId: string;
    title: string;
    experienceDescription: string;
    desiredChange?: string;
    category: FeedbackCategory;
    severity: Severity;
    tags: string[];
    imageUrl?: string;
    images?: string[];
  }) => {
    const nowIso = new Date().toISOString();
    const itemToAdd: FeedbackItem = {
      id: `fb-${Date.now()}`,
      productId: newItem.productId,
      title: newItem.title,
      experienceDescription: newItem.experienceDescription,
      desiredChange: newItem.desiredChange || '',
      category: newItem.category,
      severity: newItem.severity,
      status: 'under_review',
      meTooCount: 1,
      hasUserVoted: true,
      repostCount: 0,
      hasUserReposted: false,
      createdAt: nowIso,
      authorName: currentUser?.name || 'You',
      authorHandle: currentUser?.handle || '@you',
      authorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&auto=format&fit=crop&q=80',
      tags: newItem.tags,
      imageUrl: newItem.imageUrl,
      images: newItem.images,
      comments: [],
    };

    setFeedbackItems((prev) => [itemToAdd, ...prev]);
    syncFeedbackDoc(itemToAdd);

    const userKey = currentUser?.id || currentUser?.handle || 'guest';
    toggleUserUpvote(userKey, itemToAdd.id);
    setInteractionTick((t) => t + 1);

    const targetProd = products.find((p) => p.id === newItem.productId);
    const signalNotif: RealtimeNotification = {
      id: `notif-${Date.now()}`,
      userId: 'broadcast',
      actorName: currentUser?.name || 'Community Member',
      actorHandle: currentUser?.handle,
      actorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&auto=format&fit=crop&q=80',
      title: `New Signal on ${targetProd?.name || 'Product'}`,
      message: `${currentUser?.name || 'A builder'} reported: "${newItem.title}" (${newItem.category.toUpperCase()})`,
      type: 'new_signal',
      targetFeedbackId: itemToAdd.id,
      targetProductId: newItem.productId,
      isRead: false,
      createdAt: nowIso,
      timestamp: Date.now(),
    };
    dispatchRealtimeNotification(signalNotif);
    setActiveToast(signalNotif);

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === newItem.productId) {
          const updated = { ...p, totalFeedbackCount: p.totalFeedbackCount + 1 };
          syncProductDoc(updated);
          return updated;
        }
        return p;
      })
    );
  };

  // Filter & Sort pipeline
  const filteredItems = useMemo(() => {
    return feedbackItems
      .filter((item) => {
        if (selectedProductId !== 'all' && item.productId !== selectedProductId) {
          return false;
        }

        if (statusFilter !== 'all') {
          if (statusFilter === 'open' || statusFilter === 'active') {
            if (item.status !== 'under_review' && (item.status as any) !== 'considering') return false;
          } else if (item.status !== statusFilter) {
            return false;
          }
        }

        if (categoryFilter !== 'all' && item.category !== categoryFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'trending') {
          return b.meTooCount + b.repostCount * 2 - (a.meTooCount + a.repostCount * 2);
        } else if (sortBy === 'top') {
          return b.meTooCount - a.meTooCount;
        } else if (sortBy === 'newest') {
          return b.id.localeCompare(a.id);
        } else if (sortBy === 'shipped') {
          const aShipped = a.status === 'shipped' ? 1 : 0;
          const bShipped = b.status === 'shipped' ? 1 : 0;
          return bShipped - aShipped;
        }
        return 0;
      });
  }, [feedbackItems, selectedProductId, statusFilter, categoryFilter, sortBy]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-150">
      {/* Top Global Navigation */}
      <Header
        currentUser={currentUser}
        notifications={notifications}
        onSelectNotificationFeedback={(feedbackId) => {
          const item = feedbackItems.find((f) => f.id === feedbackId);
          if (item) handleOpenDetails(item);
        }}
        onClearNotifications={handleClearNotifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onDismissNotification={handleDismissNotification}
        onOpenLogin={() => setIsAuthOpen(true)}
        onLogout={async () => {
          try {
            await logOutFirebaseUser();
          } catch (e) {
            console.warn(e);
          }
          if (typeof window !== 'undefined') {
            localStorage.removeItem('crowdpulse_active_handle');
          }
          setCurrentUser(null);
          if (viewingProfile && currentUser && viewingProfile.handle === currentUser.handle) {
            setViewingProfile(null);
          }
        }}
        onOpenSubmit={() => setIsSubmitOpen(true)}
        onLogoClick={handleBackToFeed}
        onViewProfile={() => {
          if (currentUser) {
            handleOpenProfile(currentUser.handle, currentUser.name, currentUser.avatar);
          }
        }}
        onOpenSettings={handleOpenSettings}
        onOpenInternalDocs={handleOpenInternalDocs}
        onOpenAdminConsole={() => setIsAdminConsoleOpen(true)}
      />

      {/* Main Container */}
      <div className="flex-1 pb-16">
        {viewingSettings ? (
          <SettingsPage onBack={handleBackToFeed} />
        ) : viewingInternalDocs ? (
          <InternalDocsPage
            onBack={() => {
              if (currentUser) {
                handleOpenProfile(currentUser.handle, currentUser.name, currentUser.avatar);
              } else {
                handleBackToFeed();
              }
            }}
          />
        ) : viewingCompany ? (
          <CompanyPage
            company={viewingCompany}
            products={products}
            feedbackItems={feedbackItems}
            currentUser={currentUser}
            onBack={handleBackToFeed}
            onOpenProduct={handleOpenProduct}
            onOpenDetails={handleOpenDetails}
            onVote={handleVote}
            onOpenShare={setShareItem}
            onOpenProfile={handleOpenProfile}
            onClaimOrg={handleOpenClaimOrg}
            onInviteMember={handleInviteOrgMember}
            onAddProductToOrg={(_comp) => {
              setIsAddProductOpen(true);
            }}
          />
        ) : viewingProduct ? (
          <ProductPage
            product={viewingProduct}
            company={companies.find(
              (c) => c.id === viewingProduct.companyId || c.name.toLowerCase() === (viewingProduct.companyName || '').toLowerCase()
            )}
            feedbackItems={feedbackItems}
            userRole={userRole}
            onBack={handleBackToFeed}
            onOpenDetails={handleOpenDetails}
            onVote={handleVote}
            onOpenShare={setShareItem}
            onOpenSubmit={() => {
              setIsSubmitOpen(true);
            }}
            onToggleVerifyProduct={handleToggleVerifyProduct}
            onDeleteProduct={handleDeleteProduct}
            onOpenProfile={handleOpenProfile}
            onOpenCompany={handleOpenCompany}
            isFollowing={followedProductIds.includes(viewingProduct.id)}
            onToggleFollow={handleToggleFollowProduct}
          />
        ) : viewingProfile ? (
          <ProfilePage
            profile={viewingProfile}
            isCurrentUser={Boolean(currentUser && viewingProfile.handle === currentUser.handle)}
            feedbackItems={feedbackItems}
            products={products}
            onBack={handleBackToFeed}
            onOpenDetails={handleOpenDetails}
            onVote={handleVote}
            onOpenShare={setShareItem}
            isFollowing={followedUserHandles.includes(viewingProfile.handle)}
            onToggleFollow={() => handleToggleFollowUser(viewingProfile.handle)}
            onUpdateProfile={(updated) => {
              if (currentUser && viewingProfile.handle === currentUser.handle) {
                const nextUser = { ...currentUser, ...updated };
                setCurrentUser(nextUser);
                setViewingProfile(nextUser);
                syncUserProfileDoc(nextUser);
              }
            }}
            onOpenProduct={handleOpenProduct}
            companies={companies}
            onOpenCompany={handleOpenCompany}
            onOpenInternalDocs={handleOpenInternalDocs}
            onOpenAdminConsole={() => setIsAdminConsoleOpen(true)}
            onOpenProfile={handleOpenProfile}
          />
        ) : detailItem ? (
          <FeedbackDetailPage
            item={detailItem}
            product={products.find((p) => p.id === detailItem.productId)}
            userRole={userRole}
            currentUser={currentUser}
            onBack={handleBackToFeed}
            onVote={handleVote}
            onOpenShare={setShareItem}
            onAddComment={handleAddComment}
            onUpdateStatus={handleUpdateStatus}
            onDeleteFeedback={handleDeleteFeedback}
            onEditFeedback={handleEditFeedback}
            onWithdrawFeedback={handleWithdrawFeedback}
            onDeleteComment={handleDeleteComment}
            onEditComment={handleEditComment}
            onOpenProfile={handleOpenProfile}
            onOpenProduct={handleOpenProduct}
            onOpenCompany={handleOpenCompany}
          />
        ) : (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-12 w-full">
            {/* Horizontal Product Explorer */}
            <ProductHeader
              products={products}
              selectedProductId={selectedProductId}
              onSelectProduct={setSelectedProductId}
              onOpenSubmit={() => setIsSubmitOpen(true)}
              onOpenProductPage={handleOpenProduct}
            />

            {/* Content Feed Section */}
            <div className="pt-6">
              {/* Filter and Sorting Controls Toolbar */}
              <div className="relative z-30 flex items-center justify-between gap-2 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
                {/* Left: Feedback Sorting items (Trending, Top, Newest) on the left end */}
                <div className="flex items-center gap-0.5 sm:gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60 flex-shrink-0">
                  {[
                    { id: 'trending', label: 'Trending' },
                    { id: 'top', label: 'Top' },
                    { id: 'newest', label: 'Newest' },
                  ].map((sortOption) => (
                    <button
                      key={sortOption.id}
                      onClick={() => setSortBy(sortOption.id as any)}
                      className={`px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-medium transition-all cursor-pointer ${
                        sortBy === sortOption.id
                          ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs font-semibold'
                          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                      }`}
                    >
                      {sortOption.label}
                    </button>
                  ))}
                </div>

                {/* Right: Custom Modern Status & Category Dropdowns grouped on the opposite (right) end */}
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-shrink-0">
                  <FilterDropdown
                    label="Status"
                    selectedValue={statusFilter}
                    onSelect={setStatusFilter}
                    options={[
                      { id: 'all', label: 'All Statuses' },
                      { id: 'open', label: 'Open' },
                      { id: 'planned', label: 'Planned' },
                      { id: 'in_progress', label: 'In Progress' },
                      { id: 'shipped', label: 'Shipped' },
                    ]}
                  />

                  <FilterDropdown
                    label="Type"
                    selectedValue={categoryFilter}
                    onSelect={setCategoryFilter}
                    options={[
                      { id: 'all', label: 'All Types' },
                      { id: 'bug', label: 'Bugs' },
                      { id: 'ux', label: 'UX / Usability' },
                      { id: 'feature', label: 'Features' },
                      { id: 'performance', label: 'Performance' },
                    ]}
                  />
                </div>
              </div>

              {/* Feed List Grid */}
              {filteredItems.length === 0 ? (
                <div className="py-16 text-center text-xs text-zinc-400">
                  No feedback found matching the current filters.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredItems.map((item) => {
                    const itemProduct = products.find((p) => p.id === item.productId);
                    return (
                      <FeedbackCard
                        key={item.id}
                        item={item}
                        product={itemProduct}
                        onVote={handleVote}
                        onOpenDetails={handleOpenDetails}
                        onOpenShare={setShareItem}
                        onOpenProfile={handleOpenProfile}
                        onOpenProduct={handleOpenProduct}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Button (Clean + icon with creation options) */}
      <FloatingActionButton
        onOpenFeedback={() => setIsSubmitOpen(true)}
        onOpenAddProduct={() => setIsAddProductOpen(true)}
      />

      {/* Submit Feedback Modal with Live Duplicate Detector */}
      {isSubmitOpen && (
        <SubmitFeedbackModal
          products={products}
          existingItems={feedbackItems}
          defaultProductId={viewingProduct ? viewingProduct.id : undefined}
          onClose={() => setIsSubmitOpen(false)}
          onSubmit={handleCreateFeedback}
          onVoteExisting={handleVote}
          onSelectExistingToView={handleOpenDetails}
        />
      )}

      {/* Add Product Modal */}
      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        onAddProduct={handleAddProduct}
        existingProducts={products}
      />

      {/* Share / Rally Modal */}
      <ShareModal
        item={shareItem}
        product={products.find((p) => p.id === shareItem?.productId)}
        onClose={() => setShareItem(null)}
        onConfirmShare={handleShare}
      />

      {/* Claim Organization Modal with Product Subsumption */}
      <ClaimOrgModal
        isOpen={isClaimModalOpen}
        company={claimCompanyTarget}
        subsumedProducts={products.filter((p) => p.companyId === claimCompanyTarget?.id)}
        currentUser={currentUser}
        onClose={() => {
          setIsClaimModalOpen(false);
          setClaimCompanyTarget(null);
        }}
        onClaim={handleClaimOrgSuccess}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLogin={handleLogin}
      />

      {/* Admin Console Modal */}
      {currentUser && (
        <AdminConsoleModal
          isOpen={isAdminConsoleOpen}
          currentUser={currentUser}
          companies={companies}
          onClose={() => setIsAdminConsoleOpen(false)}
          onUpdateCompany={(updated) => {
            setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            syncCompanyDoc(updated);
          }}
          onUpdateCurrentUser={(updated) => {
            setCurrentUser(updated);
            syncUserProfileDoc(updated);
          }}
        />
      )}

      {/* Real-time In-App Notification Toast */}
      {activeToast && (
        <aside 
          aria-label="Notification alert"
          className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl p-4 shadow-2xl flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200"
        >
          <img
            src={activeToast.actorAvatar}
            alt={activeToast.actorName}
            className="w-9 h-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold text-xs text-zinc-900 dark:text-white truncate">
                {activeToast.title}
              </span>
              <button
                type="button"
                onClick={() => setActiveToast(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
                aria-label="Close notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
              {activeToast.message}
            </p>
            {activeToast.targetFeedbackId && (
              <button
                type="button"
                onClick={() => {
                  handleMarkNotificationRead(activeToast.id);
                  const target = feedbackItems.find((f) => f.id === activeToast.targetFeedbackId);
                  if (target) handleOpenDetails(target);
                  setActiveToast(null);
                }}
                className="mt-2 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View Signal</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
