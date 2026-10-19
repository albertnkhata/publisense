import React, { useState } from 'react';
import { X, Radio, CheckCircle2, UserPlus, Sparkles } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    authModalPrompt,
    closeAuthModal,
    profiles,
    currentUser,
    signInAsProfile,
    signInOrRegisterWithEmail,
    getOrgById,
  } = useStore();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await signInOrRegisterWithEmail({
      email,
      name: name.trim() || undefined,
      handle: handle.trim() || undefined,
    });
    setEmail('');
    setName('');
    setHandle('');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={closeAuthModal}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Sign in to Publisense
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400">
                {authModalPrompt || 'Switch persona or create a builder profile'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Instant Persona Switcher */}
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Quick Switch Persona (Instant)
          </label>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {profiles.map((p) => {
              const isCurrent = currentUser?.id === p.id;
              const managedOrg = p.managedOrgId ? getOrgById(p.managedOrgId) : undefined;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => signInAsProfile(p.id)}
                  className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                      : 'bg-zinc-50/70 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 border-zinc-200/80 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={p.avatarUrl}
                      alt={p.name}
                      className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {p.name}
                        </span>
                        <span className="text-zinc-400 font-mono text-[11px]">
                          @{p.handle}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {p.role === 'admin'
                          ? 'Platform Admin'
                          : managedOrg
                          ? `Maintainer • ${managedOrg.name}`
                          : 'Community Builder'}
                      </div>
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                      Switch →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-zinc-200 dark:border-zinc-800 w-full" />
          <span className="bg-white dark:bg-zinc-900 px-2.5 text-[10px] uppercase tracking-wider text-zinc-400 absolute">
            or sign in / register with email
          </span>
        </div>

        {/* Email Sign In / Register */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Display Name <span className="text-zinc-400">(new users)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Handle <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="janedoe"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Continue with Email</span>
          </button>
        </form>
      </div>
    </div>
  );
};
