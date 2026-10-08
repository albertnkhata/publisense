import React, { useState } from 'react';
import { 
  X, 
  Activity, 
  User, 
  Building2, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2, 
  Loader2,
  UserPlus
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { signInWithGoogle, signInWithEmailPassword, signUpWithEmailPassword } from '../lib/firebase';
import { saveProfile, loadProfile } from '../lib/profileStorage';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Mock Sign Up State
  const [isSignUpExpanded, setIsSignUpExpanded] = useState(false);
  const [signUpName, setSignUpName] = useState('');
  const [signUpHandle, setSignUpHandle] = useState('');
  const [signUpError, setSignUpError] = useState<string | null>(null);

  const existingMockHandles = new Set([
    'albert', 'alex_admin', 'sarah_pm', 'arivera_dev', 'claire_codes',
    'devon_builds', 'dk_devops', 'elena_ai', 'elena_code', 'jsparks_design',
    'kavita_ui', 'kevin_openai', 'liam_oc', 'mateo_alvarez', 'mchen_tech',
    'npalmer', 'openai_eng', 'rami_ops', 'sjenkins_ux', 'sophia_ml',
    'tariqh_ai', 'dario_anthropic', 'mtruell', 'jordan_pulse', 'rauchg'
  ]);

  const handleSignUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError(null);

    const trimmedName = signUpName.trim();
    if (!trimmedName || trimmedName.length > 50) {
      setSignUpError('Name must be between 1 and 50 characters.');
      return;
    }

    const cleanHandle = signUpHandle.trim().toLowerCase().replace(/^@/, '');
    if (!cleanHandle || cleanHandle.length < 2 || cleanHandle.length > 30) {
      setSignUpError('Handle must be between 2 and 30 characters.');
      return;
    }

    if (!/^[a-z0-9_]{2,30}$/.test(cleanHandle)) {
      setSignUpError('Handle must be 2-30 characters using lowercase letters, numbers, or underscore only.');
      return;
    }

    // Check handle collision against existing stored profiles and existingMockHandles
    const stored = loadProfile(cleanHandle);
    if (stored !== null || existingMockHandles.has(cleanHandle)) {
      setSignUpError('Handle already taken');
      return;
    }

    // On success, call existing profileStorage saveProfile to persist a NEW profile
    saveProfile(cleanHandle, {
      name: trimmedName,
      handle: cleanHandle,
      org: '',
      bio: '',
    });

    const newProfile: UserProfile = {
      id: `usr-${cleanHandle}`,
      name: trimmedName,
      email: `${cleanHandle}@community.crowdpulse.dev`,
      handle: `@${cleanHandle}`,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
      role: 'user',
      companyOrOrg: '',
      bio: '',
      followerCount: 0,
      followingCount: 0,
    };

    onLogin(newProfile);
    onClose();
  };

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setAuthError(null);
    try {
      const profile = await signInWithGoogle();
      onLogin(profile);
      onClose();
    } catch (err: unknown) {
      console.error('Google Sign-In error:', err);
      const msg = err instanceof Error ? err.message : 'Google sign-in could not be completed';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsSubmitting(true);
    setAuthError(null);

    try {
      let profile: UserProfile;
      if (authMode === 'signin') {
        profile = await signInWithEmailPassword(email, password);
      } else {
        profile = await signUpWithEmailPassword(email, password, name);
      }
      onLogin(profile);
      onClose();
    } catch (err: unknown) {
      console.warn('Email auth notice:', err);
      const errorObj = err as { code?: string; message?: string };
      const code = errorObj?.code || '';

      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setAuthError('Incorrect email or password. Please verify or create an account.');
      } else if (code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists. Switch to Sign In.');
      } else if (code === 'auth/weak-password') {
        setAuthError('Password must be at least 6 characters.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else if (code === 'auth/operation-not-allowed' || code.includes('operation-not-allowed') || (errorObj?.message && errorObj.message.includes('PASSWORD_LOGIN_DISABLED'))) {
        setAuthError('Email & Password sign-in is not enabled in Firebase Console yet. Please use "Continue with Google" above or enable Email/Password under Firebase Console > Authentication > Sign-in method.');
      } else {
        setAuthError(errorObj?.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

        {/* Real Google Sign-In Button */}
        <div className="mb-5">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-750 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-750 text-zinc-900 dark:text-white font-medium text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-60"
          >
            {isGoogleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>

          {authError && (
            <p className="mt-2 text-xs text-rose-500 text-center">{authError}</p>
          )}
        </div>

        <div className="relative flex items-center justify-center mb-4">
          <div className="border-t border-zinc-200 dark:border-zinc-800 w-full" />
          <span className="bg-white dark:bg-zinc-900 px-2 text-[10px] uppercase tracking-wider text-zinc-400 absolute">
            or demo personas
          </span>
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
              <p className="text-[11px] text-zinc-500 font-mono truncate">albertnkhata.s@gmail.com</p>
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

          {/* Inline Sign Up for New Profiles */}
          <div className="pt-1.5">
            {!isSignUpExpanded ? (
              <button
                type="button"
                onClick={() => {
                  setIsSignUpExpanded(true);
                  setSignUpError(null);
                }}
                className="w-full py-2 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50/70 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-zinc-500" />
                <span>Sign up</span>
              </button>
            ) : (
              <form onSubmit={handleSignUpSubmit} className="space-y-2.5 bg-zinc-50 dark:bg-zinc-850 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 animate-in fade-in duration-100 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 dark:text-white">
                    Sign up with new handle
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUpExpanded(false);
                      setSignUpError(null);
                    }}
                    className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={signUpName}
                    onChange={(e) => {
                      setSignUpName(e.target.value);
                      if (signUpError) setSignUpError(null);
                    }}
                    placeholder="Your full name"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Handle
                  </label>
                  <div className={`flex items-center rounded-lg border ${signUpError === 'Handle already taken' ? 'border-rose-400 dark:border-rose-500' : 'border-zinc-200 dark:border-zinc-700'} bg-white dark:bg-zinc-800 px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-500`}>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 select-none mr-1 font-mono">@</span>
                    <input
                      type="text"
                      required
                      value={signUpHandle}
                      onChange={(e) => {
                        setSignUpHandle(e.target.value.toLowerCase().replace(/^@/, ''));
                        if (signUpError) setSignUpError(null);
                      }}
                      placeholder="username"
                      className="w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {signUpError && (
                  <p className="text-[11px] text-rose-500 font-medium">
                    {signUpError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Create Profile
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-white dark:bg-zinc-900 text-zinc-400 text-[11px]">
              or with email & password
            </span>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg mb-3">
          <button
            type="button"
            onClick={() => { setAuthMode('signin'); setAuthError(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              authMode === 'signin'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('signup'); setAuthError(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              authMode === 'signup'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Real Email & Password Form */}
        <form onSubmit={handleEmailAuthSubmit} className="space-y-2.5">
          {authMode === 'signup' && (
            <div>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full pl-8 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-8 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode === 'signup' ? 'Create a password (min. 6 chars)' : 'Password'}
                className="w-full pl-8 pr-9 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {authError && (
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-[11px] text-rose-600 dark:text-rose-400">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{authMode === 'signin' ? 'Signing in...' : 'Creating account...'}</span>
              </>
            ) : (
              <span>{authMode === 'signin' ? 'Sign In with Email' : 'Create Account'}</span>
            )}
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                setAuthError(null);
              }}
              className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 underline cursor-pointer"
            >
              {authMode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
