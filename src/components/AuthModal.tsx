import React, { useState } from 'react';
import { X, Activity, User, Building2, Mail, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  if (!isOpen) return null;

  const handleQuickLogin = (role: UserRole) => {
    if (role === 'admin') {
      onLogin({
        id: 'usr-admin',
        name: 'Alex Vance',
        email: 'alex.admin@crowdpulse.dev',
        handle: '@alex_admin',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
        role: 'admin',
      });
    } else if (role === 'company_pm') {
      onLogin({
        id: 'usr-pm',
        name: 'Sarah Chen',
        email: 'sarah.pm@cursor.sh',
        handle: '@sarah_pm',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&auto=format&fit=crop&q=80',
        role: 'company_pm',
        roleTitle: 'Lead Product Manager',
        companyOrOrg: 'Anysphere',
        companyId: 'comp-anysphere',
        bio: 'Lead Product Manager at Anysphere, shaping the future of Cursor with AI coding agents and intelligent developer workflows.',
        location: 'San Francisco, CA',
        joinedDate: 'March 2024',
        followerCount: 342,
        followingCount: 48,
      });
    } else {
      onLogin({
        id: 'usr-user',
        name: 'Albert N.',
        email: 'albert@example.com',
        handle: '@albert',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
        role: 'user',
      });
    }
    onClose();
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    const userName = name.trim() || email.split('@')[0];
    onLogin({
      id: `usr-${Date.now()}`,
      name: userName,
      email: email.trim(),
      handle: `@${userName.toLowerCase().replace(/\s+/g, '_')}`,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80',
      role: 'user',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all">
      <div 
        className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-md transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center mb-3 shadow-md">
            <Activity className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            Welcome to CrowdPulse
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Sign in to submit feedback, upvote issues, and track official updates
          </p>
        </div>

        {/* Quick Demo Logins */}
        <div className="space-y-2 mb-4">
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider text-center">
            Quick Sign In
          </p>

          <button
            type="button"
            onClick={() => handleQuickLogin('user')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-all cursor-pointer group"
          >
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&auto=format&fit=crop&q=80"
              alt="Albert N."
              className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                  Albert N.
                </span>
                <span className="text-[10px] text-zinc-400">@albert</span>
              </div>
              <p className="text-[11px] text-zinc-500">Sign in as Community Member</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            type="button"
            onClick={() => handleQuickLogin('company_pm')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-all cursor-pointer group"
          >
            <img
              src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=64&auto=format&fit=crop&q=80"
              alt="Sarah Chen"
              className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                  Sarah Chen
                </span>
                <span title="Verified PM" className="inline-flex items-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">Sign in as PM of Anysphere (Cursor)</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            type="button"
            onClick={() => handleQuickLogin('admin')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-purple-200 dark:border-purple-900/60 hover:border-purple-300 dark:hover:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-left transition-all cursor-pointer group"
          >
            <img
              src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&auto=format&fit=crop&q=80"
              alt="Alex Vance"
              className="w-8 h-8 rounded-full object-cover border border-purple-200 dark:border-purple-800"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                  Alex Vance
                </span>
                <span title="Platform Admin" className="inline-flex items-center">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                </span>
              </div>
              <p className="text-[11px] text-purple-600 dark:text-purple-400">Sign in as Platform Admin</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-white dark:bg-zinc-900 text-zinc-400 text-[11px]">
              or with email
            </span>
          </div>
        </div>

        {/* Custom Email Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-2.5">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
            />
          </div>
          <div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};
