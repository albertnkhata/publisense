import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Users,
  Building2,
  Search,
  UserCheck,
  UserX,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronDown,
  Info,
  RefreshCw,
  Plus,
  AlertCircle
} from 'lucide-react';
import { UserProfile, Company, UserRole } from '../types';
import { fetchAllUsers, updateUserRoleInDb } from '../lib/firebase';

interface AdminConsoleModalProps {
  isOpen: boolean;
  currentUser: UserProfile;
  companies: Company[];
  onClose: () => void;
  onUpdateCompany: (company: Company) => void;
  onUpdateCurrentUser: (user: UserProfile) => void;
}

export const AdminConsoleModal: React.FC<AdminConsoleModalProps> = ({
  isOpen,
  currentUser,
  companies,
  onClose,
  onUpdateCompany,
  onUpdateCurrentUser,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'orgs' | 'policy'>('users');
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUserForPM, setSelectedUserForPM] = useState<UserProfile | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id || '');
  const [customRoleTitle, setCustomRoleTitle] = useState('Lead Product Manager');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fallback demo users to guarantee immediate utility even if database is fresh
  const defaultDemoUsers: UserProfile[] = useMemo(() => [
    {
      id: 'usr-admin',
      name: 'Alex Vance',
      email: 'alex.admin@crowdpulse.dev',
      handle: '@alex_admin',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
      role: 'admin',
      roleTitle: 'Platform Administrator',
      companyOrOrg: 'CrowdPulse',
      companyId: 'comp-crowdpulse',
      bio: 'Platform Administrator and Founder at CrowdPulse.',
      joinedDate: 'March 2024',
      followerCount: 154,
      followingCount: 32,
    },
    {
      id: 'usr-pm',
      name: 'Sarah Chen',
      email: 'sarah.pm@cursor.sh',
      handle: '@sarah_pm',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80',
      role: 'company_pm',
      roleTitle: 'Lead Product Manager',
      companyOrOrg: 'Anysphere',
      companyId: 'comp-anysphere',
      bio: 'Lead Product Manager at Anysphere, shaping the future of Cursor.',
      joinedDate: 'March 2024',
      followerCount: 342,
      followingCount: 48,
    },
    {
      id: 'usr-albert',
      name: 'Albert N.',
      email: 'albertnkhata.s@gmail.com',
      handle: '@albert',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
      role: 'admin',
      roleTitle: 'Platform Administrator (Root)',
      companyOrOrg: 'CrowdPulse',
      companyId: 'comp-crowdpulse',
      bio: 'Platform Administrator and Root Creator.',
      joinedDate: 'October 2026',
      followerCount: 88,
      followingCount: 20,
    },
    {
      id: 'usr-member',
      name: 'Elena Rostova',
      email: 'elena.dev@example.com',
      handle: '@elena_dev',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=128&auto=format&fit=crop&q=80',
      role: 'user',
      bio: 'Fullstack developer & open-source contributor.',
      joinedDate: 'April 2024',
      followerCount: 45,
      followingCount: 12,
    }
  ], []);

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const dbUsers = await fetchAllUsers();
      if (dbUsers.length > 0) {
        // Merge with current user if not in list
        const merged = [...dbUsers];
        if (currentUser && !merged.find(u => u.id === currentUser.id || u.email === currentUser.email)) {
          merged.unshift(currentUser);
        }
        setUsersList(merged);
      } else {
        // Populate with seed users
        const seed = currentUser && !defaultDemoUsers.find(u => u.email === currentUser.email)
          ? [currentUser, ...defaultDemoUsers]
          : defaultDemoUsers;
        setUsersList(seed);
      }
    } catch {
      setUsersList(defaultDemoUsers);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePromoteAdmin = async (targetUser: UserProfile) => {
    const nextRole: UserRole = targetUser.role === 'admin' ? 'user' : 'admin';
    const updates: Partial<UserProfile> = {
      role: nextRole,
      roleTitle: nextRole === 'admin' ? 'Platform Administrator' : undefined,
      companyOrOrg: nextRole === 'admin' ? 'CrowdPulse' : undefined,
    };

    setUsersList(prev => prev.map(u => u.id === targetUser.id ? { ...u, ...updates } : u));
    if (currentUser.id === targetUser.id) {
      onUpdateCurrentUser({ ...currentUser, ...updates });
    }
    await updateUserRoleInDb(targetUser.id, updates);
    setStatusMessage(`Updated ${targetUser.name} to ${nextRole === 'admin' ? 'Platform Admin' : 'Community User'}`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleAssignPM = async (targetUser: UserProfile, companyId: string, roleTitle: string) => {
    const targetComp = companies.find(c => c.id === companyId);
    if (!targetComp) return;

    const updates: Partial<UserProfile> = {
      role: 'company_pm',
      roleTitle: roleTitle.trim() || 'Product Manager',
      companyOrOrg: targetComp.name,
      companyId: targetComp.id,
    };

    setUsersList(prev => prev.map(u => u.id === targetUser.id ? { ...u, ...updates } : u));
    if (currentUser.id === targetUser.id) {
      onUpdateCurrentUser({ ...currentUser, ...updates });
    }
    await updateUserRoleInDb(targetUser.id, updates);

    // Also add to company verifiedMembers if not already present
    const memberExists = targetComp.verifiedMembers.some(m => m.id === targetUser.id || m.handle === targetUser.handle);
    if (!memberExists) {
      const updatedCompany: Company = {
        ...targetComp,
        isClaimed: true,
        verifiedMembers: [
          ...targetComp.verifiedMembers,
          {
            id: targetUser.id,
            name: targetUser.name,
            handle: targetUser.handle,
            avatar: targetUser.avatar,
            roleTitle: roleTitle.trim() || 'Product Manager',
          }
        ]
      };
      onUpdateCompany(updatedCompany);
    }

    setSelectedUserForPM(null);
    setStatusMessage(`Assigned ${targetUser.name} as PM of ${targetComp.name}`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const filteredUsers = usersList.filter(u => {
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.handle.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-850/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Admin Console
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  Access & RBAC Controls
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Grant elevated rights, audit company claims, and manage verified PM rosters
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="px-5 border-b border-zinc-100 dark:border-zinc-800 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'users'
                ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Accounts ({usersList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('orgs')}
            className={`py-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'orgs'
                ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Organisations & PM Roster ({companies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('policy')}
            className={`py-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'policy'
                ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>RBAC Policy</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Search & Actions Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or @handle..."
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <button
                  onClick={loadUsers}
                  disabled={isLoadingUsers}
                  className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-xs font-semibold text-zinc-700 dark:text-zinc-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                  <span>Refresh List</span>
                </button>
              </div>

              {/* Users Table / Card List */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">
                    No matching accounts found.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isRootAdmin = u.email === 'albertnkhata.s@gmail.com';
                    return (
                      <div key={u.id} className="p-3.5 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={u.avatar}
                            alt={u.name}
                            className="w-9 h-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-zinc-900 dark:text-white truncate">
                                {u.name}
                              </span>
                              {u.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>{isRootAdmin ? 'Root Admin' : 'Admin'}</span>
                                </span>
                              ) : u.role === 'company_pm' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>PM ({u.companyOrOrg || 'Partner'})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                  <span>User</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 truncate">
                              <span>{u.email || 'no-email'}</span>
                              <span>•</span>
                              <span className="font-mono">{u.handle}</span>
                              {u.roleTitle && (
                                <>
                                  <span>•</span>
                                  <span className="text-zinc-500 dark:text-zinc-400">{u.roleTitle}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Elevated Actions */}
                        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                          {/* Assign PM */}
                          <button
                            type="button"
                            onClick={() => setSelectedUserForPM(u)}
                            className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                          >
                            Assign to PM
                          </button>

                          {/* Promote/Demote Admin (with Root protection) */}
                          {isRootAdmin ? (
                            <span className="px-2.5 py-1.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                              Seeded Root
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handlePromoteAdmin(u)}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                u.role === 'admin'
                                  ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                                  : 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              }`}
                            >
                              {u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Assign PM Modal Dialog */}
              {selectedUserForPM && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-emerald-500" />
                        <span>Assign PM Role to {selectedUserForPM.name}</span>
                      </h3>
                      <button onClick={() => setSelectedUserForPM(null)} className="text-zinc-400 hover:text-zinc-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Target Organisation
                      </label>
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        className="w-full p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-zinc-100"
                      >
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.domain || 'no-domain'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Role Title
                      </label>
                      <input
                        type="text"
                        value={customRoleTitle}
                        onChange={(e) => setCustomRoleTitle(e.target.value)}
                        placeholder="e.g. Lead Product Manager"
                        className="w-full p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-zinc-100"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedUserForPM(null)}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAssignPM(selectedUserForPM, selectedCompanyId, customRoleTitle)}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-xs"
                      >
                        Confirm PM Assignment
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'orgs' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {companies.map((company) => (
                  <div
                    key={company.id}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={company.logo}
                          alt={company.name}
                          className="w-8 h-8 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700"
                        />
                        <div>
                          <h4 className="font-bold text-xs text-zinc-900 dark:text-white">
                            {company.name}
                          </h4>
                          <p className="text-[11px] text-zinc-400 font-mono">
                            @{company.domain || 'domain.com'}
                          </p>
                        </div>
                      </div>

                      {company.isClaimed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Claimed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          <span>Unclaimed</span>
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 pt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span>Verified PM Staff:</span>
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {company.verifiedMembers.length} member(s)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span>Claimant:</span>
                        <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[180px]">
                          {company.claimedByName || 'None'}
                        </span>
                      </div>
                    </div>

                    {/* Verified Members avatars list */}
                    {company.verifiedMembers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {company.verifiedMembers.map(m => (
                          <div
                            key={m.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-700 dark:text-zinc-300"
                            title={`${m.name} (${m.roleTitle})`}
                          >
                            <img src={m.avatar} alt={m.name} className="w-3.5 h-3.5 rounded-full object-cover" />
                            <span>{m.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'policy' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 space-y-2">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Principle of Least Privilege (Zero-Trust Standard)</span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Every user starts strictly with regular permissions (<code className="text-purple-600 dark:text-purple-300">role: 'user'</code>). 
                  Elevated rights are granted strictly through verification channels.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-zinc-500" />
                    <span>1. Regular User</span>
                  </h4>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Default for all new email/password and Google accounts. Can submit feedback, upvote, comment, and follow.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>2. Verified PM</span>
                  </h4>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Granted via matching work email domain (<code className="text-emerald-600">@cursor.sh</code>) or direct team invitation. Scoped strictly to company products.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                    <span>3. Platform Admin</span>
                  </h4>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Seeded to root admin (<code className="text-purple-600">albertnkhata.s@gmail.com</code>). Additional admins delegated exclusively through this console.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/30 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Close Console
          </button>
        </div>
      </div>
    </div>
  );
};
