/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  INITIAL_PRODUCTS, 
  INITIAL_FEEDBACK 
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
import { SubmitFeedbackModal } from './components/SubmitFeedbackModal';
import { AddProductModal } from './components/AddProductModal';
import { FloatingActionButton } from './components/FloatingActionButton';
import { ShareModal } from './components/ShareModal';
import { AuthModal } from './components/AuthModal';
import { ClaimOrgModal } from './components/ClaimOrgModal';
import { FilterDropdown } from './components/FilterDropdown';
import { 
  bootstrapFirestoreData, 
  subscribeToFeedback, 
  subscribeToCompanies, 
  subscribeToProducts, 
  subscribeToNotifications,
  syncFeedbackDoc,
  syncCompanyDoc,
  syncProductDoc,
  dispatchRealtimeNotification,
  RealtimeNotification
} from './lib/firebase';

export default function App() {
  // Products, Companies & Feedback Data
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>(INITIAL_FEEDBACK);
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);

  // User Profile & Authentication State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>({
    id: 'usr-1',
    name: 'Albert N.',
    email: 'albert@example.com',
    handle: '@albert',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
    role: 'user',
    followerCount: 28,
    followingCount: 14,
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const userRole: UserRole = currentUser?.role || 'user';

  const handleRoleChange = (newRole: UserRole) => {
    if (currentUser) {
      let nextName = 'Albert N.';
      let nextHandle = '@albert';
      let nextAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80';

      if (newRole === 'admin') {
        nextName = 'Alex Vance';
        nextHandle = '@alex_admin';
        nextAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80';
      } else if (newRole === 'company_pm') {
        nextName = 'Sarah Chen';
        nextHandle = '@sarah_pm';
        nextAvatar = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80';
      }

      setCurrentUser({
        ...currentUser,
        role: newRole,
        name: nextName,
        handle: nextHandle,
        avatar: nextAvatar,
        roleTitle: newRole === 'company_pm' ? 'Lead Product Manager' : (newRole === 'admin' ? 'Platform Administrator' : undefined),
        companyOrOrg: newRole === 'company_pm' ? 'Anysphere' : (newRole === 'admin' ? 'CrowdPulse' : currentUser.companyOrOrg),
        companyId: newRole === 'company_pm' ? 'comp-anysphere' : undefined,
        bio: newRole === 'company_pm'
          ? 'Lead Product Manager at Anysphere, shaping the future of Cursor with AI coding agents and intelligent developer workflows.'
          : currentUser.bio,
        location: newRole === 'company_pm' ? 'San Francisco, CA' : currentUser.location,
        joinedDate: newRole === 'company_pm' ? 'March 2024' : currentUser.joinedDate,
      });
    }
  };

  // Firebase Real-time Synchronization & Bootstrap
  useEffect(() => {
    // 1. Seed sample data if Firestore is fresh
    bootstrapFirestoreData();

    // 2. Real-time subscription to Feedback
    const unsubFeedback = subscribeToFeedback((liveFeedback) => {
      setFeedbackItems(liveFeedback);
      if (detailItem) {
        const found = liveFeedback.find((f) => f.id === detailItem.id);
        if (found) setDetailItem(found);
      }
    });

    // 3. Real-time subscription to Companies
    const unsubCompanies = subscribeToCompanies((liveCompanies) => {
      setCompanies(liveCompanies);
      if (viewingCompany) {
        const found = liveCompanies.find((c) => c.id === viewingCompany.id);
        if (found) setViewingCompany(found);
      }
    });

    // 4. Real-time subscription to Products
    const unsubProducts = subscribeToProducts((liveProducts) => {
      setProducts(liveProducts);
      if (viewingProduct) {
        const found = liveProducts.find((p) => p.id === viewingProduct.id);
        if (found) setViewingProduct(found);
      }
    });

    // 5. Real-time subscription to Notifications
    const unsubNotifications = subscribeToNotifications(currentUser?.id || 'all', (liveNotifs) => {
      setNotifications(liveNotifs);
    });

    return () => {
      unsubFeedback();
      unsubCompanies();
      unsubProducts();
      unsubNotifications();
    };
  }, [currentUser?.id]);

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
  const [shareItem, setShareItem] = useState<FeedbackItem | null>(null);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [claimCompanyTarget, setClaimCompanyTarget] = useState<Company | null>(null);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);

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
      title: `${claimant.name} Claimed Organization!`,
      message: `Verified ownership of ${companies.find((c) => c.id === companyId)?.name || 'the organization'}. All suite products are now subsumed and verified.`,
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

  // Followed Products
  const [followedProductIds, setFollowedProductIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('signalpulse_followed_products');
      return saved ? JSON.parse(saved) : ['prod-cursor'];
    } catch {
      return ['prod-cursor'];
    }
  });

  const handleToggleFollowProduct = (productId: string) => {
    setFollowedProductIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      try {
        localStorage.setItem('signalpulse_followed_products', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Followed Users
  const [followedUserHandles, setFollowedUserHandles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('signalpulse_followed_users');
      return saved ? JSON.parse(saved) : ['@sarah_pm', '@rauchg'];
    } catch {
      return ['@sarah_pm', '@rauchg'];
    }
  });

  const handleToggleFollowUser = (handle: string) => {
    setFollowedUserHandles((prev) => {
      const next = prev.includes(handle)
        ? prev.filter((h) => h !== handle)
        : [...prev, handle];
      try {
        localStorage.setItem('signalpulse_followed_users', JSON.stringify(next));
      } catch {}
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
      companyId: isSarah ? 'comp-anysphere' : undefined,
      bio: isSarah
        ? 'Lead Product Manager at Anysphere, shaping the future of Cursor with AI coding agents and intelligent developer workflows.'
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
      setDetailItem(null);
      setViewingProfile(null);
      setViewingProduct(null);
      setViewingCompany(targetCompany);
      window.location.hash = `#company-${targetCompany.slug}`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Back to feedback feed
  const handleBackToFeed = () => {
    setDetailItem(null);
    setViewingProfile(null);
    setViewingProduct(null);
    setViewingCompany(null);
    if (
      window.location.hash.startsWith('#feedback-') || 
      window.location.hash.startsWith('#profile-') || 
      window.location.hash.startsWith('#product-') ||
      window.location.hash.startsWith('#company-')
    ) {
      window.history.pushState(null, '', window.location.pathname);
    }
  };

  // Handle URL hash changes (deep linking & browser back/forward button)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#feedback-')) {
        const id = hash.replace('#feedback-', '');
        const found = feedbackItems.find((f) => f.id === id);
        if (found) {
          setViewingCompany(null);
          setViewingProduct(null);
          setViewingProfile(null);
          setDetailItem(found);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (hash.startsWith('#profile-')) {
        const cleanHandle = hash.replace('#profile-', '');
        setViewingCompany(null);
        setViewingProduct(null);
        setDetailItem(null);
        handleOpenProfile('@' + cleanHandle);
      } else if (hash.startsWith('#product-')) {
        const slug = hash.replace('#product-', '');
        const found = products.find((p) => p.slug === slug || p.id === slug);
        if (found) {
          setDetailItem(null);
          setViewingCompany(null);
          setViewingProfile(null);
          setViewingProduct(found);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (hash.startsWith('#company-')) {
        const slug = hash.replace('#company-', '');
        const found = companies.find((c) => c.slug === slug || c.id === slug);
        if (found) {
          setDetailItem(null);
          setViewingProfile(null);
          setViewingProduct(null);
          setViewingCompany(found);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        setDetailItem(null);
        setViewingProfile(null);
        setViewingProduct(null);
        setViewingCompany(null);
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

  // Voting action: "Me Too" (+1)
  const handleVote = (itemId: string) => {
    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextVoted = !item.hasUserVoted;
          const updated = {
            ...item,
            hasUserVoted: nextVoted,
            meTooCount: nextVoted ? item.meTooCount + 1 : item.meTooCount - 1,
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

    // If modal is open for this item, keep it synced
    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) => {
        if (!prev) return null;
        const nextVoted = !prev.hasUserVoted;
        return {
          ...prev,
          hasUserVoted: nextVoted,
          meTooCount: nextVoted ? prev.meTooCount + 1 : prev.meTooCount - 1,
        };
      });
    }
  };

  // Share / Repost action
  const handleShare = (itemId: string) => {
    let itemToSync: FeedbackItem | null = null;
    setFeedbackItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId && !item.hasUserReposted) {
          const updated = {
            ...item,
            hasUserReposted: true,
            repostCount: item.repostCount + 1,
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
      createdAt: 'Just now',
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
      dispatchRealtimeNotification({
        id: `notif-${Date.now()}`,
        userId: 'all',
        actorName: newComment.authorName,
        actorAvatar: newComment.authorAvatar,
        title: `New Comment on "${(itemToSync as FeedbackItem).title}"`,
        message: `${newComment.authorName}: "${text.slice(0, 75)}${text.length > 75 ? '...' : ''}"`,
        type: 'reply',
        targetFeedbackId: itemId,
        isRead: false,
        createdAt: 'Just now',
      });
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

  // Admin / PM Delete Feedback
  const handleDeleteFeedback = (itemId: string) => {
    setFeedbackItems((prev) => prev.filter((i) => i.id !== itemId));
    setDetailItem(null);
  };

  // Admin Delete Comment
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
      dispatchRealtimeNotification({
        id: `notif-${Date.now()}`,
        userId: 'all',
        actorName: currentUser?.name || 'Verified PM',
        actorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80',
        title: `${targetProd?.name || 'Product'} • Status: ${newStatus.replace('_', ' ').toUpperCase()}`,
        message: `${currentUser?.name || 'Verified PM'} moved "${syncedItem.title}" to ${newStatus.replace('_', ' ')}. ${note ? `"${note}"` : ''}`,
        type: newStatus === 'shipped' ? 'status_shipped' : 'status_progress',
        targetFeedbackId: itemId,
        isRead: false,
        createdAt: 'Just now',
      });
    }

    if (detailItem && detailItem.id === itemId) {
      setDetailItem((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
              statusUpdateNote: note,
              statusUpdatedAt: 'Just now',
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
  }) => {
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
      createdAt: 'Just now',
      authorName: currentUser?.name || 'You',
      authorHandle: currentUser?.handle || '@you',
      authorAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&auto=format&fit=crop&q=80',
      tags: newItem.tags,
      comments: [],
    };

    setFeedbackItems((prev) => [itemToAdd, ...prev]);
    syncFeedbackDoc(itemToAdd);

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
        onSelectNotificationFeedback={(id) => {
          const item = feedbackItems.find((f) => f.id === id);
          if (item) handleOpenDetails(item);
        }}
        onClearNotifications={() => setNotifications([])}
        onOpenLogin={() => setIsAuthOpen(true)}
        onRoleChange={handleRoleChange}
        onLogout={() => {
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
      />

      {/* Main Container */}
      <div className="flex-1 pb-16">
        {viewingCompany ? (
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
              }
            }}
            onRoleChange={handleRoleChange}
            onOpenProduct={handleOpenProduct}
            companies={companies}
            onOpenCompany={handleOpenCompany}
          />
        ) : detailItem ? (
          <FeedbackDetailPage
            item={detailItem}
            product={products.find((p) => p.id === detailItem.productId)}
            userRole={userRole}
            onBack={handleBackToFeed}
            onVote={handleVote}
            onOpenShare={setShareItem}
            onAddComment={handleAddComment}
            onUpdateStatus={handleUpdateStatus}
            onDeleteFeedback={handleDeleteFeedback}
            onDeleteComment={handleDeleteComment}
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
        onLogin={setCurrentUser}
      />
    </div>
  );
}
