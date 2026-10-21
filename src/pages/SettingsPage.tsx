import React, { useMemo, useState } from 'react';
import { Database, RotateCcw, CheckCircle2, Sparkles, ShieldCheck, Inbox } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { pendingClaimRequests } from '../lib/claimRequests';

export const SettingsPage: React.FC = () => {
  const {
    isSupabaseLive,
    resetLocalDemoData,
    organizations,
    products,
    posts,
    profiles,
    currentUser,
    approveProductClaim,
  } = useStore();
  const [resetDone, setResetDone] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const claimQueue = useMemo(
    () => pendingClaimRequests(products, organizations),
    [products, organizations]
  );
  const [approving, setApproving] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState<{ ok: boolean; text: string } | null>(null);

  const handleReset = () => {
    resetLocalDemoData();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 3000);
  };

  const handleApprove = async (productId: string, productName: string) => {
    setApproving(productId);
    setApprovalNote(null);
    const result = await approveProductClaim(productId);
    setApproving(null);
    setApprovalNote(
      result.error
        ? { ok: false, text: result.error }
        : { ok: true, text: result.message || `${productName} approved.` }
    );
  };

  return (
    <div className="space-y-5 text-xs">
      {isAdmin && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Claim requests</h2>
              <p className="text-zinc-500">
                Approving verifies the board and makes the claimant its maintainer. Nothing is
                granted before you decide.
              </p>
            </div>
          </div>

          {claimQueue.length === 0 ? (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 text-zinc-500">
              <Inbox className="w-4 h-4" />
              <span>No claims are waiting for review.</span>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200/80 dark:border-zinc-800 rounded-xl overflow-hidden">
              {claimQueue.map((req) => (
                <li
                  key={req.productId}
                  className="p-3.5 flex items-center justify-between gap-3 flex-wrap bg-zinc-50/60 dark:bg-zinc-800/40"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-900 dark:text-white truncate">
                      {req.productName}
                    </div>
                    <div className="text-zinc-500 truncate">
                      {req.orgName} · {req.claimantEmail || 'no email on record'}
                      {req.requestedAt
                        ? ` · asked ${new Date(req.requestedAt).toLocaleDateString()}`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApprove(req.productId, req.productName)}
                    disabled={approving === req.productId}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold cursor-pointer shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{approving === req.productId ? 'Approving…' : 'Approve'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {approvalNote && (
            <div
              className={`p-3 rounded-xl border ${
                approvalNote.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}
            >
              {approvalNote.text}
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-zinc-900 dark:text-white">
                Backend &amp; Supabase Configuration
              </h1>
              <p className="text-zinc-500">
                Relational store status and database setup instructions
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold ${
              isSupabaseLive
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSupabaseLive ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
            {isSupabaseLive ? 'Connected to Live Supabase' : 'Local Relational Persistence Active'}
          </span>
        </div>

        {/* Store Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-mono text-zinc-400 block">
              Products
            </span>
            <span className="text-base font-bold">{products.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-mono text-zinc-400 block">
              Organizations
            </span>
            <span className="text-base font-bold">{organizations.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-mono text-zinc-400 block">
              Feedback Signals
            </span>
            <span className="text-base font-bold">{posts.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-mono text-zinc-400 block">
              Builder Profiles
            </span>
            <span className="text-base font-bold">{profiles.length}</span>
          </div>
        </div>

        {/* Setup Steps */}
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5 leading-relaxed">
          <div className="font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>How to switch from Local Store to Live Supabase Postgres:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-zinc-600 dark:text-zinc-300">
            <li>
              Open your Supabase project SQL Editor and run{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-700 font-mono">
                supabase/schema.sql
              </code>
              .
            </li>
            <li>
              Copy{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-700 font-mono">
                .env.example
              </code>{' '}
              to{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-700 font-mono">
                .env
              </code>{' '}
              and set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
            </li>
            <li>Restart the Vite dev server — Publisense will automatically sync live!</li>
          </ol>
        </div>

        {/* Reset Local Store Button */}
        <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
          <span className="text-zinc-500">
            Want to restore the local relational database back to initial seed state?
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold cursor-pointer"
          >
            {resetDone ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Seed Data Restored</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Local Seed Data</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
