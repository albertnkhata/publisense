import React, { useState } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  CheckCircle2, 
  Layers, 
  Mail, 
  ArrowRight, 
  Sparkles, 
  X, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { Company, Product, UserProfile } from '../types';

interface ClaimOrgModalProps {
  isOpen: boolean;
  company: Company | null;
  subsumedProducts: Product[];
  currentUser: UserProfile | null;
  onClose: () => void;
  onClaim: (companyId: string, claimant: { name: string; email: string; roleTitle: string }) => void;
}

export const ClaimOrgModal: React.FC<ClaimOrgModalProps> = ({
  isOpen,
  company,
  subsumedProducts,
  currentUser,
  onClose,
  onClaim,
}) => {
  if (!isOpen || !company) return null;

  const expectedDomain = company.domain || (company.websiteUrl ? company.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'company.com');
  const defaultDemoEmail = currentUser?.email && currentUser.email.includes('@' + expectedDomain)
    ? currentUser.email
    : `alex@${expectedDomain}`;

  const [step, setStep] = useState<'details' | 'verify' | 'success'>('details');
  const [name, setName] = useState(currentUser?.name || 'Alex Vance');
  const [email, setEmail] = useState(defaultDemoEmail);
  const [roleTitle, setRoleTitle] = useState('Lead Product Manager');
  const [code, setCode] = useState('748291');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleProceedToVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid work email address.');
      return;
    }

    // Gentle domain check: if email does not match org domain, allow user to confirm with note
    const userDomain = email.split('@')[1]?.toLowerCase();
    if (expectedDomain && userDomain && !userDomain.includes(expectedDomain.split('.')[0])) {
      setError(`Corporate domain mismatch. Work email should end in @${expectedDomain}. Click "Use Demo Email" to test with matching domain.`);
      return;
    }

    setError(null);
    setStep('verify');
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.trim().length < 4) {
      setError('Please enter the 6-digit confirmation code sent to your email.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    setTimeout(() => {
      setIsVerifying(false);
      setStep('success');
      onClaim(company.id, {
        name: name.trim(),
        email: email.trim(),
        roleTitle: roleTitle.trim() || 'Lead Product Manager',
      });
    }, 600);
  };

  const handleUseDemoEmail = () => {
    setEmail(`team@${expectedDomain}`);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={company.logo}
              alt={company.name}
              className="w-10 h-10 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs"
            />
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <span>Claim {company.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Root Org
                </span>
              </h2>
              <p className="text-xs text-zinc-500">
                Verify corporate domain to manage all subsumed products
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Work Email & Role Details */}
        {step === 'details' && (
          <form onSubmit={handleProceedToVerify} className="p-6 space-y-4">
            {/* Subsumed Products Banner */}
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/70 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Subsumed Products ({subsumedProducts.length})</span>
                </span>
                <span className="text-[11px] text-zinc-500">
                  Auto-verified upon claim
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {subsumedProducts.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 shadow-2xs"
                  >
                    <img src={p.logo} alt={p.name} className="w-3.5 h-3.5 rounded object-cover" />
                    <span>{p.name}</span>
                    <span title="Subsumed & Verified" className="inline-flex items-center">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Vance"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Corporate Work Email
                  </label>
                  <button
                    type="button"
                    onClick={handleUseDemoEmail}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-medium"
                  >
                    Auto-fill @{expectedDomain}
                  </button>
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`you@${expectedDomain}`}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Must match the verified organization domain: <span className="font-mono text-zinc-700 dark:text-zinc-300">@{expectedDomain}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Your Official Title / Role
                </label>
                <select
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                >
                  <option value="Lead Product Manager">Lead Product Manager</option>
                  <option value="Head of Product">Head of Product</option>
                  <option value="VP of Engineering">VP of Engineering</option>
                  <option value="Founding Engineer">Founding Engineer</option>
                  <option value="DevRel & Developer Experience Lead">DevRel & Developer Experience Lead</option>
                  <option value="Product Operations Lead">Product Operations Lead</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <span>Continue to Verification</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Instant Code Verification */}
        {step === 'verify' && (
          <form onSubmit={handleVerifyCode} className="p-6 space-y-4">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Enter Verification Code
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                We sent a 6-digit confirmation code to <span className="font-semibold text-zinc-800 dark:text-zinc-200">{email}</span> to verify ownership of <span className="font-semibold">@{expectedDomain}</span>.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 text-center">
                6-Digit Confirmation Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="748291"
                className="w-48 mx-auto block text-center font-mono text-xl tracking-widest px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
              />
              <p className="text-[11px] text-zinc-400 text-center">
                Demo code <span className="font-mono font-medium text-zinc-600 dark:text-zinc-300">748291</span> is prefilled for instant testing.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('details')}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? (
                  <span>Verifying Domain...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify & Claim {company.name}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Success Confirmation */}
        {step === 'success' && (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <Sparkles className="w-7 h-7 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                {company.name} Claimed Successfully!
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
                You are now the verified <span className="font-semibold text-zinc-900 dark:text-white">{roleTitle}</span> for <span className="font-semibold text-zinc-900 dark:text-white">{company.name}</span>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/80 dark:border-zinc-800 text-left text-xs space-y-2">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Subsumed Products Now Under Verified Management:</span>
              </span>
              <ul className="space-y-1 pl-5 list-disc text-zinc-600 dark:text-zinc-400">
                {subsumedProducts.map((p) => (
                  <li key={p.id}>
                    <span className="font-medium text-zinc-900 dark:text-white">{p.name}</span> — Official product team badge activated
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Go to {company.name} Management Hub
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
