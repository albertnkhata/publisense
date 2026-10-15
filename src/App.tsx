/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { UnclaimOrgModal } from './components/UnclaimOrgModal';
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
  updateUserProfileEverywhere,
  disassociateUsersFromCompany,
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
import {
  getPersistedActiveUser,
  persistActiveUser,
  signOutActiveUser,
} from './lib/authService';

export default function App() {
  // Products, Companies & Feedback Data
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>(INITIAL_FEEDBACK);
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);

  // User Profile & Authentication State (siloed and persistent)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return getPersistedActiveUser();
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authPromptMessage, setAuthPromptMessage] = useState<string | undefined>(undefined);
  const userRole: UserRole = currentUser?.role || 'user';

  // Automatic Domain-Based & Claim-Based Team Onboarding helper
  const checkAndOnboardDomainTeam = useCallback((user: UserProfile, companyList: Company[]): UserProfile => {
    if (!user) return user;

    // 1. If user is already assigned a companyId, ensure it is actively claimed and user is authorized
    if (user.companyId) {
      const comp = companyList.find((c) => c.id === user.companyId || c.slug === user.companyId);
      if (comp && comp.isClaimed) {
        const isOrgOwner = user.id === comp.claimedById || Boolean(comp.verifiedMembers?.some((m) => m.id === user.id && m.role === 'org_admin'));
        const isMember = isOrgOwner || Boolean(comp.verifiedMembers?.some((m) => m.id === user.id || m.handle?.toLowerCase() === user.handle?.toLowerCase()));
        if (isMember) {
          return {
            ...user,
            companyId: comp.id,
            companyOrOrg: comp.name,
            role: user.role === 'admin' ? 'admin' : 'company_pm',
            roleTitle: user.roleTitle || (isOrgOwner ? 'Organization Admin' : 'Verified Team Member'),
          };
        }
      }

      // If company is unclaimed, revoked, or user is not an authorized member: purge association completely
      const isPlatformAdmin = user.role === 'admin';
      const cleanedUser: UserProfile = {
        ...user,
        companyId: undefined,
        companyOrOrg: undefined,
        role: isPlatformAdmin ? 'admin' : 'user',
        roleTitle: isPlatformAdmin ? 'Platform Administrator' : undefined,
      };
      persistActiveUser(cleanedUser);
      syncUserProfileDoc(cleanedUser);
      saveStoredProfile((cleanedUser.handle || '').replace(/^@/, ''), {
        name: cleanedUser.name,
        org: '',
        bio: cleanedUser.bio || '',
        avatar: cleanedUser.avatar,
        handle: cleanedUser.handle,
        role: isPlatformAdmin ? 'Platform Administrator' : '',
      });
      return cleanedUser;
    }

    // 2. Match if user is claimant or verified member of any claimed company
    const claimedComp = companyList.find((c) =>
      c.isClaimed && (
        c.claimedById === user.id ||
        c.verifiedMembers?.some((m) =>
          m.id === user.id ||
          (m.handle && m.handle.toLowerCase() === user.handle?.toLowerCase()) ||
          (m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase()) ||
          (m.email && user.workEmail && m.email.toLowerCase() === user.workEmail.toLowerCase())
        )
      )
    );

    if (claimedComp) {
      const isOrgOwner = user.id === claimedComp.claimedById || Boolean(claimedComp.verifiedMembers?.some((m) => m.id === user.id && m.role === 'org_admin'));
      const nextRole: UserRole = user.role === 'admin' ? 'admin' : 'company_pm';
      const nextRoleTitle = user.roleTitle || (isOrgOwner ? 'Organization Admin' : 'Verified Team Member');
      const updatedUser: UserProfile = {
        ...user,
        companyId: claimedComp.id,
        companyOrOrg: claimedComp.name,
        role: nextRole,
        roleTitle: nextRoleTitle,
      };
      persistActiveUser(updatedUser);
      syncUserProfileDoc(updatedUser);
      return updatedUser;
    }

    // 3. Fallback to matching corporate email domain on a claimed company
    const testEmail = user.workEmail || user.email;
    if (testEmail) {
      const cleanEmail = testEmail.toLowerCase().trim();
      const userDomain = cleanEmail.split('@')[1];
      if (userDomain && !['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com'].includes(userDomain)) {
        const matched = companyList.find(
          (c) =>
            c.isClaimed &&
            (c.domain?.toLowerCase() === userDomain ||
              c.allowedDomains?.some((d) => d.toLowerCase() === userDomain))
        );

        if (matched) {
          const alreadyLinked = user.companyId === matched.id;
          const isAlreadyMember = matched.verifiedMembers?.some(
            (m) => (m.email && m.email.toLowerCase() === cleanEmail) || m.id === user.id || m.handle === user.handle
          );

          if (alreadyLinked && isAlreadyMember) return user;

          const isOrgOwner = user.id === matched.claimedById || user.name?.toLowerCase() === matched.claimedByName?.toLowerCase();
          const nextRole: UserRole = user.role === 'admin' ? 'admin' : 'company_pm';
          const nextRoleTitle = user.roleTitle || (isOrgOwner ? 'Organization Admin' : 'Verified Team Member');

          const updatedUser: UserProfile = {
            ...user,
            role: nextRole,
            roleTitle: nextRoleTitle,
            companyId: matched.id,
            companyOrOrg: matched.name,
          };

          if (!isAlreadyMember) {
            const newMember: VerifiedTeamMember = {
              id: user.id || `vm-${Date.now()}`,
              name: user.name,
              handle: user.handle,
              avatar: user.avatar,
              roleTitle: nextRoleTitle,
              role: isOrgOwner ? 'org_admin' : 'team_member',
              email: user.email,
              joinedAt: 'Just now',
            };

            const updatedCompany: Company = {
              ...matched,
              verifiedMembers: [...(matched.verifiedMembers || []), newMember],
            };

            setCompanies((prev) => prev.map((c) => (c.id === matched.id ? updatedCompany : c)));
            syncCompanyDoc(updatedCompany);
          }

          syncUserProfileDoc(updatedUser);
          persistActiveUser(updatedUser);
          return updatedUser;
        }
      }
    }

    // 4. Strict Invariant: If user still has an unverified or unclaimed company affiliation, purge it completely
    if (user.companyId || user.companyOrOrg) {
      const isPlatformAdmin = user.role === 'admin';
      const cleanedUser: UserProfile = {
        ...user,
        companyId: undefined,
        companyOrOrg: undefined,
        role: isPlatformAdmin ? 'admin' : 'user',
        roleTitle: isPlatformAdmin ? 'Platform Administrator' : undefined,
      };
      persistActiveUser(cleanedUser);
      syncUserProfileDoc(cleanedUser);
      saveStoredProfile((cleanedUser.handle || '').replace(/^@/, ''), {
        name: cleanedUser.name,
        org: '',
        bio: cleanedUser.bio || '',
        avatar: cleanedUser.avatar,
        handle: cleanedUser.handle,
        role: isPlatformAdmin ? 'Platform Administrator' : '',
      });
      return cleanedUser;
    }

    return user;
  }, []);

  const handleOpenLogin = (prompt?: string) => {
    setAuthPromptMessage(prompt);
    setIsAuthOpen(true);
  };

  const handleLogin = (user: UserProfile) => {
    const linked = checkAndOnboardDomainTeam(user, companies);
    setCurrentUser(linked);
    persistActiveUser(linked);
    setAuthPromptMessage(undefined);
  };

  useEffect(() => {
    const handleAuthChange = (e: Event) => {
      const customEvent = e as CustomEvent<UserProfile | null>;
      if (customEvent.detail !== undefined) {
        setCurrentUser(customEvent.detail);
      }
    };

    const handleOtpDispatched = (e: Event) => {
      const customEvent = e as CustomEvent<{ email: string; code: string; companyName: string }>;
      if (customEvent.detail) {
        const { email, code, companyName } = customEvent.detail;
        setActiveToast({
          id: `otp-${Date.now()}`,
          userId: 'all',
          actorName: companyName,
          actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop',
          title: `Verification Code: ${code}`,
          message: `Dispatched to ${email}. Enter this 6-digit code to complete claiming ${companyName}.`,
          type: 'system',
          isRead: false,
          createdAt: 'Just now',
          timestamp: Date.now(),
        });
      }
    };

    // Clean up legacy mock upvotes and reposts from local storage
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem('crowdpulse_legacy_cleanup_v2')) {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('crowdpulse_silo_upvotes_') || key.startsWith('crowdpulse_silo_reposts_')) {
            localStorage.removeItem(key);
          }
        });
        localStorage.setItem('crowdpulse_legacy_cleanup_v2', 'true');
      }
    } catch {}

    const handleAccountDeletedEvent = () => {
      handleAccountDeleted();
    };

    window.addEventListener('crowdpulse_auth_state_change', handleAuthChange);
    window.addEventListener('crowdpulse_otp_dispatched', handleOtpDispatched);
    window.addEventListener('crowdpulse_account_deleted', handleAccountDeletedEvent);
    return () => {
      window.removeEventListener('crowdpulse_auth_state_change', handleAuthChange);
      window.removeEventListener('crowdpulse_otp_dispatched', handleOtpDispatched);
      window.removeEventListener('crowdpulse_account_deleted', handleAccountDeletedEvent);
    };
  }, []);

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
      const combined = Array.from(mergedMap.values()).map((comp) => {
        // Enforce single org_admin invariant per claimed company to eliminate double claims
        if (comp.isClaimed && comp.verifiedMembers && comp.verifiedMembers.length > 0) {
          let hasOrgAdmin = false;
          const sanitizedMembers = comp.verifiedMembers.map((m) => {
            const isPrimaryClaimer = comp.claimedById ? m.id === comp.claimedById : false;
            if (isPrimaryClaimer) {
              hasOrgAdmin = true;
              return { ...m, role: 'org_admin' as const };
            }
            if (m.role === 'org_admin') {
              if (!hasOrgAdmin) {
                hasOrgAdmin = true;
                return m;
              } else {
                return { ...m, role: 'team_member' as const };
              }
            }
            return m;
          });
          return { ...comp, verifiedMembers: sanitizedMembers };
        }
        return comp;
      });
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
        const linked = checkAndOnboardDomainTeam(authUser, companies);
        setCurrentUser(linked);
      } else {
        const persisted = getPersistedActiveUser();
        if (!persisted) {
          setCurrentUser(null);
        } else {
          const linked = checkAndOnboardDomainTeam(persisted, companies);
          setCurrentUser(linked);
        }
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
  const [unclaimCompanyTarget, setUnclaimCompanyTarget] = useState<Company | null>(null);
  const [isUnclaimModalOpen, setIsUnclaimModalOpen] = useState(false);
  const [isAdminConsoleOpen, setIsAdminConsoleOpen] = useState(false);

  const handleOpenSubmit = (productId?: string) => {
    if (!currentUser) {
      handleOpenLogin('Sign in to submit feedback and track resolution.');
      return;
    }
    if (productId) {
      const prod = products.find((p) => p.id === productId);
      if (prod) setViewingProduct(prod);
    }
    setIsSubmitOpen(true);
  };

  const handleOpenAddProduct = () => {
    if (!currentUser) {
      handleOpenLogin('Sign in to add new developer products to the directory.');
      return;
    }
    setIsAddProductOpen(true);
  };

  // Claim Organization Handlers
  const handleOpenClaimOrg = (company: Company) => {
    if (!currentUser) {
      handleOpenLogin('Sign in with your company email to verify and claim your organization.');
      return;
    }
    if (company.isClaimed) {
      setActiveToast({
        id: `toast-${Date.now()}`,
        userId: currentUser.id,
        actorName: 'Access Control',
        actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop',
        type: 'system',
        title: 'Already Claimed',
        message: `${company.name} has already been claimed and verified by an Organization Admin. Multiple claims are not permitted.`,
        timestamp: Date.now(),
        createdAt: 'Just now',
        isRead: false,
      });
      return;
    }
    setClaimCompanyTarget(company);
    setIsClaimModalOpen(true);
  };

  // Unclaim Organization Handlers
  const handleOpenUnclaimOrg = (company: Company) => {
    if (!currentUser) {
      handleOpenLogin('Sign in to manage organization ownership.');
      return;
    }
    const isAuthorized =
      currentUser.role === 'admin' ||
      userRole === 'admin' ||
      currentUser.id === company.claimedById ||
      (currentUser.handle && (currentUser.handle.toLowerCase() === '@publisense' || currentUser.handle.toLowerCase() === '@crowdpulse') && company.id === 'comp-crowdpulse') ||
      (currentUser.companyId === company.id && (currentUser.role === 'company_pm' || userRole === 'company_pm')) ||
      (currentUser.companyOrOrg && currentUser.companyOrOrg.toLowerCase() === company.name.toLowerCase() && (currentUser.role === 'company_pm' || userRole === 'company_pm')) ||
      Boolean(
        company.verifiedMembers?.some(
          (m) =>
            (m.role === 'org_admin' || m.id === company.claimedById) &&
            (m.id === currentUser.id ||
              (m.email && currentUser.email && m.email.toLowerCase() === currentUser.email.toLowerCase()) ||
              (currentUser.workEmail && m.email && m.email.toLowerCase() === currentUser.workEmail.toLowerCase()) ||
              (m.handle && currentUser.handle && m.handle.toLowerCase() === currentUser.handle.toLowerCase()))
        )
      );

    if (!isAuthorized) {
      setActiveToast({
        id: `toast-${Date.now()}`,
        userId: currentUser.id,
        actorName: 'Access Control',
        actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop',
        type: 'system',
        title: 'Action Restricted',
        message: 'Only the claiming Organization Admin or Platform Admins can unclaim this organization.',
        timestamp: Date.now(),
        createdAt: 'Just now',
        isRead: false,
      });
      return;
    }
    setUnclaimCompanyTarget(company);
    setIsUnclaimModalOpen(true);
  };

  const handleOpenAdminConsole = () => {
    if (!currentUser) {
      handleOpenLogin('Sign in with an administrator account to access platform triage controls.');
      return;
    }
    if (userRole !== 'admin' && userRole !== 'company_pm') {
      setActiveToast({
        id: `toast-${Date.now()}`,
        userId: currentUser.id,
        actorName: 'Access Control',
        actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop',
        type: 'system',
        title: 'Access Restricted',
        message: 'Only verified administrators and organization product managers can access the triage console.',
        timestamp: Date.now(),
        createdAt: 'Just now',
        isRead: false,
      });
      return;
    }
    setIsAdminConsoleOpen(true);
  };

  const handleClaimOrgSuccess = async (
    companyId: string,
    claimant: { name: string; email: string; roleTitle: string }
  ) => {
    const claimantUserId = currentUser?.id || `usr-${Date.now()}`;
    const newHandle = currentUser?.handle || `@${claimant.name.toLowerCase().replace(/\s+/g, '_')}`;
    const newAvatar = currentUser?.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80';

    const newMember: VerifiedTeamMember = {
      id: claimantUserId,
      name: claimant.name,
      handle: newHandle,
      avatar: newAvatar,
      roleTitle: claimant.roleTitle,
      role: 'org_admin',
      joinedAt: 'Just now',
      email: claimant.email,
    };

    const existingComp = companies.find((c) => c.id === companyId);
    if (!existingComp) return;

    // Hard enforcement: Claim is strictly available ONLY if org has not already been claimed
    if (existingComp.isClaimed) {
      setActiveToast({
        id: `toast-${Date.now()}`,
        userId: currentUser?.id || 'system',
        actorName: 'Access Control',
        actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop',
        type: 'system',
        title: 'Claim Rejected',
        message: `${existingComp.name} is already claimed. An organization cannot be claimed multiple times.`,
        timestamp: Date.now(),
        createdAt: 'Just now',
        isRead: false,
      });
      return;
    }

    const targetCompName = existingComp.name || 'Organisation';

    // 1. Update company synchronously in state and Firestore
    const updatedCompany: Company = {
      ...existingComp,
      isClaimed: true,
      claimedById: claimantUserId,
      claimedByName: claimant.name,
      claimedAt: 'Just now',
      verifiedMembers: [
        newMember,
        ...(existingComp.verifiedMembers || [])
          .filter(
            (m) => m.id !== claimantUserId && m.handle !== newHandle && (m.email ? m.email.toLowerCase() !== claimant.email.toLowerCase() : true)
          )
          .map((m) => ({
            ...m,
            role: 'team_member' as const,
          })),
      ],
    };

    setCompanies((prev) => prev.map((c) => (c.id === companyId ? updatedCompany : c)));
    await syncCompanyDoc(updatedCompany);

    // 2. Automatically subsume all products under this company in state and Firestore
    setProducts((prev) =>
      prev.map((p) => {
        if (p.companyId === companyId || (p.companyName && p.companyName.toLowerCase() === targetCompName.toLowerCase())) {
          const subsumed: Product = {
            ...p,
            companyId,
            verifiedOwner: true,
            officialTeamName: `${p.companyName || targetCompName} Product Team`,
          };
          syncProductDoc(subsumed);
          return subsumed;
        }
        return p;
      })
    );

    // 3. Dispatch real-time notification
    await dispatchRealtimeNotification({
      id: `notif-${Date.now()}`,
      userId: 'all',
      actorName: claimant.name,
      actorAvatar: newAvatar,
      title: `${claimant.name} Claimed ${targetCompName}!`,
      message: `Verified corporate domain and became Organization Admin for ${targetCompName}. All suite products are now subsumed and verified.`,
      type: 'claim',
      isRead: false,
      createdAt: 'Just now',
    });

    // 4. Update current user to be the Organization Admin of this company
    const nextUser: UserProfile = {
      ...(currentUser || {}),
      id: claimantUserId,
      name: claimant.name,
      email: currentUser?.email || claimant.email,
      workEmail: claimant.email,
      handle: newHandle,
      avatar: newAvatar,
      role: currentUser?.role === 'admin' ? 'admin' : 'company_pm',
      roleTitle: claimant.roleTitle || 'Organization Admin & Product Lead',
      companyOrOrg: targetCompName,
      companyId: companyId,
      bio: `${claimant.roleTitle || 'Organization Admin'} at ${targetCompName}, overseeing product intelligence, team verification, and community feedback.`,
      location: existingComp.hqLocation || currentUser?.location || 'San Francisco, CA',
      joinedDate: currentUser?.joinedDate || 'October 2026',
      followerCount: currentUser?.followerCount || 0,
      followingCount: currentUser?.followingCount || 0,
    };
    setCurrentUser(nextUser);
    persistActiveUser(nextUser);
    await syncUserProfileDoc(nextUser);
    saveStoredProfile(newHandle.replace(/^@/, ''), {
      name: nextUser.name,
      org: targetCompName,
      bio: nextUser.bio || '',
      avatar: nextUser.avatar,
      handle: nextUser.handle,
      role: nextUser.roleTitle || 'Organization Admin',
    });

    // 5. Update viewing company if currently viewing it
    if (viewingCompany && viewingCompany.id === companyId) {
      setViewingCompany(updatedCompany);
    }

    setActiveToast({
      id: `toast-${Date.now()}`,
      userId: 'all',
      actorName: targetCompName,
      actorAvatar: existingComp.logo,
      type: 'system',
      title: `${targetCompName} Claimed Successfully!`,
      message: `You are now the verified Organization Admin for ${targetCompName}.`,
      timestamp: Date.now(),
      createdAt: 'Just now',
      isRead: false,
    });
  };

  const handleUnclaimOrgSuccess = async (companyId: string) => {
    const targetComp = companies.find((c) => c.id === companyId);
    if (!targetComp) return;
    const targetCompName = targetComp.name || 'Organisation';

    // 1. Update company synchronously in state and Firestore
    const updatedCompany: Company = {
      ...targetComp,
      isClaimed: false,
      claimedById: undefined,
      claimedByName: undefined,
      claimedAt: undefined,
      verifiedMembers: [],
      pendingInvites: [],
    };
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? updatedCompany : c)));
    await syncCompanyDoc(updatedCompany);

    // 2. Remove verified badges from all subsumed products in state and Firestore
    setProducts((prev) =>
      prev.map((p) => {
        if (p.companyId === companyId || (p.companyName && p.companyName.toLowerCase() === targetCompName.toLowerCase())) {
          const reverted: Product = {
            ...p,
            verifiedOwner: false,
            officialTeamName: undefined,
          };
          syncProductDoc(reverted);
          return reverted;
        }
        return p;
      })
    );

    // 3. Revert current user if associated with this company
    if (
      currentUser &&
      (currentUser.companyId === companyId ||
        (currentUser.companyOrOrg && currentUser.companyOrOrg.toLowerCase() === targetCompName.toLowerCase()))
    ) {
      const isPlatformAdmin = currentUser.role === 'admin';
      const revertedUser: UserProfile = {
        ...currentUser,
        role: isPlatformAdmin ? 'admin' : 'user',
        roleTitle: isPlatformAdmin ? 'Platform Administrator' : undefined,
        companyOrOrg: undefined,
        companyId: undefined,
        workEmail: isPlatformAdmin ? currentUser.workEmail : undefined,
        bio: isPlatformAdmin
          ? (currentUser.bio?.replace(/at .*?(\.|$)/i, '.') || 'Platform Administrator and community feedback coordinator.')
          : 'Community contributor and active product feedback participant.',
      };
      setCurrentUser(revertedUser);
      persistActiveUser(revertedUser);
      await syncUserProfileDoc(revertedUser);
      saveStoredProfile((revertedUser.handle || '').replace(/^@/, ''), {
        name: revertedUser.name,
        org: '',
        bio: revertedUser.bio || '',
        avatar: revertedUser.avatar,
        handle: revertedUser.handle,
        role: isPlatformAdmin ? 'Platform Administrator' : '',
      });
    }

    // Also clean up stored profile caches for all former verified members & claimant
    if (targetComp.verifiedMembers && targetComp.verifiedMembers.length > 0) {
      targetComp.verifiedMembers.forEach((m) => {
        saveStoredProfile(m.handle.replace(/^@/, ''), {
          name: m.name,
          org: '',
          bio: '',
          avatar: m.avatar,
          handle: m.handle,
          role: '',
        });
      });
    }

    // Persistently disassociate all Firestore user records linked to this company
    await disassociateUsersFromCompany(companyId, targetCompName);

    // 4. Update viewingCompany state if user is currently looking at this company
    if (viewingCompany && viewingCompany.id === companyId) {
      setViewingCompany(updatedCompany);
    }

    // Update viewingProfile state if user is currently looking at a profile affected by this unclaim
    if (
      viewingProfile &&
      (viewingProfile.companyId === companyId ||
        (viewingProfile.companyOrOrg && viewingProfile.companyOrOrg.toLowerCase() === targetCompName.toLowerCase()))
    ) {
      const isPlatformAdmin = viewingProfile.role === 'admin';
      setViewingProfile({
        ...viewingProfile,
        companyId: undefined,
        companyOrOrg: undefined,
        role: isPlatformAdmin ? 'admin' : 'user',
        roleTitle: isPlatformAdmin ? 'Platform Administrator' : undefined,
      });
    }

    // 5. Dispatch real-time public audit notification
    await dispatchRealtimeNotification({
      id: `notif-${Date.now()}`,
      userId: 'all',
      actorName: currentUser?.name || 'Administrator',
      actorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
      title: `${targetCompName} Unclaimed`,
      message: `${currentUser?.name || 'Administrator'} released ownership of ${targetCompName}. Verified badges removed and products returned to community management.`,
      type: 'claim',
      isRead: false,
      createdAt: 'Just now',
    });

    setActiveToast({
      id: `toast-${Date.now()}`,
      userId: 'all',
      actorName: targetCompName,
      actorAvatar: targetComp.logo,
      type: 'system',
      title: `${targetCompName} Unclaimed`,
      message: `Organization ownership for ${targetCompName} released successfully. All verified badges have been revoked.`,
      timestamp: Date.now(),
      createdAt: 'Just now',
      isRead: false,
    });
  };

  const handleInviteOrgMember = (
    companyId: string,
    member: { name: string; email: string; roleTitle: string }
  ) => {
    const targetComp = companies.find((c) => c.id === companyId);
    if (!targetComp) return;

    const newMember: VerifiedTeamMember = {
      id: `vm-${Date.now()}`,
      name: member.name,
      handle: `@${member.name.toLowerCase().replace(/\s+/g, '_')}`,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
      roleTitle: member.roleTitle,
      role: 'team_member',
      email: member.email,
      joinedAt: 'Just now',
    };

    const updatedComp: Company = {
      ...targetComp,
      verifiedMembers: [...(targetComp.verifiedMembers || []), newMember],
    };

    setCompanies((prev) => prev.map((c) => (c.id === companyId ? updatedComp : c)));
    syncCompanyDoc(updatedComp);

    if (viewingCompany && viewingCompany.id === companyId) {
      setViewingCompany(updatedComp);
    }
  };



  // Unified Profile Update Handler (cascades name, handle, avatar, bio to feed, comments, company claims, and database)
  const handleUserProfileUpdate = async (updated: Partial<UserProfile>) => {
    if (!currentUser) return;
    const prevUser = currentUser;
    const nextUser: UserProfile = { ...prevUser, ...updated };

    setCurrentUser(nextUser);
    persistActiveUser(nextUser);

    if (viewingProfile && (viewingProfile.handle === prevUser.handle || viewingProfile.id === prevUser.id)) {
      setViewingProfile(nextUser);
    }

    // 1. Immediately update all feedbackItems authored by this user or comments by this user
    setFeedbackItems((prev) =>
      prev.map((item) => {
        const isAuthor =
          item.authorHandle === prevUser.handle ||
          item.authorHandle === nextUser.handle ||
          (prevUser.role === 'admin' && (item.authorHandle === '@albert' || item.authorName === prevUser.name));

        const updatedComments = item.comments?.map((c) => {
          if (
            c.authorHandle === prevUser.handle ||
            c.authorHandle === nextUser.handle ||
            (prevUser.role === 'admin' && (c.authorHandle === '@albert' || c.authorName === prevUser.name))
          ) {
            return {
              ...c,
              authorName: nextUser.name,
              author: nextUser.name,
              authorAvatar: nextUser.avatar,
              authorHandle: nextUser.handle,
            };
          }
          return c;
        });

        if (isAuthor || (updatedComments && updatedComments !== item.comments)) {
          return {
            ...item,
            ...(isAuthor
              ? {
                  authorName: nextUser.name,
                  author: nextUser.name,
                  authorAvatar: nextUser.avatar,
                  authorHandle: nextUser.handle,
                }
              : {}),
            comments: updatedComments || item.comments,
          };
        }
        return item;
      })
    );

    // 2. Update active detailItem if open
    setDetailItem((prev) => {
      if (!prev) return null;
      const isAuthor =
        prev.authorHandle === prevUser.handle ||
        prev.authorHandle === nextUser.handle ||
        (prevUser.role === 'admin' && (prev.authorHandle === '@albert' || prev.authorName === prevUser.name));

      const updatedComments = prev.comments?.map((c) => {
        if (
          c.authorHandle === prevUser.handle ||
          c.authorHandle === nextUser.handle ||
          (prevUser.role === 'admin' && (c.authorHandle === '@albert' || c.authorName === prevUser.name))
        ) {
          return {
            ...c,
            authorName: nextUser.name,
            author: nextUser.name,
            authorAvatar: nextUser.avatar,
            authorHandle: nextUser.handle,
          };
        }
        return c;
      });

      if (isAuthor || (updatedComments && updatedComments !== prev.comments)) {
        return {
          ...prev,
          ...(isAuthor
            ? {
                authorName: nextUser.name,
                author: nextUser.name,
                authorAvatar: nextUser.avatar,
                authorHandle: nextUser.handle,
              }
            : {}),
          comments: updatedComments || prev.comments,
        };
      }
      return prev;
    });

    // 3. Update companies in React state
    setCompanies((prev) =>
      prev.map((comp) => {
        const isClaimedByMe =
          comp.claimedById === prevUser.id ||
          comp.claimedByName === prevUser.name ||
          (prevUser.role === 'admin' && comp.id === 'comp-crowdpulse');

        const updatedMembers = comp.verifiedMembers?.map((m) => {
          if (
            m.handle === prevUser.handle ||
            m.handle === nextUser.handle ||
            (prevUser.role === 'admin' && (m.handle === '@albert' || m.name === prevUser.name))
          ) {
            return {
              ...m,
              name: nextUser.name,
              handle: nextUser.handle,
              avatar: nextUser.avatar,
            };
          }
          return m;
        });

        if (isClaimedByMe || updatedMembers) {
          return {
            ...comp,
            ...(isClaimedByMe ? { claimedByName: nextUser.name } : {}),
            verifiedMembers: updatedMembers || comp.verifiedMembers,
          };
        }
        return comp;
      })
    );

    // 4. Update viewingCompany if active
    if (viewingCompany) {
      setViewingCompany((prev) => {
        if (!prev) return null;
        const isClaimedByMe =
          prev.claimedById === prevUser.id ||
          prev.claimedByName === prevUser.name ||
          (prevUser.role === 'admin' && prev.id === 'comp-crowdpulse');

        const updatedMembers = prev.verifiedMembers?.map((m) => {
          if (
            m.handle === prevUser.handle ||
            m.handle === nextUser.handle ||
            (prevUser.role === 'admin' && (m.handle === '@albert' || m.name === prevUser.name))
          ) {
            return {
              ...m,
              name: nextUser.name,
              handle: nextUser.handle,
              avatar: nextUser.avatar,
            };
          }
          return m;
        });

        return {
          ...prev,
          ...(isClaimedByMe ? { claimedByName: nextUser.name } : {}),
          verifiedMembers: updatedMembers || prev.verifiedMembers,
        };
      });
    }

    // 5. Persist everywhere to Firestore
    try {
      await updateUserProfileEverywhere(prevUser, updated);
    } catch (e) {
      console.warn('Background profile cascade notice:', e);
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
    if (!currentUser) {
      handleOpenLogin('Sign in to follow products and receive updates when feedback status changes.');
      return;
    }
    const userKey = currentUser.id || currentUser.handle;
    setFollowedProductIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      setUserFollowedProducts(userKey, next);
      return next;
    });
  };

  const handleToggleFollowUser = (handle: string) => {
    if (!currentUser) {
      handleOpenLogin('Sign in to follow builders and track their activity.');
      return;
    }
    const userKey = currentUser.id || currentUser.handle;
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

    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const cleanKey = cleanHandle.replace(/^@/, '');
    const isAdmin = cleanKey === 'albert' || cleanKey.includes('admin');
    const isPM = cleanKey.includes('pm') || cleanKey.includes('official');

    const pulseComp = companies.find((c) => c.id === 'comp-crowdpulse');
    const isPulseClaimed = Boolean(pulseComp && pulseComp.isClaimed);

    const userObj: UserProfile = {
      id: `usr-${cleanKey}`,
      name: name || cleanKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      email: `${cleanKey}@community.publisense.dev`,
      handle: cleanHandle,
      avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
      role: isAdmin ? 'admin' : (isPM ? 'company_pm' : 'user'),
      roleTitle: isAdmin ? 'Platform Administrator' : (isPM ? 'Product Manager' : undefined),
      companyOrOrg: isAdmin ? (isPulseClaimed ? 'Publisense' : '') : (isPM ? 'Verified Partner' : ''),
      companyId: isAdmin ? (isPulseClaimed ? 'comp-crowdpulse' : undefined) : undefined,
      bio: isAdmin
        ? (isPulseClaimed ? 'Platform Administrator and Founder at Publisense.' : 'Platform Administrator and community feedback coordinator.')
        : isPM 
        ? 'Official Product Team member reviewing feedback and deploying improvements.'
        : 'Active builder & community member testing dev tools and sharing feedback on Publisense.',
      location: 'San Francisco, CA',
      joinedDate: 'October 2026',
      followerCount: 0,
      followingCount: 0,
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

  // Handle Account Deletion Success
  const handleAccountDeleted = () => {
    const deletedUser = currentUser;
    setCurrentUser(null);
    setNotifications([]);
    setIsAdminConsoleOpen(false);
    setViewingSettings(false);
    setViewingProfile(null);
    setDetailItem(null);
    setViewingProduct(null);
    setViewingCompany(null);
    setViewingInternalDocs(false);
    setIsSubmitOpen(false);
    setIsAddProductOpen(false);
    setIsClaimModalOpen(false);
    setIsUnclaimModalOpen(false);

    if (window.location.hash) {
      window.history.pushState(null, '', window.location.pathname);
    }

    if (deletedUser) {
      const cleanHandle = (deletedUser.handle || '').toLowerCase().replace(/^@/, '');
      const dName = (deletedUser.name || '').toLowerCase();

      setFeedbackItems((prev) =>
        prev.map((item) => {
          let changed = false;
          let newAuthorName = item.authorName;
          let newAuthorHandle = item.authorHandle;
          let newAuthorAvatar = item.authorAvatar;

          const isItemAuthor = Boolean(
            (item.authorHandle && item.authorHandle.toLowerCase().replace(/^@/, '') === cleanHandle) ||
            (item.authorName && dName && item.authorName.toLowerCase() === dName && item.authorHandle?.toLowerCase().replace(/^@/, '') === cleanHandle)
          );

          if (isItemAuthor) {
            newAuthorName = 'Deleted User';
            newAuthorHandle = '@deleted';
            newAuthorAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80';
            changed = true;
          }

          let updatedComments = item.comments;
          if (Array.isArray(item.comments) && item.comments.length > 0) {
            let commentsChanged = false;
            const mapped = item.comments.map((c) => {
              const isCommentAuthor = Boolean(
                (c.authorHandle && c.authorHandle.toLowerCase().replace(/^@/, '') === cleanHandle) ||
                (c.authorName && dName && c.authorName.toLowerCase() === dName && c.authorHandle?.toLowerCase().replace(/^@/, '') === cleanHandle)
              );
              if (isCommentAuthor) {
                commentsChanged = true;
                return {
                  ...c,
                  authorName: 'Deleted User',
                  authorHandle: '@deleted',
                  authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
                  roleBadge: undefined,
                };
              }
              return c;
            });
            if (commentsChanged) {
              updatedComments = mapped;
              changed = true;
            }
          }

          return changed
            ? {
                ...item,
                authorName: newAuthorName,
                authorHandle: newAuthorHandle,
                authorAvatar: newAuthorAvatar,
                comments: updatedComments,
              }
            : item;
        })
      );
    }

    setActiveToast({
      id: `toast-${Date.now()}`,
      userId: 'guest',
      actorName: 'Publisense',
      actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop&crop=faces',
      type: 'system',
      title: 'Account deleted',
      message: 'Your account and personal credentials have been removed. Public submissions have been anonymized.',
      timestamp: Date.now(),
      createdAt: 'Just now',
      isRead: true,
    });
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
    if (!currentUser) {
      handleOpenLogin('Sign in to upvote issues and subscribe to resolution updates.');
      return;
    }
    const userKey = currentUser.id || currentUser.handle;
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
      const currentCleanHandle = (currentUser.handle || '').replace(/^@/, '').toLowerCase();

      // Only dispatch notification if item is upvoted and author is someone else
      if (nextVoted && authorTarget && authorTarget !== currentCleanHandle) {
        const targetProd = products.find((p) => p.id === synced.productId);
        const voteNotif: RealtimeNotification = {
          id: `notif-${Date.now()}`,
          userId: authorTarget,
          actorName: currentUser.name || 'A builder',
          actorHandle: currentUser.handle || '@builder',
          actorAvatar: currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&auto=format&fit=crop&q=80',
          title: `+1 Upvote on ${targetProd?.name || 'Signal'}`,
          message: `${currentUser.name || 'A builder'} upvoted "${synced.title}" (now at ${synced.meTooCount} upvotes)!`,
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
    if (!currentUser) {
      handleOpenLogin('Sign in to repost and boost issues to the community signal queue.');
      return;
    }
    const userKey = currentUser.id || currentUser.handle;
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
    if (!currentUser) {
      handleOpenLogin('Sign in to join the discussion and post comments.');
      return;
    }
    const targetItemForComment = feedbackItems.find((item) => item.id === itemId);
    const targetProductForComment = targetItemForComment ? products.find((p) => p.id === targetItemForComment.productId) : null;
    const isOwnerOrg = Boolean(
      (currentUser.role === 'company_pm' || userRole === 'company_pm') &&
      targetProductForComment &&
      (
        (currentUser.companyId && targetProductForComment.companyId && currentUser.companyId === targetProductForComment.companyId) ||
        (currentUser.companyOrOrg && targetProductForComment.companyName && currentUser.companyOrOrg.trim().toLowerCase() === targetProductForComment.companyName.trim().toLowerCase())
      )
    );

    let authorRoleBadge: Comment['roleBadge'] = 'user';
    let authorDisplayName = currentUser.name;
    if (userRole === 'admin') {
      authorRoleBadge = 'admin_verified';
      authorDisplayName = `${currentUser.name} (Admin)`;
    } else if (isOwnerOrg) {
      authorRoleBadge = 'team_verified';
      authorDisplayName = `${currentUser.name} (PM)`;
    }

    const newComment: Comment = {
      id: `c-${Date.now()}`,
      authorName: authorDisplayName,
      authorHandle: currentUser.handle || '@user',
      authorAvatar: currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&auto=format&fit=crop&q=80',
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
    if (!currentUser) {
      handleOpenLogin('Sign in with a verified account to update feedback status.');
      return;
    }

    const targetFeedback = feedbackItems.find((f) => f.id === itemId);
    const targetProd = targetFeedback ? products.find((p) => p.id === targetFeedback.productId) : null;

    const isGlobalAdmin = currentUser.role === 'admin' || userRole === 'admin';
    const isOwnerOrgPM = Boolean(
      (currentUser.role === 'company_pm' || userRole === 'company_pm' || currentUser.companyId) &&
      targetProd &&
      (
        (currentUser.companyId && targetProd.companyId && currentUser.companyId === targetProd.companyId) ||
        (currentUser.companyOrOrg && targetProd.companyName && currentUser.companyOrOrg.trim().toLowerCase() === targetProd.companyName.trim().toLowerCase())
      )
    );

    if (!isGlobalAdmin && !isOwnerOrgPM) {
      setActiveToast({
        id: `toast-${Date.now()}`,
        userId: currentUser.id,
        actorName: 'Access Control',
        actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop',
        title: 'Permission Denied',
        message: `Only verified PMs belonging to ${targetProd?.companyName || 'this organisation'} can update feedback status and notes.`,
        type: 'status_progress',
        createdAt: 'Just now',
        timestamp: Date.now(),
        isRead: false,
      });
      return;
    }

    const orgAuthorName = targetProd?.companyName || currentUser.companyOrOrg || 'Organisation';

    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated = {
            ...item,
            status: newStatus,
            statusUpdateNote: note,
            statusUpdatedAt: 'Just now',
            statusUpdatedBy: orgAuthorName,
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
      const authorTarget = (syncedItem.authorHandle || '').replace(/^@/, '').toLowerCase();
      const statusNotif: RealtimeNotification = {
        id: `notif-${Date.now()}`,
        userId: authorTarget || 'usr-albert',
        actorName: orgAuthorName,
        actorHandle: currentUser?.handle,
        actorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80',
        title: `${targetProd?.name || 'Product'} • Status: ${newStatus.replace('_', ' ').toUpperCase()}`,
        message: `${orgAuthorName} moved "${syncedItem.title}" to ${newStatus.replace('_', ' ')}. ${note ? `"${note}"` : ''}`,
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
              statusUpdatedBy: orgAuthorName,
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
    if (!currentUser) {
      handleOpenLogin('Sign in to submit feedback and track resolution.');
      return;
    }
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
      authorName: currentUser.name,
      authorHandle: currentUser.handle,
      authorAvatar: currentUser.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&auto=format&fit=crop&q=80',
      tags: newItem.tags,
      imageUrl: newItem.imageUrl,
      images: newItem.images,
      comments: [],
    };

    setFeedbackItems((prev) => [itemToAdd, ...prev]);
    syncFeedbackDoc(itemToAdd);

    const userKey = currentUser.id || currentUser.handle;
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
        onOpenLogin={() => handleOpenLogin()}
        onLogout={async () => {
          try {
            await signOutActiveUser();
          } catch (e) {
            console.warn(e);
          }
          setCurrentUser(null);
          setNotifications([]);
          setIsAdminConsoleOpen(false);
          setViewingSettings(false);
          setIsSubmitOpen(false);
          setIsAddProductOpen(false);
          setIsClaimModalOpen(false);
          if (viewingSettings || viewingInternalDocs || isAdminConsoleOpen) {
            setViewingSettings(false);
            setViewingInternalDocs(false);
            if (window.location.hash === '#settings' || window.location.hash === '#admin-docs') {
              window.history.pushState(null, '', window.location.pathname);
            }
          }
          if (viewingProfile && currentUser && viewingProfile.handle === currentUser.handle) {
            setViewingProfile(null);
            if (window.location.hash.startsWith('#profile-')) {
              window.history.pushState(null, '', window.location.pathname);
            }
          }
          setActiveToast({
            id: `toast-${Date.now()}`,
            userId: 'guest',
            actorName: 'Publisense',
            actorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop&crop=faces',
            type: 'system',
            title: 'Signed out',
            message: 'You have been signed out of your account.',
            timestamp: Date.now(),
            createdAt: 'Just now',
            isRead: true,
          });
        }}
        onOpenSubmit={() => handleOpenSubmit()}
        onLogoClick={handleBackToFeed}
        onViewProfile={() => {
          if (currentUser) {
            handleOpenProfile(currentUser.handle, currentUser.name, currentUser.avatar);
          }
        }}
        onOpenSettings={handleOpenSettings}
        onOpenInternalDocs={handleOpenInternalDocs}
        onOpenAdminConsole={handleOpenAdminConsole}
        onOpenCompany={(companyIdOrName) => {
          if (typeof companyIdOrName === 'object' && companyIdOrName !== null) {
            handleOpenCompany(companyIdOrName);
            return;
          }
          const raw = String(companyIdOrName || '').toLowerCase();
          const comp = companies.find((c) => c.id === companyIdOrName || c.slug === companyIdOrName || c.name.toLowerCase() === raw);
          if (comp) {
            handleOpenCompany(comp);
          } else {
            handleOpenCompany(String(companyIdOrName));
          }
        }}
      />

      {/* Main Container */}
      <div className="flex-1 pb-16">
        {viewingSettings ? (
          <SettingsPage 
            onBack={handleBackToFeed}
            currentUser={currentUser}
            onDeleteAccountSuccess={handleAccountDeleted}
            onRequireAuth={(prompt) => handleOpenLogin(prompt)}
          />
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
            company={companies.find((c) => c.id === viewingCompany.id || c.slug === viewingCompany.slug) || viewingCompany}
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
            onUnclaimOrg={handleOpenUnclaimOrg}
            onInviteMember={handleInviteOrgMember}
            onAddProductToOrg={(_comp) => {
              handleOpenAddProduct();
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
            onOpenSubmit={(prodId) => handleOpenSubmit(prodId)}
            onToggleVerifyProduct={handleToggleVerifyProduct}
            onDeleteProduct={handleDeleteProduct}
            onOpenProfile={handleOpenProfile}
            onOpenCompany={handleOpenCompany}
            isFollowing={followedProductIds.includes(viewingProduct.id)}
            onToggleFollow={handleToggleFollowProduct}
          />
        ) : viewingProfile ? (
          <ProfilePage
            profile={currentUser && viewingProfile.handle.toLowerCase() === currentUser.handle.toLowerCase() ? currentUser : viewingProfile}
            isCurrentUser={Boolean(currentUser && viewingProfile.handle.toLowerCase() === currentUser.handle.toLowerCase())}
            feedbackItems={feedbackItems}
            products={products}
            onBack={handleBackToFeed}
            onOpenDetails={handleOpenDetails}
            onVote={handleVote}
            onOpenShare={setShareItem}
            isFollowing={followedUserHandles.includes(viewingProfile.handle)}
            onToggleFollow={() => handleToggleFollowUser(viewingProfile.handle)}
            onUpdateProfile={handleUserProfileUpdate}
            onOpenProduct={handleOpenProduct}
            companies={companies}
            onOpenCompany={handleOpenCompany}
            onClaimOrg={handleOpenClaimOrg}
            onOpenInternalDocs={handleOpenInternalDocs}
            onOpenAdminConsole={handleOpenAdminConsole}
            onOpenProfile={handleOpenProfile}
            currentUser={currentUser}
            onRequireAuth={(prompt) => handleOpenLogin(prompt)}
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
            onRequireAuth={(prompt) => handleOpenLogin(prompt)}
          />
        ) : (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-12 w-full">
            {/* Horizontal Product Explorer */}
            <ProductHeader
              products={products}
              selectedProductId={selectedProductId}
              onSelectProduct={setSelectedProductId}
              onOpenSubmit={() => handleOpenSubmit()}
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
        onOpenFeedback={() => handleOpenSubmit()}
        onOpenAddProduct={() => handleOpenAddProduct()}
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
        onOpenAuth={(prompt) => {
          setIsClaimModalOpen(false);
          handleOpenLogin(prompt);
        }}
      />

      {/* Unclaim Organization Modal */}
      <UnclaimOrgModal
        isOpen={isUnclaimModalOpen}
        company={unclaimCompanyTarget}
        subsumedProducts={products.filter(
          (p) =>
            p.companyId === unclaimCompanyTarget?.id ||
            (p.companyName && p.companyName.toLowerCase() === (unclaimCompanyTarget?.name || '').toLowerCase())
        )}
        currentUser={currentUser}
        onClose={() => {
          setIsUnclaimModalOpen(false);
          setUnclaimCompanyTarget(null);
        }}
        onConfirmUnclaim={handleUnclaimOrgSuccess}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => {
          setIsAuthOpen(false);
          setAuthPromptMessage(undefined);
        }}
        onLogin={handleLogin}
        promptDescription={authPromptMessage}
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
          onUpdateCurrentUser={handleUserProfileUpdate}
          onUnclaimCompany={(comp) => {
            setIsAdminConsoleOpen(false);
            handleOpenUnclaimOrg(comp);
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
