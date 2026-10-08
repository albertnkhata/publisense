import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Milestone,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Search,
  X,
  Plus,
  Check,
  FileText,
  AlertCircle,
  Users,
  Database,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Sliders,
  Terminal,
  ExternalLink,
  Code2
} from 'lucide-react';

interface InternalDocsPageProps {
  onBack: () => void;
}

interface FeatureSpec {
  id: string;
  category: 'core' | 'org' | 'security' | 'ai' | 'infra';
  title: string;
  intendedFunction: string;
  userRoles: string[];
  keyCapabilities: string[];
  status: 'production' | 'in_development' | 'planned';
}

interface RoadmapItem {
  id: string;
  phase: 'now' | 'next' | 'future';
  phaseLabel: string;
  title: string;
  description: string;
  category: 'Integration' | 'Security' | 'AI & Automation' | 'Developer Platform' | 'Analytics';
  eta: string;
  isShipped?: boolean;
}

const INITIAL_FEATURE_SPECS: FeatureSpec[] = [
  {
    id: 'feat-crowd-signals',
    category: 'core',
    title: 'Crowd-Signal Feedback & Duplicate Prevention',
    intendedFunction: 'Consolidates community feedback around single canonical issues using the Upvote counter and repost mechanics rather than fragmenting feedback across dozens of duplicate tickets.',
    userRoles: ['Community User', 'Verified PM', 'Platform Admin'],
    keyCapabilities: [
      'Upvote aggregation displaying total affected users',
      'Community workarounds pinned for user-to-user assistance',
      'Repost count mechanics amplifying severe product blockers',
      'Instant keyword and similarity detection during submission to suggest existing threads'
    ],
    status: 'production'
  },
  {
    id: 'feat-org-subsumption',
    category: 'org',
    title: 'Organisation Umbrella & Suite Subsumption',
    intendedFunction: 'Allows verified parent organisations (e.g. Anthropic, Vercel, Anysphere) to claim corporate ownership and automatically subsume, manage, and verify all suite products under one unified portal.',
    userRoles: ['Corporate PM', 'Platform Admin'],
    keyCapabilities: [
      'Corporate email domain DNS verification (e.g. @anthropic.com)',
      'Automatic cascading verification to all child suite products',
      'Team member invitations and verified staff roster management',
      'Corporate escalation SLA and security contact endpoints'
    ],
    status: 'production'
  },
  {
    id: 'feat-author-crud',
    category: 'core',
    title: 'Author Self-Service & Community Safeguard Protocol',
    intendedFunction: 'Empowers authors to manage their submissions and comments while safeguarding community discourse history once issues gain momentum.',
    userRoles: ['Feedback Author', 'Comment Author', 'Platform Admin'],
    keyCapabilities: [
      'Inline edit modal for feedback title, description, proposed solution, and category',
      'Transparent (edited) timestamp audit trail',
      'Permanent deletion for early-stage issues without team engagement',
      '"Withdraw Request" flow for high-momentum issues (≥5 upvotes or PM status) to preserve community thread context'
    ],
    status: 'production'
  },
  {
    id: 'feat-roadmap-lifecycle',
    category: 'core',
    title: 'Status Progression & Radar Accountability',
    intendedFunction: 'Provides a closed-loop feedback lifecycle with transparent team statuses, creating public accountability and closing the feedback gap.',
    userRoles: ['Verified PM', 'Platform Admin'],
    keyCapabilities: [
      'Multi-stage status: Under Review -> Considering -> Planned -> In Progress -> Shipped / Declined',
      'Official Team Responses with verified PM badge and status justification',
      'Public Responsiveness Radar score calculated from response speed and resolution rate',
      'Automatic status notifications broadcast to all upvoters'
    ],
    status: 'production'
  },
  {
    id: 'feat-rbac-dual-badge',
    category: 'security',
    title: 'Dual-Entity Verification & RBAC Governance',
    intendedFunction: 'Strictly segregates platform administrator governance from verified commercial organisation staff to prevent impersonation.',
    userRoles: ['Platform Admin', 'Organisation PM', 'Community Member'],
    keyCapabilities: [
      'Purple Shield Platform Admin badge (super-moderation, global overrides, verification grants)',
      'Emerald Checkmark Verified Organisation Staff badge (suite roadmaps, official replies)',
      'Author badge distinguishing original report creators in discussion threads',
      'Non-repudiable audit logs of edits and moderation actions'
    ],
    status: 'production'
  },
  {
    id: 'feat-firestore-realtime',
    category: 'infra',
    title: 'Real-Time Firestore Persistence Layer',
    intendedFunction: 'Provides seamless multi-device synchronization and persistent cloud storage for all feedback, organisations, suite products, and notifications.',
    userRoles: ['System'],
    keyCapabilities: [
      'Automatic seeding bootstrap on first deployment',
      'Real-time Firestore snapshot listeners on /feedback, /companies, /products, and /notifications',
      'Graceful offline fallback with optimistic local state updates',
      'Granular document update payloads reducing network overhead'
    ],
    status: 'production'
  },
  {
    id: 'feat-gemini-ai',
    category: 'ai',
    title: 'Gemini AI Intelligent Deduplication & Triage',
    intendedFunction: 'Leverages Google Gemini 2.5/Flash to analyze incoming feedback against existing reports, generate executive summaries, and cluster issues into thematic roadmaps.',
    userRoles: ['All Users', 'PMs'],
    keyCapabilities: [
      'Real-time semantic similarity checks during feedback composition',
      'Automated categorization (Bug, UX, Feature, Performance) inference',
      'AI Strategic Radar synthesizing top user pain points across product suites',
      'Duplicate cluster recommendations with merge proposals'
    ],
    status: 'production'
  }
];

const INITIAL_ROADMAP: RoadmapItem[] = [
  {
    id: 'road-1',
    phase: 'now',
    phaseLabel: 'Current Release (v1.2)',
    title: 'Organisation Subsumption & Author Self-Service',
    description: 'Organisation page overhaul with always-on signals, author edit/withdraw safeguards, and persistent Firestore schema.',
    category: 'Developer Platform',
    eta: 'Q4 2026',
    isShipped: true
  },
  {
    id: 'road-2',
    phase: 'next',
    phaseLabel: 'Upcoming (Q1 2027)',
    title: 'Bidirectional Jira, Linear & GitHub Webhooks',
    description: 'Automatically transition CrowdPulse statuses to "Shipped" or "In Progress" when corresponding pull requests merge or Linear tickets close.',
    category: 'Integration',
    eta: 'Jan 2027',
    isShipped: false
  },
  {
    id: 'road-3',
    phase: 'next',
    phaseLabel: 'Upcoming (Q1 2027)',
    title: 'Enterprise SAML / Okta SSO for Verified Orgs',
    description: 'One-click automated employee onboarding for verified organisations via Google Workspace and Okta SAML domains.',
    category: 'Security',
    eta: 'Feb 2027',
    isShipped: false
  },
  {
    id: 'road-4',
    phase: 'next',
    phaseLabel: 'Upcoming (Q1 2027)',
    title: 'AI Automated Duplicate Clustering & Merge Queue',
    description: 'Gemini vector embedding pipeline to cluster duplicate feedback tickets with automatic upvote consolidation upon admin approval.',
    category: 'AI & Automation',
    eta: 'March 2027',
    isShipped: false
  },
  {
    id: 'road-5',
    phase: 'future',
    phaseLabel: 'Future Horizon (Q2-Q3 2027)',
    title: 'Embeddable In-App "Public Radar" Widget',
    description: 'Drop-in <script> tag enabling SaaS developers to embed their CrowdPulse live signal radar directly in their web apps.',
    category: 'Developer Platform',
    eta: 'Q2 2027',
    isShipped: false
  },
  {
    id: 'road-6',
    phase: 'future',
    phaseLabel: 'Future Horizon (Q2-Q3 2027)',
    title: 'Public Changelog & Product Release Feed',
    description: 'Dedicated changelog engine linking shipped CrowdPulse customer signals directly to release notes and user notifications.',
    category: 'Analytics',
    eta: 'Q3 2027',
    isShipped: false
  }
];

export const InternalDocsPage: React.FC<InternalDocsPageProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'features' | 'roadmap' | 'rbac' | 'architecture'>('features');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [roadmapPhaseFilter, setRoadmapPhaseFilter] = useState<'all' | 'now' | 'next' | 'future'>('all');

  // Custom roadmap item creation state
  const [customRoadmapItems, setCustomRoadmapItems] = useState<RoadmapItem[]>(() => {
    try {
      const saved = localStorage.getItem('crowdpulse_custom_roadmap');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isAddingRoadmap, setIsAddingRoadmap] = useState(false);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState('');
  const [newRoadmapDesc, setNewRoadmapDesc] = useState('');
  const [newRoadmapCategory, setNewRoadmapCategory] = useState<RoadmapItem['category']>('Developer Platform');
  const [newRoadmapPhase, setNewRoadmapPhase] = useState<'now' | 'next' | 'future'>('next');
  const [newRoadmapEta, setNewRoadmapEta] = useState('Q1 2027');

  const allRoadmapItems = [...INITIAL_ROADMAP, ...customRoadmapItems];

  // Filter features
  const filteredFeatures = useMemo(() => {
    return INITIAL_FEATURE_SPECS.filter((f) => {
      const matchesSearch =
        f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.intendedFunction.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.keyCapabilities.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || f.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  // Filter roadmap
  const filteredRoadmap = useMemo(() => {
    return allRoadmapItems.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPhase = roadmapPhaseFilter === 'all' || item.phase === roadmapPhaseFilter;
      return matchesSearch && matchesPhase;
    });
  }, [allRoadmapItems, searchQuery, roadmapPhaseFilter]);

  const handleCreateRoadmapItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoadmapTitle.trim()) return;

    const newItem: RoadmapItem = {
      id: `road-custom-${Date.now()}`,
      phase: newRoadmapPhase,
      phaseLabel: newRoadmapPhase === 'now' ? 'In Progress' : newRoadmapPhase === 'next' ? 'Upcoming (Next)' : 'Future Horizon',
      title: newRoadmapTitle.trim(),
      description: newRoadmapDesc.trim() || 'Internal milestone note created by admin.',
      category: newRoadmapCategory,
      eta: newRoadmapEta.trim() || '2027',
      isShipped: false,
    };

    const updated = [newItem, ...customRoadmapItems];
    setCustomRoadmapItems(updated);
    try {
      localStorage.setItem('crowdpulse_custom_roadmap', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save custom roadmap', e);
    }

    setNewRoadmapTitle('');
    setNewRoadmapDesc('');
    setIsAddingRoadmap(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-200">
      {/* Top Breadcrumb & Back Navigation */}
      <nav className="flex items-center gap-2 text-xs text-zinc-500 mb-6 flex-wrap" aria-label="Breadcrumb">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Profile</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 flex-shrink-0" />
        <span className="text-zinc-400">Admin Portal</span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 flex-shrink-0" />
        <span className="font-semibold text-zinc-900 dark:text-white" aria-current="page">
          Internal Documentation & Roadmap
        </span>
      </nav>

      {/* Hero Header Card */}
      <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-xs flex-shrink-0">
              <BookOpen className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                  Internal Product Documentation & Technical Specs
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin Governance
                </span>
              </div>

              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                Comprehensive living specifications of CrowdPulse systems, recorded behavioral functions, role-based access rules, and the multi-phase engineering roadmap.
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end flex-shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/80 border border-zinc-200/80 dark:border-zinc-800 text-center">
              <p className="text-lg font-bold text-zinc-900 dark:text-white">{INITIAL_FEATURE_SPECS.length}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Active Systems</p>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/80 border border-zinc-200/80 dark:border-zinc-800 text-center">
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{allRoadmapItems.length}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Roadmap Goals</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('features')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'features'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Features & Functions</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200/60 dark:bg-zinc-700/60">
                {INITIAL_FEATURE_SPECS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('roadmap')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'roadmap'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Milestone className="w-4 h-4" />
              <span>Product Roadmap</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200/60 dark:bg-zinc-700/60">
                {allRoadmapItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rbac')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'rbac'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>RBAC Governance</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('architecture')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'architecture'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Architecture & Sync</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex items-center min-w-[220px] sm:w-72">
            <Search className="absolute left-3 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search specs, functions, roadmap..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Page Content Body */}
      <div className="space-y-6">
        {/* ==================== TAB 1: FEATURES & INTENDED FUNCTIONS ==================== */}
        {activeTab === 'features' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Features & Intended Functions Directory
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Defines the core design intent, user behavioral boundaries, and technical mechanics of each capability.
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
                {['all', 'core', 'org', 'security', 'infra', 'ai'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer capitalize ${
                      selectedCategory === cat
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold'
                        : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {cat === 'all' ? 'All Systems' : cat}
                  </button>
                ))}
              </div>
            </div>

            {filteredFeatures.length === 0 ? (
              <div className="py-16 text-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
                No feature specifications found matching "{searchQuery}".
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredFeatures.map((feat) => (
                  <div
                    key={feat.id}
                    className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                          {feat.title}
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {feat.category}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {feat.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Allowed User Roles */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {feat.userRoles.map((role) => (
                          <span
                            key={role}
                            className="px-2.5 py-1 rounded-md text-[11px] bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium border border-purple-200/60 dark:border-purple-900/60"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Intended Behavioral Function Box */}
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/80 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
                      <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 block">
                        Intended Function & Behavioral Goal:
                      </span>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {feat.intendedFunction}
                      </p>
                    </div>

                    {/* Key Technical Capabilities */}
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
                        Key Capabilities & Operational Mechanics
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                        {feat.keyCapabilities.map((cap, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-zinc-50/50 dark:bg-zinc-850/40 border border-zinc-150 dark:border-zinc-800/80 flex items-start gap-2"
                          >
                            <ChevronRight className="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
                            <span>{cap}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 2: PRODUCT ROADMAP & MILESTONES ==================== */}
        {activeTab === 'roadmap' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  CrowdPulse Engineering Roadmap
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Phased rollout milestones tracking automated issue sync, enterprise SAML SSO, and AI duplicate clustering.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Phase Filter Buttons */}
                <div className="flex items-center gap-1 text-xs">
                  {(['all', 'now', 'next', 'future'] as const).map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => setRoadmapPhaseFilter(ph)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer capitalize ${
                        roadmapPhaseFilter === ph
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold'
                          : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {ph === 'all' ? 'All Phases' : ph}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingRoadmap(!isAddingRoadmap)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record Milestone</span>
                </button>
              </div>
            </div>

            {/* Add Custom Roadmap Item Drawer / Form */}
            {isAddingRoadmap && (
              <form
                onSubmit={handleCreateRoadmapItem}
                className="p-5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
                    <Milestone className="w-4 h-4 text-purple-600" />
                    <span>Record New Roadmap Objective</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsAddingRoadmap(false)}
                    className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Objective Title
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Automated Linear Issue Webhook"
                      value={newRoadmapTitle}
                      onChange={(e) => setNewRoadmapTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Phase
                      </label>
                      <select
                        value={newRoadmapPhase}
                        onChange={(e) => setNewRoadmapPhase(e.target.value as any)}
                        className="w-full px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none"
                      >
                        <option value="now">Now (v1.2)</option>
                        <option value="next">Next (Q1)</option>
                        <option value="future">Future (Q2+)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Category
                      </label>
                      <select
                        value={newRoadmapCategory}
                        onChange={(e) => setNewRoadmapCategory(e.target.value as any)}
                        className="w-full px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none"
                      >
                        <option value="Integration">Integration</option>
                        <option value="Security">Security</option>
                        <option value="AI & Automation">AI & Automation</option>
                        <option value="Developer Platform">Platform</option>
                        <option value="Analytics">Analytics</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Target ETA
                      </label>
                      <input
                        type="text"
                        value={newRoadmapEta}
                        onChange={(e) => setNewRoadmapEta(e.target.value)}
                        placeholder="e.g. Q1 2027"
                        className="w-full px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Technical Scope & Expected Value
                  </label>
                  <textarea
                    rows={2}
                    value={newRoadmapDesc}
                    onChange={(e) => setNewRoadmapDesc(e.target.value)}
                    placeholder="Describe how this feature improves the public crowd-signal loop..."
                    className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingRoadmap(false)}
                    className="px-3.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                  >
                    Save Milestone
                  </button>
                </div>
              </form>
            )}

            {/* Phased Roadmap Cards */}
            <div className="space-y-3.5">
              {filteredRoadmap.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs space-y-3 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                        item.phase === 'now'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          : item.phase === 'next'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                          : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                      }`}>
                        {item.phaseLabel}
                      </span>

                      <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-white">
                        {item.title}
                      </h3>

                      {item.isShipped && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Shipped in v1.2</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                        {item.category}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        {item.eta}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: RBAC & GOVERNANCE ==================== */}
        {activeTab === 'rbac' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Role-Based Access Control (RBAC) Specification
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Formal authority matrix separating Community Contributors, Corporate Organisation PMs, and Platform Administrators.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-850/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">System Capability</th>
                    <th className="py-3 px-4">Community User</th>
                    <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">Verified Organisation Staff</th>
                    <th className="py-3 px-4 text-purple-600 dark:text-purple-400">Platform Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Create Feedback & Upvote
                    </td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Edit Own Feedback / Comments
                    </td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Audit trail tagged)</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Audit trail tagged)</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Audit trail tagged)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Permanent Deletion of Post
                    </td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (If no official replies)</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Own issues)</td>
                    <td className="py-3 px-4 text-purple-600 font-semibold">Super-Admin Override</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Community Withdraw Protocol
                    </td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Preserves thread context)</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Preserves thread context)</td>
                    <td className="py-3 px-4 text-purple-600 font-semibold">Permitted</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Change Issue Status (Planned, Shipped)
                    </td>
                    <td className="py-3 px-4 text-zinc-400">Restricted</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Subsumed products only)</td>
                    <td className="py-3 px-4 text-purple-600 font-semibold">Global Authority</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Claim Parent Organisation Umbrella
                    </td>
                    <td className="py-3 px-4 text-zinc-400">DNS Corporate Domain Required</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Corporate Domain)</td>
                    <td className="py-3 px-4 text-purple-600 font-semibold">Direct Verification Grant</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Invite Verified Team Members
                    </td>
                    <td className="py-3 px-4 text-zinc-400">Restricted</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">Permitted (Claimed Org)</td>
                    <td className="py-3 px-4 text-purple-600 font-semibold">Global Management</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white">
                      Access Internal Engineering Specs
                    </td>
                    <td className="py-3 px-4 text-zinc-400">Restricted</td>
                    <td className="py-3 px-4 text-zinc-400">Restricted</td>
                    <td className="py-3 px-4 text-purple-600 font-semibold">Full Access (Admin Only)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Succinct Architectural Specification: Elevated Access Rights */}
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Elevated Rights Architecture & Onboarding Protocol
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* 1. Baseline */}
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white">
                    <Users className="w-4 h-4 text-zinc-500" />
                    <span>1. Least-Privilege Baseline</span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px]">
                    Every new account—whether signed up via Google or Email & Password—starts strictly as a standard <code>role: 'user'</code>. Client-side self-escalation is blocked by security invariants.
                  </p>
                </div>

                {/* 2. PM Elevation */}
                <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>2. PM Rights: Work Email & Invites</span>
                  </div>
                  <ul className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px] space-y-1">
                    <li>• <strong>Domain Verification:</strong> Claiming an organization verifies corporate email against <code>company.domain</code> (e.g. <code>@cursor.sh</code>).</li>
                    <li>• <strong>Team Invites:</strong> Verified PMs invite colleagues directly to their verified roster.</li>
                    <li>• <strong>Scoped Scope:</strong> PM authority is strictly restricted to their company's subsumed products.</li>
                  </ul>
                </div>

                {/* 3. Admin Elevation */}
                <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/50 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-purple-800 dark:text-purple-300">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    <span>3. Admin Rights: Seeding & Console</span>
                  </div>
                  <ul className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px] space-y-1">
                    <li>• <strong>Root Seeding:</strong> Bootstrap accounts (<code>albertnkhata.s@gmail.com</code> & <code>@crowdpulse.dev</code>) are automatically recognized as root admins.</li>
                    <li>• <strong>Admin Console:</strong> Additional admins are promoted exclusively through the internal Admin Console by an existing administrator.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: SYSTEM ARCHITECTURE ==================== */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Technical Architecture & Real-Time Sync
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Firestore database architecture, state synchronization, and audit logging primitives.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs space-y-3">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-500" />
                  <span>Firestore Collections Schema</span>
                </h3>
                <ul className="space-y-2 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  <li className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                    <strong className="text-zinc-900 dark:text-white">/feedback</strong>: Canonical issues, upvotes, severity, tags, comments, edit audit flags
                  </li>
                  <li className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                    <strong className="text-zinc-900 dark:text-white">/products</strong>: Registered software products, responsiveness metrics, verification status
                  </li>
                  <li className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                    <strong className="text-zinc-900 dark:text-white">/companies</strong>: Parent organisations, verified staff rosters, domain claims
                  </li>
                  <li className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                    <strong className="text-zinc-900 dark:text-white">/notifications</strong>: Real-time broadcast inbox for upvoters and claimants
                  </li>
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs space-y-3">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span>State Synchronization Engine</span>
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Subscribes to Firestore collection snapshots with automated conflict resolution. When updates occur (upvotes, PM status changes, withdrawals), all active browser sessions re-render instantaneously.
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Optimistic local mutations guarantee 0ms responsive interactions while writes serialize safely to the cloud database.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs space-y-2">
              <h3 className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-500" />
                <span>Auditing & Safe Retraction Protocol</span>
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                When a report author withdraws feedback, CrowdPulse applies <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-900 dark:text-zinc-200">isWithdrawn: true</code> with an author note rather than purging documents. This protects the comments and upvotes contributed by other community members while respecting the author's desire to retract the proposal.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
