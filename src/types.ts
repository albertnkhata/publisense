export type FeedbackCategory = 'bug' | 'feature' | 'ux' | 'pricing' | 'performance';

export type FeedbackStatus = 
  | 'under_review' 
  | 'considering' 
  | 'planned' 
  | 'in_progress' 
  | 'shipped' 
  | 'wont_do';

export type Severity = 'annoyance' | 'friction' | 'blocker';

export interface Comment {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  roleBadge?: 'admin_verified' | 'team_verified' | 'top_contributor' | 'user';
  text: string;
  createdAt: string;
  type: 'general' | 'workaround' | 'system_info' | 'official_response';
  likes: number;
  hasLiked?: boolean;
  isEdited?: boolean;
  editedAt?: string;
}

export interface FeedbackItem {
  id: string;
  productId: string;
  title: string;
  experienceDescription: string;
  desiredChange?: string;
  category: FeedbackCategory;
  severity: Severity;
  status: FeedbackStatus;
  statusUpdateNote?: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  meTooCount: number;
  hasUserVoted: boolean;
  repostCount: number;
  hasUserReposted: boolean;
  comments: Comment[];
  createdAt: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  tags: string[];
  imageUrl?: string;
  images?: string[];
  similarDuplicateCount?: number;
  isEdited?: boolean;
  editedAt?: string;
  isWithdrawn?: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  logo: string;
  category: string;
  verifiedOwner: boolean;
  officialTeamName?: string;
  companyId?: string;
  companyName?: string;
  totalFeedbackCount: number;
  resolvedFeedbackCount: number;
  responsivenessRate: number; // e.g. 94%
  followersCount?: number;
  twitterHandle: string;
  websiteUrl: string;
  isTrending?: boolean;
  isFeatured?: boolean;
}

export interface VerifiedTeamMember {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  roleTitle: string;
  role?: 'org_admin' | 'team_member';
  joinedAt?: string;
  email?: string;
}

export interface Company {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  logo: string;
  hqLocation: string;
  foundedYear: number;
  companySize: string; // e.g. "100-250 employees"
  websiteUrl: string;
  careersUrl?: string;
  engineeringBlogUrl?: string;
  githubUrl?: string;
  twitterHandle?: string;
  statusPageUrl?: string;
  securityContact?: string;
  avgResponseTime: string; // e.g. "< 4 hours"
  verifiedMembers: VerifiedTeamMember[];
  isClaimed?: boolean;
  domain?: string;
  allowedDomains?: string[];
  claimedById?: string;
  claimedByName?: string;
  claimedAt?: string;
  pendingInvites?: { email: string; invitedBy: string; invitedAt: string; roleTitle?: string }[];
}

export type ViewMode = 'feed' | 'leaderboard';
export type UserRole = 'user' | 'company_pm' | 'admin';
export type AuthProviderType = 'google' | 'password' | 'seed';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  workEmail?: string;
  handle: string;
  avatar: string;
  role: UserRole;
  roleTitle?: string;
  bio?: string;
  companyOrOrg?: string;
  companyId?: string;
  location?: string;
  joinedDate?: string;
  upvotedItemIds?: string[];
  followerCount?: number;
  followingCount?: number;
  authProvider?: AuthProviderType;
  googleUid?: string;
}
