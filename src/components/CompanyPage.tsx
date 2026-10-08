import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  ChevronRight,
  Building2, 
  ExternalLink, 
  ShieldCheck, 
  CheckCircle2, 
  Users, 
  MapPin, 
  Calendar, 
  Layers, 
  Clock, 
  Check, 
  ArrowRight, 
  Github, 
  FileText, 
  Globe, 
  Mail, 
  Sparkles,
  Briefcase,
  UserPlus,
  Plus,
  AlertCircle
} from 'lucide-react';
import { Company, Product, FeedbackItem, UserProfile } from '../types';
import { FeedbackCard } from './FeedbackCard';
import { FilterDropdown } from './FilterDropdown';

interface CompanyPageProps {
  company: Company;
  products: Product[];
  feedbackItems: FeedbackItem[];
  currentUser?: UserProfile | null;
  onBack: () => void;
  onOpenProduct: (product: Product) => void;
  onOpenDetails: (item: FeedbackItem) => void;
  onVote: (id: string) => void;
  onOpenShare: (item: FeedbackItem) => void;
  onOpenProfile?: (handle: string, name: string, avatar: string) => void;
  onClaimOrg?: (company: Company) => void;
  onInviteMember?: (companyId: string, member: { name: string; email: string; roleTitle: string }) => void;
  onAddProductToOrg?: (company: Company) => void;
}

export const CompanyPage: React.FC<CompanyPageProps> = ({
  company,
  products,
  feedbackItems,
  currentUser = null,
  onBack,
  onOpenProduct,
  onOpenDetails,
  onVote,
  onOpenShare,
  onOpenProfile,
  onClaimOrg,
  onInviteMember,
  onAddProductToOrg,
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'team'>('products');
  const [statusFilter, setStatusFilter] = useState<'all' | 'shipped'>('all');
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'trending' | 'top' | 'newest'>('trending');

  // Team Invite Form State
  const [isInviting, setIsInviting] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Product Manager');
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const isOrgOwnerOrPM = Boolean(
    currentUser && (
      currentUser.role === 'admin' ||
      currentUser.companyId === company.id ||
      (currentUser.companyOrOrg && currentUser.companyOrOrg.toLowerCase() === company.name.toLowerCase())
    )
  );

  // Products belonging to this company
  const companyProducts = useMemo(() => {
    return products.filter(
      (p) => p.companyId === company.id || (p.companyName && p.companyName.toLowerCase() === company.name.toLowerCase())
    );
  }, [products, company.id, company.name]);

  const companyProductIds = useMemo(() => {
    return new Set(companyProducts.map((p) => p.id));
  }, [companyProducts]);

  // Feedback items across all company products
  const companyFeedback = useMemo(() => {
    return feedbackItems.filter((item) => companyProductIds.has(item.productId));
  }, [feedbackItems, companyProductIds]);

  // Aggregate metrics
  const totalSignals = useMemo(() => {
    return companyProducts.reduce((sum, p) => sum + (p.totalFeedbackCount || 0), 0);
  }, [companyProducts]);

  const totalShipped = useMemo(() => {
    return companyProducts.reduce((sum, p) => sum + (p.resolvedFeedbackCount || 0), 0);
  }, [companyProducts]);

  const shippedFeedback = useMemo(() => {
    return companyFeedback.filter((item) => item.status === 'shipped');
  }, [companyFeedback]);

  // Filtered feedback for always-on Company Signals section
  const displayedFeedback = useMemo(() => {
    let items = statusFilter === 'shipped' ? shippedFeedback : companyFeedback;

    if (selectedProductFilter !== 'all') {
      items = items.filter((item) => item.productId === selectedProductFilter);
    }

    if (categoryFilter !== 'all') {
      items = items.filter((item) => item.category === categoryFilter);
    }

    return [...items].sort((a, b) => {
      if (sortBy === 'trending') {
        return b.meTooCount + b.repostCount * 2 - (a.meTooCount + a.repostCount * 2);
      } else if (sortBy === 'top') {
        return b.meTooCount - a.meTooCount;
      } else {
        return b.id.localeCompare(a.id);
      }
    });
  }, [statusFilter, shippedFeedback, companyFeedback, selectedProductFilter, categoryFilter, sortBy]);

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
          {company.name}
        </span>
      </nav>

      {/* Organisation Hero Card */}
      <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <img
              src={company.logo}
              alt={company.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-zinc-200 dark:border-zinc-700 shadow-sm flex-shrink-0"
            />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                  {company.name}
                </h1>

                {company.isClaimed ? (
                  <span title="Claimed & Verified Organisation" className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Claimed Org</span>
                  </span>
                ) : (
                  <span title="Unclaimed Organisation" className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span>Unclaimed Org</span>
                  </span>
                )}

                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {companyProducts.length} {companyProducts.length === 1 ? 'Product' : 'Products'} Subsumed
                </span>
              </div>

              <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-xl">
                {company.description}
              </p>

              {/* Organisation Metadata Row */}
              <div className="flex items-center gap-3.5 pt-1 text-xs text-zinc-400 flex-wrap">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-zinc-400" />
                  <span>{company.hqLocation}</span>
                </div>

                <span>•</span>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-zinc-400" />
                  <span>Est. {company.foundedYear}</span>
                </div>

                <span>•</span>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-zinc-400" />
                  <span>{company.companySize}</span>
                </div>

                {company.domain && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-[11px] text-zinc-500">
                      @{company.domain}
                    </span>
                  </>
                )}
              </div>

              {/* External Corporate Links */}
              <div className="flex items-center gap-3 pt-2 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
                <a
                  href={company.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 transition-colors group/link"
                  title={`Visit ${company.name} website (${company.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')})`}
                >
                  <Globe className="w-3 h-3 text-zinc-400 group-hover/link:text-zinc-600 dark:group-hover/link:text-zinc-200" />
                  <span>{company.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                </a>

                {company.careersUrl && (
                  <>
                    <span>•</span>
                    <a
                      href={company.careersUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors text-indigo-600 dark:text-indigo-400 font-medium"
                    >
                      <Briefcase className="w-3 h-3" />
                      <span>We're Hiring</span>
                    </a>
                  </>
                )}

                {company.engineeringBlogUrl && (
                  <>
                    <span>•</span>
                    <a
                      href={company.engineeringBlogUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Blog</span>
                    </a>
                  </>
                )}

                {company.githubUrl && (
                  <>
                    <span>•</span>
                    <a
                      href={company.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Github className="w-3 h-3" />
                      <span>GitHub</span>
                    </a>
                  </>
                )}

                {company.twitterHandle && (
                  <>
                    <span>•</span>
                    <a
                      href={`https://x.com/${company.twitterHandle.replace('@', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                      title={`Follow ${company.name} on X`}
                    >
                      <svg className="w-3 h-3 fill-current flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      <span>{company.twitterHandle}</span>
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Action: Claim Org or Invite Staff */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto flex-shrink-0">
            {company.isClaimed ? (
              isOrgOwnerOrPM ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('team');
                    setIsInviting(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invite PM / Engineer</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Official Org Active</span>
                </span>
              )
            ) : (
              <button
                type="button"
                onClick={() => onClaimOrg && onClaimOrg(company)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer animate-pulse hover:animate-none"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Claim {company.name}</span>
              </button>
            )}
          </div>
        </div>

        {/* Organisation Responsiveness & Suite Scorecard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-center">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
              {companyProducts.length}
            </p>
            <p className="text-[11px] text-zinc-500">Suite Products</p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
              {totalSignals}
            </p>
            <p className="text-[11px] text-zinc-500">Community Signals</p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {totalShipped}
            </p>
            <p className="text-[11px] text-zinc-500">Delivered Fixes</p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-100 dark:border-zinc-800/80">
            <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">
              {company.avgResponseTime}
            </p>
            <p className="text-[11px] text-zinc-500">Avg Response Time</p>
          </div>
        </div>
      </div>

      {/* Unclaimed Org Callout Banner */}
      {!company.isClaimed && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent border border-indigo-200 dark:border-indigo-900/60 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                Claim {company.name} to Subsume All {companyProducts.length} Products
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 max-w-xl">
                Verifying your corporate email (<code>@{company.domain || 'work-email'}</code>) instantly activates verified product team management, roadmap controls, and official response badges across all products in this suite.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClaimOrg && onClaimOrg(company)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Claim Organization</span>
          </button>
        </div>
      )}

      {/* Top Suite & Governance Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-3 overflow-x-auto scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'products'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Product Suite ({companyProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'team'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Staff ({company.verifiedMembers.length})</span>
          </button>
        </div>

        {/* Tab 1: Product Suite Grid */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Subsumed Product Suite ({companyProducts.length})
                </h3>
                <p className="text-xs text-zinc-500">
                  {company.isClaimed 
                    ? `All products verified under ${company.name}'s official organizational umbrella`
                    : `Claim ${company.name} to verify and manage all products in this suite`}
                </p>
              </div>

              {isOrgOwnerOrPM && onAddProductToOrg && (
                <button
                  type="button"
                  onClick={() => onAddProductToOrg(company)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Product in Suite</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {companyProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => onOpenProduct(prod)}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={prod.logo}
                        alt={prod.name}
                        className="w-11 h-11 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs group-hover:scale-105 transition-transform"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm text-zinc-900 dark:text-white group-hover:underline">
                            {prod.name}
                          </h3>
                          {prod.verifiedOwner && (
                            <span title="Subsumed & Verified Product" className="inline-flex items-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {prod.category}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 group-hover:text-zinc-900 dark:group-hover:text-white transition-all" />
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {prod.tagline}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                    <span className="flex items-center gap-1">
                      {prod.verifiedOwner ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Subsumed & Verified
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Unclaimed Product
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {prod.responsivenessRate}% responsiveness
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Verified Team Roster & Security Contacts */}
        {activeTab === 'team' && (
          <div className="space-y-5">
            {!company.isClaimed ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-50 dark:bg-zinc-850/60 border border-dashed border-zinc-300 dark:border-zinc-700 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                  No Verified Team Members Yet
                </h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  {company.name} has not yet been claimed. Verify your corporate email to become the Lead PM, claim this organization, and build your verified staff roster.
                </p>
                <button
                  type="button"
                  onClick={() => onClaimOrg && onClaimOrg(company)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Claim {company.name}</span>
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                      Official Product Team Roster ({company.verifiedMembers.length})
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Verified representatives authorized to review feedback and ship updates for {company.name}
                    </p>
                  </div>

                  {isOrgOwnerOrPM && (
                    <button
                      type="button"
                      onClick={() => setIsInviting(!isInviting)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isInviting ? 'Close Invite Form' : 'Invite Team Member'}</span>
                    </button>
                  )}
                </div>

                {/* Inline Invite Form */}
                {isInviting && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setInviteError(null);
                      if (!inviteName.trim() || !inviteEmail.trim()) return;

                      // Validate work email domain if company domain is configured
                      if (company.domain) {
                        const emailDomain = inviteEmail.split('@')[1]?.toLowerCase();
                        const orgDomain = company.domain.toLowerCase();
                        if (emailDomain && !emailDomain.includes(orgDomain.split('.')[0])) {
                          setInviteError(`Work email domain mismatch. Expected @${company.domain}`);
                          return;
                        }
                      }

                      if (onInviteMember) {
                        onInviteMember(company.id, {
                          name: inviteName.trim(),
                          email: inviteEmail.trim(),
                          roleTitle: inviteRole.trim() || 'Product Manager',
                        });
                      }
                      setInviteSuccess(`Invited ${inviteName.trim()} (${inviteEmail.trim()}) to verified PM roster!`);
                      setInviteName('');
                      setInviteEmail('');
                      setTimeout(() => setInviteSuccess(null), 4000);
                    }}
                    className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-855/80 border border-zinc-200 dark:border-zinc-700 space-y-3"
                  >
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Invite Verified Colleague to {company.name}</span>
                    </h4>

                    {inviteError && (
                      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{inviteError}</span>
                      </div>
                    )}

                    {inviteSuccess && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>{inviteSuccess}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        required
                        placeholder="Colleague's Full Name"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none"
                      />
                      <input
                        type="email"
                        required
                        placeholder={`colleague@${company.domain || 'company.com'}`}
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none"
                      >
                        <option value="Product Manager">Product Manager</option>
                        <option value="Senior PM">Senior PM</option>
                        <option value="Staff Software Engineer">Staff Software Engineer</option>
                        <option value="Head of Design">Head of Design</option>
                        <option value="DevRel Lead">DevRel Lead</option>
                      </select>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsInviting(false)}
                        className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                      >
                        Add to Verified Roster
                      </button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {company.verifiedMembers.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => onOpenProfile && onOpenProfile(member.handle, member.name, member.avatar)}
                      className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group flex items-center gap-3.5"
                    >
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="w-12 h-12 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs group-hover:scale-105 transition-transform"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-white group-hover:underline truncate">
                            {member.name}
                          </span>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {member.roleTitle}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {member.handle}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Official Security & Escalation Card */}
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/80 dark:border-zinc-800 text-xs space-y-2">
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                <span>Security & Corporate Escalations</span>
              </h4>
              <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed text-[11px]">
                To report critical security vulnerabilities or request corporate SLAs across {company.name}'s suite of products, please contact{' '}
                <a
                  href={`mailto:${company.securityContact || 'security@' + company.websiteUrl.replace('https://', '')}`}
                  className="text-zinc-900 dark:text-white font-medium underline"
                >
                  {company.securityContact || 'security@' + company.websiteUrl.replace('https://', '')}
                </a>
                .
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ALWAYS-ON ORGANISATION SIGNALS SECTION */}
      <section className="mt-10 pt-8 border-t border-zinc-200 dark:border-zinc-850 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Organisation Signals
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {companyFeedback.length}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Live community feedback, bugs, and feature requests across all {company.name} products
            </p>
          </div>

          {/* Quick status pill toggle */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-850 rounded-xl text-xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-zinc-750 text-zinc-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              All Signals ({companyFeedback.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('shipped')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === 'shipped'
                  ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Shipped ({shippedFeedback.length})</span>
            </button>
          </div>
        </div>

        {/* Filter controls toolbar: Product pills & Category filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs pb-1">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            <span className="text-zinc-400 text-[11px] font-medium flex-shrink-0">Product:</span>
            <button
              type="button"
              onClick={() => setSelectedProductFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex-shrink-0 ${
                selectedProductFilter === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              All Products
            </button>
            {companyProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProductFilter(p.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer flex-shrink-0 ${
                  selectedProductFilter === p.id
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <img src={p.logo} alt={p.name} className="w-3.5 h-3.5 rounded-full object-cover" />
                <span>{p.name}</span>
                {p.totalFeedbackCount > 0 && (
                  <span className="text-[10px] opacity-70">({p.totalFeedbackCount})</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 flex-shrink-0">
            <FilterDropdown
              label="Type"
              selectedValue={categoryFilter}
              onSelect={setCategoryFilter}
              options={[
                { id: 'all', label: 'All Types' },
                { id: 'bug', label: 'Bugs' },
                { id: 'ux', label: 'UX' },
                { id: 'feature', label: 'Features' },
                { id: 'performance', label: 'Performance' },
              ]}
            />
          </div>
        </div>

        {/* Live List */}
        {displayedFeedback.length === 0 ? (
          <div className="py-14 text-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-400">
            No feedback items found matching this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {displayedFeedback.map((item) => {
              const itemProduct = products.find((p) => p.id === item.productId);
              return (
                <FeedbackCard
                  key={item.id}
                  item={item}
                  product={itemProduct}
                  onVote={onVote}
                  onOpenDetails={onOpenDetails}
                  onOpenShare={onOpenShare}
                  onOpenProfile={onOpenProfile}
                  onOpenProduct={onOpenProduct}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
