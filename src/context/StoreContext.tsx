import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Organization,
  Product,
  ProductCategory,
  UserProfile,
  FeedbackPost,
  FeedbackComment,
  FeedbackType,
  Severity,
  FeedbackStatus,
  CommentKind,
  PostVote,
  PostRepost,
  FollowRelation,
  NotificationItem,
} from '../types';
import {
  SEED_ORGANIZATIONS,
  SEED_PRODUCTS,
  SEED_PROFILES,
  SEED_POSTS,
  SEED_COMMENTS,
  SEED_VOTES,
  SEED_REPOSTS,
  SEED_FOLLOWS,
  SEED_NOTIFICATIONS,
} from '../data/seedData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface RelationalStoreState {
  organizations: Organization[];
  products: Product[];
  profiles: UserProfile[];
  posts: FeedbackPost[];
  comments: FeedbackComment[];
  votes: PostVote[];
  reposts: PostRepost[];
  follows: FollowRelation[];
  notifications: NotificationItem[];
}

interface CreatePostInput {
  productId: string;
  title: string;
  body: string;
  type: FeedbackType;
  severity: Severity;
  tags: string[];
  mediaUrls?: string[];
}

interface CreateProductInput {
  name: string;
  slug: string;
  orgId: string;
  newOrgName?: string;
  tagline: string;
  description: string;
  category: ProductCategory;
  websiteUrl: string;
  logoUrl?: string;
}

interface StoreContextValue {
  // State
  organizations: Organization[];
  products: Product[];
  profiles: UserProfile[];
  posts: FeedbackPost[];
  comments: FeedbackComment[];
  votes: PostVote[];
  reposts: PostRepost[];
  follows: FollowRelation[];
  notifications: NotificationItem[];
  currentUser: UserProfile | null;
  isSupabaseLive: boolean;

  // Relational Lookup Helpers
  getProductById: (id: string) => Product | undefined;
  getProductBySlug: (slug: string) => Product | undefined;
  getOrgById: (id: string) => Organization | undefined;
  getOrgBySlug: (slug: string) => Organization | undefined;
  getProfileById: (id: string) => UserProfile | undefined;
  getProfileByHandle: (handle: string) => UserProfile | undefined;
  hasUserVoted: (postId: string) => boolean;
  hasUserReposted: (postId: string) => boolean;
  hasUserLikedComment: (commentId: string) => boolean;
  isFollowingProduct: (productId: string) => boolean;
  isFollowingUser: (userId: string) => boolean;
  canManageProduct: (productId: string) => boolean;

  // Mutations
  signInAsProfile: (profileId: string) => void;
  signInOrRegisterWithEmail: (input: {
    email: string;
    name?: string;
    handle?: string;
  }) => Promise<UserProfile>;
  signInWithPassword: (input: {
    email: string;
    password: string;
  }) => Promise<{ error?: string }>;
  signUpWithPassword: (input: {
    email: string;
    password: string;
    name?: string;
    handle?: string;
  }) => Promise<{ error?: string; message?: string }>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string; message?: string }>;
  signInWithOAuthProvider: (provider: 'github' | 'google') => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateCurrentProfile: (updates: Partial<Pick<UserProfile, 'name' | 'handle' | 'bio' | 'location' | 'avatarUrl' | 'roleTitle'>>) => Promise<void>;

  createPost: (input: CreatePostInput) => Promise<FeedbackPost>;
  deletePost: (postId: string) => Promise<void>;
  toggleUpvote: (postId: string) => Promise<void>;
  toggleRepost: (postId: string, quoteText?: string) => Promise<void>;
  addComment: (postId: string, body: string, kind?: CommentKind) => Promise<void>;
  toggleCommentLike: (commentId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  updatePostStatus: (postId: string, status: FeedbackStatus, officialNote?: string) => Promise<void>;
  toggleFollowProduct: (productId: string) => Promise<void>;
  toggleFollowUser: (targetUserId: string) => Promise<void>;
  createProduct: (input: CreateProductInput) => Promise<Product>;
  claimProductBoard: (
    productId: string,
    input: { workEmail: string; roleTitle?: string; verificationMethod?: 'email_domain' | 'dns_txt' }
  ) => Promise<{ error?: string }>;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;
  resetLocalDemoData: () => void;

  // Global UI Modal Triggers
  isAuthModalOpen: boolean;
  authModalPrompt?: string;
  openAuthModal: (prompt?: string) => void;
  closeAuthModal: () => void;
  isCreateProductModalOpen: boolean;
  openCreateProductModal: () => void;
  closeCreateProductModal: () => void;
}

const LOCAL_DB_KEY = 'publisense_v3_relational_db';
const LOCAL_USER_KEY = 'publisense_v3_auth_user_id';
const LOCAL_COMMENT_LIKES_KEY = 'publisense_v3_comment_likes';

function getInitialStoreState(): RelationalStoreState {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RelationalStoreState;
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.posts)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse local relational DB, using seed state:', e);
  }
  return {
    organizations: SEED_ORGANIZATIONS,
    products: SEED_PRODUCTS,
    profiles: SEED_PROFILES,
    posts: SEED_POSTS,
    comments: SEED_COMMENTS,
    votes: SEED_VOTES,
    reposts: SEED_REPOSTS,
    follows: SEED_FOLLOWS,
    notifications: SEED_NOTIFICATIONS,
  };
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [store, setStore] = useState<RelationalStoreState>(getInitialStoreState);
  const [activeUserId, setActiveUserId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_USER_KEY);
      if (!saved || saved === 'null') return null;
      return saved;
    } catch {
      return null;
    }
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalPrompt, setAuthModalPrompt] = useState<string | undefined>(undefined);
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] = useState(false);

  const [commentLikes, setCommentLikes] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_COMMENT_LIKES_KEY);
      if (raw) return JSON.parse(raw) as Record<string, string[]>;
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_COMMENT_LIKES_KEY, JSON.stringify(commentLikes));
    } catch {}
  }, [commentLikes]);

  // Persist local relational store on change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(store));
    } catch (e) {
      console.warn('Could not save relational store to localStorage:', e);
    }
  }, [store]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_USER_KEY, activeUserId ?? 'null');
    } catch {}
  }, [activeUserId]);

  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  // Optional live Supabase sync on mount when configured
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    async function loadFromSupabase() {
      if (!supabase) return;
      try {
        const [orgsRes, prodsRes, profsRes, postsRes, cmtsRes, votesRes, repostsRes, followsRes, cmtVotesRes] =
          await Promise.all([
            supabase.from('organizations').select('*'),
            supabase.from('products').select('*'),
            // profiles.email is private (RLS: self + admin only), so the feed
            // reads the public_profiles view, which omits email. The signed-in
            // user's own row (with email) is fetched separately below.
            supabase.from('public_profiles').select('*'),
            supabase.from('posts').select('*').order('created_at', { ascending: false }),
            supabase.from('comments').select('*').order('created_at', { ascending: true }),
            supabase.from('post_votes').select('*'),
            supabase.from('post_reposts').select('*'),
            supabase.from('follows').select('*'),
            supabase.from('comment_votes').select('*'),
          ]);

        if (cancelled) return;

        if (prodsRes.error) {
          console.warn(
            '[Publisense] Supabase URL/Key active, but database schema is not yet applied:',
            prodsRes.error.message
          );
          setIsSupabaseConnected(false);
          return;
        }

        setIsSupabaseConnected(true);

        // If tables exist in Supabase and are completely empty, auto-seed them with initial catalog
        if (prodsRes.data && prodsRes.data.length === 0) {
          await supabase.from('organizations').upsert(
            SEED_ORGANIZATIONS.map((o) => ({
              id: o.id,
              slug: o.slug,
              name: o.name,
              tagline: o.tagline,
              logo_url: o.logoUrl,
              website_url: o.websiteUrl,
              is_verified: o.isVerified,
            }))
          );
          await supabase.from('products').upsert(
            SEED_PRODUCTS.map((p) => ({
              id: p.id,
              slug: p.slug,
              org_id: p.orgId,
              name: p.name,
              tagline: p.tagline,
              description: p.description,
              category: p.category,
              logo_url: p.logoUrl,
              website_url: p.websiteUrl,
              is_verified: p.isVerified,
              responsiveness_rate: p.responsivenessRate,
              avg_response_time: p.avgResponseTime,
              followers_count: p.followersCount,
            }))
          );
          await supabase.from('profiles').upsert(
            SEED_PROFILES.map((u) => ({
              id: u.id,
              handle: u.handle,
              name: u.name,
              email: u.email,
              avatar_url: u.avatarUrl,
              bio: u.bio,
              role: u.role,
              managed_org_id: u.managedOrgId || null,
              role_title: u.roleTitle || null,
              location: u.location || null,
              joined_at: u.joinedAt,
            }))
          );
          await supabase.from('posts').upsert(
            SEED_POSTS.map((post) => ({
              id: post.id,
              product_id: post.productId,
              author_id: post.authorId,
              title: post.title,
              body: post.body,
              type: post.type,
              severity: post.severity,
              status: post.status,
              official_note: post.officialNote || null,
              official_updated_by: post.officialUpdatedBy || null,
              official_updated_at: post.officialUpdatedAt || null,
              tags: post.tags || [],
              media_urls: post.mediaUrls || [],
              upvote_count: post.upvoteCount,
              repost_count: post.repostCount,
              comment_count: post.commentCount,
              created_at: post.createdAt,
            }))
          );
          await supabase.from('comments').upsert(
            SEED_COMMENTS.map((c) => ({
              id: c.id,
              post_id: c.postId,
              author_id: c.authorId,
              body: c.body,
              kind: c.kind,
              likes_count: c.likesCount,
              created_at: c.createdAt,
            }))
          );
          await supabase.from('post_votes').upsert(
            SEED_VOTES.map((v) => ({
              post_id: v.postId,
              user_id: v.userId,
              created_at: v.createdAt,
            }))
          );
          await supabase.from('post_reposts').upsert(
            SEED_REPOSTS.map((r) => ({
              post_id: r.postId,
              user_id: r.userId,
              quote_text: r.quoteText || null,
              created_at: r.createdAt,
            }))
          );
          await supabase.from('follows').upsert(
            SEED_FOLLOWS.map((f) => ({
              follower_id: f.followerId,
              target_type: f.targetType,
              target_id: f.targetId,
              created_at: f.createdAt,
            }))
          );
          return;
        }

        if (prodsRes.data && prodsRes.data.length > 0) {
          setStore((prev) => ({
            ...prev,
            organizations: (orgsRes.data || []).map((o: any) => ({
              id: o.id,
              slug: o.slug,
              name: o.name,
              tagline: o.tagline,
              logoUrl: o.logo_url,
              websiteUrl: o.website_url,
              isVerified: o.is_verified,
            })),
            products: (prodsRes.data || []).map((p: any) => ({
              id: p.id,
              slug: p.slug,
              orgId: p.org_id,
              name: p.name,
              tagline: p.tagline,
              description: p.description,
              category: p.category,
              logoUrl: p.logo_url,
              websiteUrl: p.website_url,
              isVerified: p.is_verified,
              responsivenessRate: p.responsiveness_rate,
              avgResponseTime: p.avg_response_time,
              followersCount: p.followers_count,
            })),
            profiles: (profsRes.data || []).map((u: any) => ({
              id: u.id,
              handle: u.handle,
              name: u.name,
              // public_profiles has no email column by design
              email: u.email || '',
              avatarUrl: u.avatar_url,
              bio: u.bio,
              role: u.role,
              managedOrgId: u.managed_org_id || undefined,
              roleTitle: u.role_title || undefined,
              location: u.location || undefined,
              joinedAt: u.joined_at,
            })),
            posts: (postsRes.data || []).map((post: any) => ({
              id: post.id,
              productId: post.product_id,
              authorId: post.author_id,
              title: post.title,
              body: post.body,
              type: post.type,
              severity: post.severity,
              status: post.status,
              officialNote: post.official_note || undefined,
              officialUpdatedBy: post.official_updated_by || undefined,
              officialUpdatedAt: post.official_updated_at || undefined,
              tags: post.tags || [],
              mediaUrls: post.media_urls || [],
              upvoteCount: post.upvote_count,
              repostCount: post.repost_count,
              commentCount: post.comment_count,
              createdAt: post.created_at,
            })),
            comments: (cmtsRes.data || []).map((c: any) => ({
              id: c.id,
              postId: c.post_id,
              authorId: c.author_id,
              body: c.body,
              kind: c.kind,
              likesCount: c.likes_count,
              createdAt: c.created_at,
            })),
            votes: (votesRes.data || []).map((v: any) => ({
              postId: v.post_id,
              userId: v.user_id,
              createdAt: v.created_at,
            })),
            reposts: (repostsRes.data || []).map((r: any) => ({
              postId: r.post_id,
              userId: r.user_id,
              quoteText: r.quote_text || undefined,
              createdAt: r.created_at,
            })),
            follows: (followsRes.data || []).map((f: any) => ({
              followerId: f.follower_id,
              targetType: f.target_type,
              targetId: f.target_id,
              createdAt: f.created_at,
            })),
          }));

          // Seed "who upvoted what" from the database so a fresh browser or a
          // different device still shows the user's own votes filled in.
          // The server is authoritative; localStorage is only an offline cache.
          const grouped: Record<string, string[]> = {};
          for (const v of cmtVotesRes?.data || []) {
            (grouped[v.comment_id] ||= []).push(v.user_id);
          }
          setCommentLikes(grouped);
        }
      } catch (err) {
        console.warn('Supabase sync fallback to local relational store:', err);
      }
    }

    loadFromSupabase();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentUser = useMemo(() => {
    if (!activeUserId) return null;
    return store.profiles.find((p) => p.id === activeUserId) || null;
  }, [activeUserId, store.profiles]);

  const getProductById = useCallback(
    (id: string) => store.products.find((p) => p.id === id),
    [store.products]
  );

  const getProductBySlug = useCallback(
    (slug: string) => store.products.find((p) => p.slug.toLowerCase() === slug.toLowerCase()),
    [store.products]
  );

  const getOrgById = useCallback(
    (id: string) => store.organizations.find((o) => o.id === id),
    [store.organizations]
  );

  const getOrgBySlug = useCallback(
    (slug: string) => store.organizations.find((o) => o.slug.toLowerCase() === slug.toLowerCase()),
    [store.organizations]
  );

  const getProfileById = useCallback(
    (id: string) => store.profiles.find((u) => u.id === id),
    [store.profiles]
  );

  const getProfileByHandle = useCallback(
    (handle: string) => {
      const clean = handle.replace(/^@/, '').toLowerCase();
      return store.profiles.find((u) => u.handle.toLowerCase() === clean);
    },
    [store.profiles]
  );

  const hasUserVoted = useCallback(
    (postId: string) => {
      if (!currentUser) return false;
      return store.votes.some((v) => v.postId === postId && v.userId === currentUser.id);
    },
    [currentUser, store.votes]
  );

  const hasUserReposted = useCallback(
    (postId: string) => {
      if (!currentUser) return false;
      return store.reposts.some((r) => r.postId === postId && r.userId === currentUser.id);
    },
    [currentUser, store.reposts]
  );

  const hasUserLikedComment = useCallback(
    (commentId: string) => {
      if (!currentUser) return false;
      const likers = commentLikes[commentId] || [];
      return likers.includes(currentUser.id);
    },
    [currentUser, commentLikes]
  );

  const isFollowingProduct = useCallback(
    (productId: string) => {
      if (!currentUser) return false;
      return store.follows.some(
        (f) => f.followerId === currentUser.id && f.targetType === 'product' && f.targetId === productId
      );
    },
    [currentUser, store.follows]
  );

  const isFollowingUser = useCallback(
    (userId: string) => {
      if (!currentUser) return false;
      return store.follows.some(
        (f) => f.followerId === currentUser.id && f.targetType === 'user' && f.targetId === userId
      );
    },
    [currentUser, store.follows]
  );

  const canManageProduct = useCallback(
    (productId: string) => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      const prod = getProductById(productId);
      if (!prod) return false;
      return Boolean(currentUser.managedOrgId && currentUser.managedOrgId === prod.orgId);
    },
    [currentUser, getProductById]
  );

  const openAuthModal = useCallback((prompt?: string) => {
    setAuthModalPrompt(prompt);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthModalPrompt(undefined);
  }, []);

  const openCreateProductModal = useCallback(() => {
    if (!currentUser) {
      openAuthModal('Sign in to add a new product to Publisense.');
      return;
    }
    setIsCreateProductModalOpen(true);
  }, [currentUser, openAuthModal]);

  const closeCreateProductModal = useCallback(() => {
    setIsCreateProductModalOpen(false);
  }, []);

  // Sync real Supabase Auth session -> UserProfile in public.profiles
  const syncSupabaseUserToProfile = useCallback(
    async (sbUser: {
      id: string;
      email?: string;
      user_metadata?: Record<string, any>;
    }): Promise<UserProfile> => {
      const cleanEmail = (sbUser.email || `${sbUser.id.slice(0, 8)}@publisense.app`)
        .trim()
        .toLowerCase();

      // Check if profile already exists by id (authoritative).
      // Email match is only meaningful for the caller's OWN row, because
      // public_profiles omits email - other users' entries have ''.
      let existing: UserProfile | undefined;
      setStore((prev) => {
        existing =
          prev.profiles.find((p) => p.id === sbUser.id) ||
          prev.profiles.find((p) => p.email && p.email.toLowerCase() === cleanEmail);
        return prev;
      });

      if (existing) {
        setActiveUserId(existing.id);
        return existing;
      }

      const meta = sbUser.user_metadata || {};
      const rawName = (
        meta.full_name ||
        meta.name ||
        meta.user_name ||
        cleanEmail.split('@')[0] ||
        'Builder'
      ).trim();
      const baseHandle = (meta.handle || meta.user_name || rawName)
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 24);

      const newProfile: UserProfile = {
        id: sbUser.id,
        handle: baseHandle || `user_${sbUser.id.slice(0, 6)}`,
        name: rawName,
        email: cleanEmail,
        avatarUrl:
          meta.avatar_url ||
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
        bio: 'Builder sharing product feedback and backing community signals on Publisense.',
        role: 'user',
        joinedAt: new Date().toISOString(),
      };

      setStore((prev) => {
        const alreadyInStore =
          prev.profiles.find((p) => p.id === newProfile.id) ||
          prev.profiles.find((p) => p.email && p.email.toLowerCase() === cleanEmail);
        if (alreadyInStore) return prev;
        const handleTaken = prev.profiles.some(
          (p) => p.handle.toLowerCase() === newProfile.handle.toLowerCase()
        );
        const profileToInsert = handleTaken
          ? { ...newProfile, handle: `${newProfile.handle}_${Math.floor(10 + Math.random() * 89)}` }
          : newProfile;
        return {
          ...prev,
          profiles: [...prev.profiles, profileToInsert],
        };
      });

      setActiveUserId(newProfile.id);

      if (supabase) {
        await supabase.from('profiles').upsert({
          id: newProfile.id,
          handle: newProfile.handle,
          name: newProfile.name,
          email: newProfile.email,
          avatar_url: newProfile.avatarUrl,
          bio: newProfile.bio,
          role: newProfile.role,
          managed_org_id: null,
          role_title: null,
          location: null,
          joined_at: newProfile.joinedAt,
        });
      }

      return newProfile;
    },
    []
  );

  // Listen to real Supabase Auth sessions (OAuth redirects, Magic Links, Email/Password)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        syncSupabaseUserToProfile(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        syncSupabaseUserToProfile(session.user);
        setIsAuthModalOpen(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncSupabaseUserToProfile]);

  const signInAsProfile = useCallback((profileId: string) => {
    setActiveUserId(profileId);
    setIsAuthModalOpen(false);
  }, []);

  const signInWithPassword = useCallback(
    async (input: { email: string; password: string }): Promise<{ error?: string }> => {
      if (!supabase) {
        return { error: 'Supabase client is not configured.' };
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
      });
      if (error) {
        return { error: error.message };
      }
      if (data.user) {
        await syncSupabaseUserToProfile(data.user);
        setIsAuthModalOpen(false);
      }
      return {};
    },
    [syncSupabaseUserToProfile]
  );

  const signUpWithPassword = useCallback(
    async (input: {
      email: string;
      password: string;
      name?: string;
      handle?: string;
    }): Promise<{ error?: string; message?: string }> => {
      if (!supabase) {
        return { error: 'Supabase client is not configured.' };
      }
      const cleanEmail = input.email.trim().toLowerCase();
      const cleanName = (input.name || cleanEmail.split('@')[0] || 'Builder').trim();
      const cleanHandle = (input.handle || cleanName)
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 24);

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: input.password,
        options: {
          data: {
            full_name: cleanName,
            handle: cleanHandle,
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        await syncSupabaseUserToProfile({
          id: data.user.id,
          email: cleanEmail,
          user_metadata: {
            full_name: cleanName,
            handle: cleanHandle,
          },
        });
        setIsAuthModalOpen(false);
        if (!data.session) {
          return {
            message:
              'Account created and profile activated! (Check your email if confirmation is enabled on your Supabase project.)',
          };
        }
      }

      return {};
    },
    [syncSupabaseUserToProfile]
  );

  const signInWithMagicLink = useCallback(
    async (email: string): Promise<{ error?: string; message?: string }> => {
      if (!supabase) {
        return { error: 'Supabase client is not configured.' };
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        return { error: error.message };
      }
      return {
        message: `Magic sign-in link sent to ${email.trim()}. Check your inbox!`,
      };
    },
    []
  );

  const signInWithOAuthProvider = useCallback(
    async (provider: 'github' | 'google'): Promise<{ error?: string }> => {
      if (!supabase) {
        return { error: 'Supabase client is not configured.' };
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        return { error: error.message };
      }
      return {};
    },
    []
  );

  const signInOrRegisterWithEmail = useCallback(
    async (input: { email: string; name?: string; handle?: string }): Promise<UserProfile> => {
      const cleanEmail = input.email.trim().toLowerCase();
      // Only the caller's own row carries an email (public_profiles omits it),
      // so this matches "am I already registered" and nothing else.
      const existing = store.profiles.find(
        (p) => p.email && p.email.toLowerCase() === cleanEmail
      );
      if (existing) {
        setActiveUserId(existing.id);
        setIsAuthModalOpen(false);
        return existing;
      }

      const rawName = (input.name || cleanEmail.split('@')[0] || 'Builder').trim();
      const baseHandle = (input.handle || rawName)
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 24);
      const uniqueHandle = store.profiles.some((p) => p.handle.toLowerCase() === baseHandle)
        ? `${baseHandle}_${Math.floor(10 + Math.random() * 89)}`
        : baseHandle;

      const newProfile: UserProfile = {
        id: `usr-${Date.now().toString(36)}`,
        handle: uniqueHandle,
        name: rawName,
        email: cleanEmail,
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
        bio: 'Builder sharing product feedback and backing community signals on Publisense.',
        role: 'user',
        joinedAt: new Date().toISOString(),
      };

      setStore((prev) => ({
        ...prev,
        profiles: [...prev.profiles, newProfile],
      }));
      setActiveUserId(newProfile.id);
      setIsAuthModalOpen(false);

      if (supabase) {
        await supabase.from('profiles').upsert({
          id: newProfile.id,
          handle: newProfile.handle,
          name: newProfile.name,
          email: newProfile.email,
          avatar_url: newProfile.avatarUrl,
          bio: newProfile.bio,
          role: newProfile.role,
          managed_org_id: null,
          role_title: null,
          location: null,
          joined_at: newProfile.joinedAt,
        });
      }

      return newProfile;
    },
    [store.profiles]
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    setActiveUserId(null);
    setIsAuthModalOpen(false);
  }, []);

  const updateCurrentProfile = useCallback(
    async (
      updates: Partial<Pick<UserProfile, 'name' | 'handle' | 'bio' | 'location' | 'avatarUrl' | 'roleTitle'>>
    ) => {
      if (!currentUser) return;
      const sanitizedHandle = updates.handle
        ? updates.handle.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '_')
        : currentUser.handle;

      setStore((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === currentUser.id
            ? {
                ...p,
                ...updates,
                handle: sanitizedHandle || p.handle,
              }
            : p
        ),
      }));

      if (supabase) {
        await supabase
          .from('profiles')
          .update({
            name: updates.name ?? currentUser.name,
            handle: sanitizedHandle || currentUser.handle,
            bio: updates.bio ?? currentUser.bio,
            location: updates.location ?? currentUser.location,
            avatar_url: updates.avatarUrl ?? currentUser.avatarUrl,
            role_title: updates.roleTitle ?? currentUser.roleTitle,
          })
          .eq('id', currentUser.id);
      }
    },
    [currentUser]
  );

  const createPost = useCallback(
    async (input: CreatePostInput): Promise<FeedbackPost> => {
      if (!currentUser) {
        openAuthModal('Sign in to publish your signal.');
        throw new Error('Authentication required');
      }
      const now = new Date().toISOString();
      const newPost: FeedbackPost = {
        id: `post-${Date.now().toString(36)}`,
        productId: input.productId,
        authorId: currentUser.id,
        title: input.title.trim(),
        body: input.body.trim(),
        type: input.type,
        severity: input.severity,
        status: 'open',
        tags: input.tags.length > 0 ? input.tags : [input.type],
        mediaUrls: input.mediaUrls || [],
        upvoteCount: 1,
        repostCount: 0,
        commentCount: 0,
        createdAt: now,
      };

      const initialVote: PostVote = {
        postId: newPost.id,
        userId: currentUser.id,
        createdAt: now,
      };

      setStore((prev) => ({
        ...prev,
        posts: [newPost, ...prev.posts],
        votes: [...prev.votes, initialVote],
      }));

      if (supabase) {
        await supabase.from('posts').insert({
          id: newPost.id,
          product_id: newPost.productId,
          author_id: newPost.authorId,
          title: newPost.title,
          body: newPost.body,
          type: newPost.type,
          severity: newPost.severity,
          status: newPost.status,
          tags: newPost.tags,
          media_urls: newPost.mediaUrls,
          upvote_count: 1,
          created_at: newPost.createdAt,
        });
        await supabase.from('post_votes').insert({
          post_id: newPost.id,
          user_id: currentUser.id,
        });
      }

      return newPost;
    },
    [currentUser, openAuthModal]
  );

  const deletePost = useCallback(
    async (postId: string) => {
      if (!currentUser) return;
      setStore((prev) => ({
        ...prev,
        posts: prev.posts.filter((p) => p.id !== postId),
        comments: prev.comments.filter((c) => c.postId !== postId),
        votes: prev.votes.filter((v) => v.postId !== postId),
        reposts: prev.reposts.filter((r) => r.postId !== postId),
      }));

      if (supabase) {
        await supabase.from('posts').delete().eq('id', postId);
      }
    },
    [currentUser]
  );

  const toggleUpvote = useCallback(
    async (postId: string) => {
      if (!currentUser) {
        openAuthModal('Sign in to upvote signals and track when they ship.');
        return;
      }

      const alreadyVoted = store.votes.some(
        (v) => v.postId === postId && v.userId === currentUser.id
      );
      const targetPostCurrent = store.posts.find((p) => p.id === postId);
      const nextCount = targetPostCurrent
        ? alreadyVoted
          ? Math.max(0, targetPostCurrent.upvoteCount - 1)
          : targetPostCurrent.upvoteCount + 1
        : 1;
      const now = new Date().toISOString();

      setStore((prev) => {
        const nextVotes = alreadyVoted
          ? prev.votes.filter((v) => !(v.postId === postId && v.userId === currentUser.id))
          : [...prev.votes, { postId, userId: currentUser.id, createdAt: now }];

        const targetPost = prev.posts.find((p) => p.id === postId);
        const nextPosts = prev.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                upvoteCount: alreadyVoted ? Math.max(0, p.upvoteCount - 1) : p.upvoteCount + 1,
              }
            : p
        );

        let nextNotifications = prev.notifications;
        if (!alreadyVoted && targetPost && targetPost.authorId !== currentUser.id) {
          const prod = prev.products.find((pr) => pr.id === targetPost.productId);
          const notif: NotificationItem = {
            id: `notif-${Date.now().toString(36)}`,
            recipientId: targetPost.authorId,
            actorId: currentUser.id,
            postId,
            productId: targetPost.productId,
            kind: 'upvote',
            title: `+1 Upvote on ${prod?.name || 'your signal'}`,
            message: `${currentUser.name} backed "${targetPost.title}".`,
            isRead: false,
            createdAt: now,
          };
          nextNotifications = [notif, ...prev.notifications];
        }

        return {
          ...prev,
          votes: nextVotes,
          posts: nextPosts,
          notifications: nextNotifications,
        };
      });

      if (supabase) {
        if (alreadyVoted) {
          await supabase
            .from('post_votes')
            .delete()
            .match({ post_id: postId, user_id: currentUser.id });
        } else {
          await supabase
            .from('post_votes')
            .insert({ post_id: postId, user_id: currentUser.id });
        }
        await supabase.from('posts').update({ upvote_count: nextCount }).eq('id', postId);
      }
    },
    [currentUser, openAuthModal, store.votes, store.posts]
  );

  const toggleRepost = useCallback(
    async (postId: string, quoteText?: string) => {
      if (!currentUser) {
        openAuthModal('Sign in to boost signals to your followers.');
        return;
      }

      const alreadyReposted = store.reposts.some(
        (r) => r.postId === postId && r.userId === currentUser.id
      );
      const targetPostCurrent = store.posts.find((p) => p.id === postId);
      const nextCount = targetPostCurrent
        ? alreadyReposted
          ? Math.max(0, targetPostCurrent.repostCount - 1)
          : targetPostCurrent.repostCount + 1
        : 1;
      const now = new Date().toISOString();

      setStore((prev) => {
        const nextReposts = alreadyReposted
          ? prev.reposts.filter((r) => !(r.postId === postId && r.userId === currentUser.id))
          : [
              ...prev.reposts,
              {
                postId,
                userId: currentUser.id,
                quoteText: quoteText?.trim() || undefined,
                createdAt: now,
              },
            ];

        const nextPosts = prev.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                repostCount: alreadyReposted ? Math.max(0, p.repostCount - 1) : p.repostCount + 1,
              }
            : p
        );

        return {
          ...prev,
          reposts: nextReposts,
          posts: nextPosts,
        };
      });

      if (supabase) {
        if (alreadyReposted) {
          await supabase
            .from('post_reposts')
            .delete()
            .match({ post_id: postId, user_id: currentUser.id });
        } else {
          await supabase.from('post_reposts').insert({
            post_id: postId,
            user_id: currentUser.id,
            quote_text: quoteText?.trim() || null,
          });
        }
        await supabase.from('posts').update({ repost_count: nextCount }).eq('id', postId);
      }
    },
    [currentUser, openAuthModal, store.reposts, store.posts]
  );

  const addComment = useCallback(
    async (postId: string, body: string, kind: CommentKind = 'discussion') => {
      if (!currentUser) {
        openAuthModal('Sign in to join the discussion.');
        return;
      }
      const trimmed = body.trim();
      if (!trimmed) return;

      const targetPostCurrent = store.posts.find((p) => p.id === postId);
      const nextCount = targetPostCurrent ? targetPostCurrent.commentCount + 1 : 1;

      const now = new Date().toISOString();
      const initialLikes = kind === 'workaround' ? 1 : 0;
      const newComment: FeedbackComment = {
        id: `cmt-${Date.now().toString(36)}`,
        postId,
        authorId: currentUser.id,
        body: trimmed,
        kind,
        likesCount: initialLikes,
        createdAt: now,
      };

      if (kind === 'workaround') {
        setCommentLikes((prev) => ({
          ...prev,
          [newComment.id]: [currentUser.id],
        }));
      }

      setStore((prev) => {
        const targetPost = prev.posts.find((p) => p.id === postId);
        let nextNotifications = prev.notifications;
        if (targetPost && targetPost.authorId !== currentUser.id) {
          const notif: NotificationItem = {
            id: `notif-${Date.now().toString(36)}`,
            recipientId: targetPost.authorId,
            actorId: currentUser.id,
            postId,
            productId: targetPost.productId,
            kind: 'comment',
            title:
              kind === 'workaround'
                ? `New Community Workaround on "${targetPost.title}"`
                : `New reply on "${targetPost.title}"`,
            message: `${currentUser.name}: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '...' : ''}"`,
            isRead: false,
            createdAt: now,
          };
          nextNotifications = [notif, ...prev.notifications];
        }

        return {
          ...prev,
          comments: [...prev.comments, newComment],
          posts: prev.posts.map((p) =>
            p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
          ),
          notifications: nextNotifications,
        };
      });

      if (supabase) {
        await supabase.from('comments').insert({
          id: newComment.id,
          post_id: newComment.postId,
          author_id: newComment.authorId,
          body: newComment.body,
          kind: newComment.kind,
          likes_count: initialLikes,
          created_at: newComment.createdAt,
        });
        await supabase.from('posts').update({ comment_count: nextCount }).eq('id', postId);
      }
    },
    [currentUser, openAuthModal, store.posts]
  );

  const toggleCommentLike = useCallback(
    async (commentId: string) => {
      if (!currentUser) {
        openAuthModal('Sign in to upvote community workarounds and replies.');
        return;
      }

      const targetComment = store.comments.find((c) => c.id === commentId);
      if (!targetComment) return;

      const existingLikers = commentLikes[commentId] || [];
      const alreadyLiked = existingLikers.includes(currentUser.id);
      const nextLikers = alreadyLiked
        ? existingLikers.filter((id) => id !== currentUser.id)
        : [...existingLikers, currentUser.id];
      const nextLikesCount = alreadyLiked
        ? Math.max(0, (targetComment.likesCount || 0) - 1)
        : (targetComment.likesCount || 0) + 1;

      setCommentLikes((prev) => ({
        ...prev,
        [commentId]: nextLikers,
      }));

      setStore((prev) => ({
        ...prev,
        comments: prev.comments.map((c) =>
          c.id === commentId ? { ...c, likesCount: nextLikesCount } : c
        ),
      }));

      if (supabase) {
        // Vote rows, not a counter. The count is derived by a database trigger
        // so it cannot drift from the votes that actually exist — writing
        // likes_count directly is rejected by a guard trigger, because a
        // non-author's UPDATE would match zero rows and return success,
        // silently discarding the vote.
        if (alreadyLiked) {
          await supabase
            .from('comment_votes')
            .delete()
            .match({ comment_id: commentId, user_id: currentUser.id });
        } else {
          await supabase
            .from('comment_votes')
            .insert({ comment_id: commentId, user_id: currentUser.id });
        }
      }
    },
    [currentUser, openAuthModal, store.comments, commentLikes]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const target = store.comments.find((c) => c.id === commentId);
      if (!target) return;

      setStore((prev) => ({
        ...prev,
        comments: prev.comments.filter((c) => c.id !== commentId),
        posts: prev.posts.map((p) =>
          p.id === target.postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p
        ),
      }));

      if (supabase) {
        await supabase.from('comments').delete().eq('id', commentId);
      }
    },
    [store.comments]
  );

  const updatePostStatus = useCallback(
    async (postId: string, status: FeedbackStatus, officialNote?: string) => {
      if (!currentUser) return;
      const now = new Date().toISOString();
      const updaterLabel = currentUser.roleTitle
        ? `${currentUser.name} (${currentUser.roleTitle})`
        : currentUser.name;

      setStore((prev) => {
        const targetPost = prev.posts.find((p) => p.id === postId);
        let nextNotifications = prev.notifications;

        if (targetPost && targetPost.authorId !== currentUser.id) {
          const prod = prev.products.find((pr) => pr.id === targetPost.productId);
          const notif: NotificationItem = {
            id: `notif-${Date.now().toString(36)}`,
            recipientId: targetPost.authorId,
            actorId: currentUser.id,
            postId,
            productId: targetPost.productId,
            kind: 'status_change',
            title: `${prod?.name || 'Product'} • Status moved to ${status.replace('_', ' ')}`,
            message: officialNote
              ? `${updaterLabel}: "${officialNote}"`
              : `${updaterLabel} updated the status of "${targetPost.title}".`,
            isRead: false,
            createdAt: now,
          };
          nextNotifications = [notif, ...prev.notifications];
        }

        return {
          ...prev,
          posts: prev.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  status,
                  officialNote: officialNote !== undefined ? officialNote.trim() || undefined : p.officialNote,
                  officialUpdatedBy: updaterLabel,
                  officialUpdatedAt: now,
                }
              : p
          ),
          notifications: nextNotifications,
        };
      });

      if (supabase) {
        await supabase
          .from('posts')
          .update({
            status,
            official_note: officialNote?.trim() || null,
            official_updated_by: updaterLabel,
            official_updated_at: now,
          })
          .eq('id', postId);
      }
    },
    [currentUser]
  );

  const toggleFollowProduct = useCallback(
    async (productId: string) => {
      if (!currentUser) {
        openAuthModal('Sign in to follow products and customize your feed.');
        return;
      }

      const exists = store.follows.some(
        (f) => f.followerId === currentUser.id && f.targetType === 'product' && f.targetId === productId
      );
      const now = new Date().toISOString();

      setStore((prev) => ({
        ...prev,
        follows: exists
          ? prev.follows.filter(
              (f) => !(f.followerId === currentUser.id && f.targetType === 'product' && f.targetId === productId)
            )
          : [
              ...prev.follows,
              { followerId: currentUser.id, targetType: 'product', targetId: productId, createdAt: now },
            ],
        products: prev.products.map((p) =>
          p.id === productId
            ? { ...p, followersCount: exists ? Math.max(0, p.followersCount - 1) : p.followersCount + 1 }
            : p
        ),
      }));

      if (supabase) {
        if (exists) {
          await supabase
            .from('follows')
            .delete()
            .match({ follower_id: currentUser.id, target_type: 'product', target_id: productId });
        } else {
          await supabase.from('follows').insert({
            follower_id: currentUser.id,
            target_type: 'product',
            target_id: productId,
          });
        }
      }
    },
    [currentUser, openAuthModal, store.follows]
  );

  const toggleFollowUser = useCallback(
    async (targetUserId: string) => {
      if (!currentUser) {
        openAuthModal('Sign in to follow builders and see their signals in your Following feed.');
        return;
      }
      if (targetUserId === currentUser.id) return;

      const exists = store.follows.some(
        (f) => f.followerId === currentUser.id && f.targetType === 'user' && f.targetId === targetUserId
      );
      const now = new Date().toISOString();

      setStore((prev) => ({
        ...prev,
        follows: exists
          ? prev.follows.filter(
              (f) => !(f.followerId === currentUser.id && f.targetType === 'user' && f.targetId === targetUserId)
            )
          : [
              ...prev.follows,
              { followerId: currentUser.id, targetType: 'user', targetId: targetUserId, createdAt: now },
            ],
      }));

      if (supabase) {
        if (exists) {
          await supabase
            .from('follows')
            .delete()
            .match({ follower_id: currentUser.id, target_type: 'user', target_id: targetUserId });
        } else {
          await supabase.from('follows').insert({
            follower_id: currentUser.id,
            target_type: 'user',
            target_id: targetUserId,
          });
        }
      }
    },
    [currentUser, openAuthModal, store.follows]
  );

  const createProduct = useCallback(
    async (input: CreateProductInput): Promise<Product> => {
      let targetOrgId = input.orgId;
      let createdOrg: Organization | null = null;

      if (input.orgId === '__new__' && input.newOrgName?.trim()) {
        const orgName = input.newOrgName.trim();
        const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        targetOrgId = `org-${orgSlug}-${Date.now().toString(36).slice(-3)}`;
        createdOrg = {
          id: targetOrgId,
          slug: orgSlug,
          name: orgName,
          tagline: `Makers of ${input.name.trim()}`,
          logoUrl:
            input.logoUrl?.trim() ||
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
          websiteUrl: input.websiteUrl.trim() || 'https://example.com',
          isVerified: false,
        };
      }

      const cleanSlug =
        input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') ||
        input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const newProduct: Product = {
        id: `prod-${cleanSlug}-${Date.now().toString(36).slice(-3)}`,
        slug: cleanSlug,
        orgId: targetOrgId,
        name: input.name.trim(),
        tagline: input.tagline.trim(),
        description: input.description.trim() || input.tagline.trim(),
        category: input.category,
        logoUrl:
          input.logoUrl?.trim() ||
          'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=128&auto=format&fit=crop&q=80',
        websiteUrl: input.websiteUrl.trim() || 'https://example.com',
        isVerified: false,
        responsivenessRate: 85,
        avgResponseTime: '< 24h',
        followersCount: 1,
      };

      setStore((prev) => ({
        ...prev,
        organizations: createdOrg ? [...prev.organizations, createdOrg] : prev.organizations,
        products: [newProduct, ...prev.products],
        follows: currentUser
          ? [
              ...prev.follows,
              {
                followerId: currentUser.id,
                targetType: 'product',
                targetId: newProduct.id,
                createdAt: new Date().toISOString(),
              },
            ]
          : prev.follows,
      }));

      if (supabase) {
        if (createdOrg) {
          await supabase.from('organizations').insert({
            id: createdOrg.id,
            slug: createdOrg.slug,
            name: createdOrg.name,
            tagline: createdOrg.tagline,
            logo_url: createdOrg.logoUrl,
            website_url: createdOrg.websiteUrl,
            is_verified: false,
          });
        }
        await supabase.from('products').insert({
          id: newProduct.id,
          slug: newProduct.slug,
          org_id: newProduct.orgId,
          name: newProduct.name,
          tagline: newProduct.tagline,
          description: newProduct.description,
          category: newProduct.category,
          logo_url: newProduct.logoUrl,
          website_url: newProduct.websiteUrl,
          is_verified: false,
          responsiveness_rate: newProduct.responsivenessRate,
          avg_response_time: newProduct.avgResponseTime,
          followers_count: 1,
        });
      }

      return newProduct;
    },
    [currentUser]
  );

  const claimProductBoard = useCallback(
    async (
      productId: string,
      input: {
        workEmail: string;
        roleTitle?: string;
        verificationMethod?: 'email_domain' | 'dns_txt';
      }
    ): Promise<{ error?: string }> => {
      if (!currentUser) {
        openAuthModal('Sign in to claim and verify this product board.');
        return { error: 'Not signed in' };
      }

      const prod = store.products.find((p) => p.id === productId);
      if (!prod) return { error: 'Product board not found.' };

      const cleanEmail = input.workEmail.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { error: 'Please enter a valid company domain email address.' };
      }

      let targetOrgId = prod.orgId;
      let newlyCreatedOrg: Organization | null = null;

      // If this product was under the shared community-index org, spin out its own verified org
      const existingOrg = store.organizations.find((o) => o.id === prod.orgId);
      if (!existingOrg || existingOrg.slug === 'community-index' || prod.orgId === 'org-community') {
        targetOrgId = `org-${prod.slug}`;
        const alreadyHasDedicatedOrg = store.organizations.find((o) => o.id === targetOrgId);
        if (!alreadyHasDedicatedOrg) {
          newlyCreatedOrg = {
            id: targetOrgId,
            slug: prod.slug,
            name: `${prod.name} Team`,
            tagline: `Verified makers of ${prod.name}`,
            logoUrl: prod.logoUrl,
            websiteUrl: prod.websiteUrl,
            isVerified: true,
          };
        }
      }

      const nextRoleTitle = input.roleTitle?.trim() || `${prod.name} Maintainer`;

      setStore((prev) => ({
        ...prev,
        organizations: newlyCreatedOrg
          ? [...prev.organizations, newlyCreatedOrg]
          : prev.organizations.map((o) =>
              o.id === targetOrgId ? { ...o, isVerified: true } : o
            ),
        products: prev.products.map((p) =>
          p.id === productId
            ? { ...p, orgId: targetOrgId, isVerified: true, responsivenessRate: Math.max(p.responsivenessRate, 92) }
            : p
        ),
        profiles: prev.profiles.map((u) =>
          u.id === currentUser.id
            ? {
                ...u,
                role: u.role === 'admin' ? 'admin' : 'maintainer',
                managedOrgId: targetOrgId,
                roleTitle: nextRoleTitle,
              }
            : u
        ),
      }));

      if (supabase) {
        if (newlyCreatedOrg) {
          await supabase.from('organizations').upsert({
            id: newlyCreatedOrg.id,
            slug: newlyCreatedOrg.slug,
            name: newlyCreatedOrg.name,
            tagline: newlyCreatedOrg.tagline,
            logo_url: newlyCreatedOrg.logoUrl,
            website_url: newlyCreatedOrg.websiteUrl,
            is_verified: true,
          });
        } else {
          await supabase
            .from('organizations')
            .update({ is_verified: true })
            .eq('id', targetOrgId);
        }

        await supabase
          .from('products')
          .update({
            org_id: targetOrgId,
            is_verified: true,
          })
          .eq('id', productId);

        await supabase
          .from('profiles')
          .update({
            role: currentUser.role === 'admin' ? 'admin' : 'maintainer',
            managed_org_id: targetOrgId,
            role_title: nextRoleTitle,
          })
          .eq('id', currentUser.id);
      }

      return {};
    },
    [currentUser, openAuthModal, store.products, store.organizations]
  );

  const markNotificationRead = useCallback((notifId: string) => {
    setStore((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notifId ? { ...n, isRead: true } : n
      ),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    if (!currentUser) return;
    setStore((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.recipientId === currentUser.id ? { ...n, isRead: true } : n
      ),
    }));
  }, [currentUser]);

  const resetLocalDemoData = useCallback(() => {
    localStorage.removeItem(LOCAL_DB_KEY);
    setStore({
      organizations: SEED_ORGANIZATIONS,
      products: SEED_PRODUCTS,
      profiles: SEED_PROFILES,
      posts: SEED_POSTS,
      comments: SEED_COMMENTS,
      votes: SEED_VOTES,
      reposts: SEED_REPOSTS,
      follows: SEED_FOLLOWS,
      notifications: SEED_NOTIFICATIONS,
    });
    setActiveUserId('usr-albert');
  }, []);

  const userNotifications = useMemo(() => {
    if (!currentUser) return [];
    return store.notifications.filter((n) => n.recipientId === currentUser.id);
  }, [currentUser, store.notifications]);

  const value: StoreContextValue = {
    organizations: store.organizations,
    products: store.products,
    profiles: store.profiles,
    posts: store.posts,
    comments: store.comments,
    votes: store.votes,
    reposts: store.reposts,
    follows: store.follows,
    notifications: userNotifications,
    currentUser,
    isSupabaseLive: isSupabaseConnected,

    getProductById,
    getProductBySlug,
    getOrgById,
    getOrgBySlug,
    getProfileById,
    getProfileByHandle,
    hasUserVoted,
    hasUserReposted,
    hasUserLikedComment,
    isFollowingProduct,
    isFollowingUser,
    canManageProduct,

    signInAsProfile,
    signInOrRegisterWithEmail,
    signInWithPassword,
    signUpWithPassword,
    signInWithMagicLink,
    signInWithOAuthProvider,
    signOut,
    updateCurrentProfile,

    createPost,
    deletePost,
    toggleUpvote,
    toggleRepost,
    addComment,
    toggleCommentLike,
    deleteComment,
    updatePostStatus,
    toggleFollowProduct,
    toggleFollowUser,
    createProduct,
    claimProductBoard,
    markNotificationRead,
    markAllNotificationsRead,
    resetLocalDemoData,

    isAuthModalOpen,
    authModalPrompt,
    openAuthModal,
    closeAuthModal,
    isCreateProductModalOpen,
    openCreateProductModal,
    closeCreateProductModal,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}
