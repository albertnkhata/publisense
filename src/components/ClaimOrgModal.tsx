import React, { useState, useRef, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  CheckCircle2, 
  Layers, 
  Mail, 
  ArrowRight, 
  X, 
  Check, 
  AlertCircle,
  RotateCw,
  Lock,
  ShieldAlert,
  Loader2,
  Edit2,
  Zap
} from 'lucide-react';
import { Company, Product, UserProfile } from '../types';

interface ClaimOrgModalProps {
  isOpen: boolean;
  company: Company | null;
  subsumedProducts: Product[];
  currentUser: UserProfile | null;
  onClose: () => void;
  onClaim: (companyId: string, claimant: { name: string; email: string; roleTitle: string }) => void;
  onOpenAuth?: (prompt?: string) => void;
}

export const ClaimOrgModal: React.FC<ClaimOrgModalProps> = ({
  isOpen,
  company,
  subsumedProducts,
  currentUser,
  onClose,
  onClaim,
  onOpenAuth,
}) => {
  if (!isOpen || !company) return null;

  const expectedDomain = company.domain || (company.websiteUrl ? company.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'company.com');
  const allowedDomains = company.allowedDomains && company.allowedDomains.length > 0 
    ? company.allowedDomains 
    : [expectedDomain];

  const [step, setStep] = useState<'details' | 'verify' | 'success'>('details');
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [name, setName] = useState(currentUser?.name || '');
  // Corporate work email: prefilled with current account email if available
  const [corporateEmail, setCorporateEmail] = useState(currentUser?.workEmail || currentUser?.email || '');
  const [roleTitle, setRoleTitle] = useState('Organization Admin & Head of Product');
  
  // 6-digit OTP code state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [sentCode, setSentCode] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSentBanner, setCodeSentBanner] = useState(false);

  // Sync state whenever modal opens or user profile changes
  useEffect(() => {
    if (isOpen) {
      setName(currentUser?.name || '');
      setCorporateEmail(currentUser?.workEmail || currentUser?.email || '');
      setStep('details');
      setError(null);
      setDigits(['', '', '', '', '', '']);
      setCodeSentBanner(false);
    }
  }, [isOpen, currentUser]);

  // Real-time domain verification against company's authorized domains
  const cleanCorporateEmail = corporateEmail.toLowerCase().trim();
  const enteredDomain = cleanCorporateEmail.includes('@') ? cleanCorporateEmail.split('@')[1] : '';
  const isDomainMatch = Boolean(
    enteredDomain &&
    allowedDomains.some(
      (d) => enteredDomain === d.toLowerCase() || enteredDomain.endsWith('.' + d.toLowerCase())
    )
  );
  // In Dev Mode, domain matching is bypassed
  const isEmailAllowed = isDomainMatch || isDevMode;

  // Countdown timer for resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'verify' && resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [step, resendCooldown]);

  const handleProceedToVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (company.isClaimed) {
      setError(`${company.name} has already been claimed. Double claims are prohibited.`);
      return;
    }
    if (!currentUser) {
      setError('Please sign in first to claim this organization.');
      return;
    }
    if (!cleanCorporateEmail || !cleanCorporateEmail.includes('@')) {
      setError('Please enter a valid corporate email address.');
      return;
    }
    if (!isEmailAllowed) {
      setError(`Corporate domain mismatch. Email must end in @${expectedDomain}. (Turn on Dev Mode to bypass)`);
      return;
    }
    if (!name.trim()) {
      setError('Please provide your full name.');
      return;
    }

    setError(null);
    // In Dev Mode, auto-use test code '123456' and prefill OTP slots
    const freshCode = isDevMode ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(freshCode);
    
    if (isDevMode) {
      setDigits(['1', '2', '3', '4', '5', '6']);
    } else {
      setDigits(['', '', '', '', '', '']);
    }

    setResendCooldown(30);
    setCodeSentBanner(true);
    setStep('verify');

    // Dispatch in-app corporate email delivery simulation notification
    try {
      window.dispatchEvent(
        new CustomEvent('crowdpulse_otp_dispatched', {
          detail: {
            email: cleanCorporateEmail,
            code: freshCode,
            companyName: company.name,
          },
        })
      );
    } catch {}
  };

  const handleDigitChange = (index: number, val: string) => {
    const char = val.slice(-1).replace(/\D/g, '');
    const nextDigits = [...digits];
    nextDigits[index] = char;
    setDigits(nextDigits);
    setError(null);

    // Auto advance to next box
    if (char && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const nextDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pasted[i] || '';
    }
    setDigits(nextDigits);
    const lastFilled = Math.min(pasted.length, 5);
    digitInputRefs.current[lastFilled]?.focus();
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (company.isClaimed) {
      setError(`${company.name} has already been claimed. Double claims are prohibited.`);
      return;
    }
    const fullCode = digits.join('');
    if (fullCode.length < 6) {
      setError('Please enter all 6 digits of the confirmation code.');
      return;
    }

    const isValidCode = fullCode === sentCode || (isDevMode && fullCode === '123456');

    if (!isValidCode) {
      setError(`Verification code mismatch. Please check the code sent to ${cleanCorporateEmail}.${isDevMode ? ' (Dev Mode active: use 123456)' : ''}`);
      return;
    }

    setIsVerifying(true);
    setError(null);

    setTimeout(() => {
      setIsVerifying(false);
      setStep('success');
      onClaim(company.id, {
        name: name.trim(),
        email: cleanCorporateEmail,
        roleTitle: roleTitle.trim() || 'Organization Admin & Head of Product',
      });
    }, 600);
  };

  const handleResendCode = () => {
    if (resendCooldown > 0) return;
    const freshCode = isDevMode ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(freshCode);
    if (isDevMode) {
      setDigits(['1', '2', '3', '4', '5', '6']);
    }
    setResendCooldown(30);
    setError(null);
    setCodeSentBanner(true);

    try {
      window.dispatchEvent(
        new CustomEvent('crowdpulse_otp_dispatched', {
          detail: {
            email: cleanCorporateEmail,
            code: freshCode,
            companyName: company.name,
          },
        })
      );
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={company.logo}
              alt={company.name}
              className="w-10 h-10 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-2xs shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 truncate">
                <span className="truncate">Claim {company.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 shrink-0">
                  Organization
                </span>
              </h2>
              <p className="text-xs text-zinc-500 truncate">
                Corporate email verification & Organization Admin onboarding
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {/* Dev Mode Bypass Switch */}
            <button
              type="button"
              onClick={() => {
                const next = !isDevMode;
                setIsDevMode(next);
                setError(null);
                if (next) {
                  if (step === 'verify') {
                    setSentCode('123456');
                    setDigits(['1', '2', '3', '4', '5', '6']);
                  }
                }
              }}
              title="Toggle developer domain verification bypass"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isDevMode
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 shadow-2xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${isDevMode ? 'text-amber-500 fill-amber-500/40' : 'text-zinc-400'}`} />
              <span className="text-[11px]">Dev Mode</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                isDevMode ? 'bg-amber-500/25 text-amber-800 dark:text-amber-200' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
              }`}>
                {isDevMode ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Already Claimed Guard: Double claims strictly disallowed */}
        {company.isClaimed ? (
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 text-xs">
                <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                  Organization Already Claimed
                </h3>
                <p className="text-amber-800 dark:text-amber-300 leading-relaxed text-xs">
                  <strong>{company.name}</strong> has already been claimed and verified by{' '}
                  <span className="font-semibold">{company.claimedByName || 'an Organization Admin'}</span>
                  {company.claimedAt ? ` (${company.claimedAt})` : ''}.
                </p>
                <p className="text-amber-700 dark:text-amber-400 text-[11px] pt-1">
                  Claiming is only available for unclaimed organizations to eliminate any possibility of duplicate claims. If you are a colleague on this team, please ask the existing Organization Admin to invite you via the Team tab.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : !currentUser && !isDevMode ? (
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-xs">
                <h3 className="font-bold text-zinc-900 dark:text-white text-sm">
                  Sign In Required to Claim
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px]">
                  You can sign in with any Google account or credentials. In the next step, you will be able to enter and verify your official <strong>@{expectedDomain}</strong> work email directly.
                </p>
                <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Developer testing? Enable <strong>Dev Mode</strong> in header to claim any organization instantly.</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setIsDevMode(true);
                  if (!name) setName('Alex Mercer (Dev)');
                  if (!corporateEmail) setCorporateEmail(`dev-admin@${expectedDomain}`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Enable Dev Bypass</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenAuth) {
                      onOpenAuth(`Sign in to verify and claim ${company.name}.`);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Sign In to Continue</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            {/* Step Indicator */}
            <div className="px-6 pt-4 pb-1 flex items-center justify-between text-[11px] font-medium text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${
                step === 'details' 
                  ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white font-semibold' 
                  : 'border-transparent text-zinc-400'
              }`}>
                <span className="w-4 h-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px]">1</span>
                <span>Work Email & Details</span>
              </div>

              <div className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${
                step === 'verify' 
                  ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white font-semibold' 
                  : 'border-transparent text-zinc-400'
              }`}>
                <span className="w-4 h-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px]">2</span>
                <span>OTP Verification</span>
              </div>

              <div className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${
                step === 'success' 
                  ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white font-semibold' 
                  : 'border-transparent text-zinc-400'
              }`}>
                <span className="w-4 h-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px]">3</span>
                <span>Admin Active</span>
              </div>
            </div>

            {/* Step 1: Work Email & Role Details */}
            {step === 'details' && (
              <form onSubmit={handleProceedToVerify} className="p-6 space-y-4">
                {/* Subsumed Products Banner */}
                {subsumedProducts.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/70 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Subsumed Suite Products ({subsumedProducts.length})</span>
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
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Your Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Mercer"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                    />
                  </div>

                  {/* Corporate Work Email (Editable, dynamically domain-matched or dev-bypassed) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Corporate Verification Email
                      </label>
                      {/* Real-time domain pill status indicator */}
                      {isDomainMatch ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Matches @{enteredDomain}</span>
                        </span>
                      ) : isDevMode ? (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 bg-amber-500/10 dark:bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <Zap className="w-3 h-3 text-amber-500 fill-amber-500/40" />
                          <span>Dev Bypass: Any domain permitted</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                          <span>Must end in @{expectedDomain}</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={corporateEmail}
                        onChange={(e) => {
                          setCorporateEmail(e.target.value);
                          setError(null);
                        }}
                        placeholder={`e.g. you@${expectedDomain}`}
                        className={`w-full pl-3 pr-10 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border text-xs text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-2 transition-colors ${
                          isDomainMatch 
                            ? 'border-emerald-500/80 focus:ring-emerald-500/50' 
                            : isDevMode
                              ? 'border-amber-500/60 focus:ring-amber-500/40 bg-amber-500/5'
                              : corporateEmail.length > 0 
                                ? 'border-amber-400 dark:border-amber-500/60 focus:ring-amber-400' 
                                : 'border-zinc-200 dark:border-zinc-700 focus:ring-zinc-900 dark:focus:ring-white'
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                        {isDomainMatch ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : isDevMode ? (
                          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/40" />
                        ) : (
                          <Mail className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Dev Mode Helper Callout */}
                    {isDevMode && (
                      <div className="mt-1.5 flex items-center justify-between text-[11px] bg-amber-500/10 dark:bg-amber-400/10 p-2 rounded-xl border border-amber-500/20">
                        <span className="text-amber-700 dark:text-amber-300 flex items-center gap-1 font-medium">
                          <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>Dev mode active: Domain check bypassed & test code 123456 auto-ready</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setCorporateEmail(`dev-admin@${expectedDomain}`)}
                          className="text-amber-800 dark:text-amber-200 font-semibold underline hover:opacity-80 cursor-pointer shrink-0 ml-2"
                        >
                          Use @{expectedDomain}
                        </button>
                      </div>
                    )}

                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                      Verification code will be dispatched to this corporate inbox. This will link as your verified work email while preserving your account login credentials ({currentUser?.email || currentUser?.handle || 'dev profile'}).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Organization Role / Title
                    </label>
                    <select
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white cursor-pointer"
                    >
                      <option value="Organization Admin & Head of Product">Organization Admin & Head of Product</option>
                      <option value="VP of Engineering">VP of Engineering</option>
                      <option value="Founding Engineer">Founding Engineer</option>
                      <option value="Lead Product Manager">Lead Product Manager</option>
                      <option value="DevRel & Community Lead">DevRel & Community Lead</option>
                      <option value="Product Operations Lead">Product Operations Lead</option>
                    </select>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Claiming designates you as the Organization Admin, enabling you to invite colleagues and post official roadmap updates.
                    </p>
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
                    disabled={!isEmailAllowed || !name.trim()}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isDevMode
                        ? 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-zinc-950'
                        : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900'
                    }`}
                  >
                    {isDevMode ? (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Continue with Dev Bypass</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Send Verification Code</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: 6-Digit OTP Code Verification */}
            {step === 'verify' && (
              <form onSubmit={handleVerifyCode} className="p-6 space-y-4">
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 mx-auto flex items-center justify-center shadow-2xs">
                    <Mail className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Enter Verification Code
                  </h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    A 6-digit confirmation code was dispatched to <span className="font-semibold text-zinc-900 dark:text-white font-mono">{cleanCorporateEmail}</span> to confirm ownership of <span className="font-semibold font-mono">@{expectedDomain}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline cursor-pointer pt-0.5"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    <span>Change email address</span>
                  </button>
                </div>

                {isDevMode && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                        <Zap className="w-4 h-4 fill-amber-500/30" />
                      </div>
                      <div className="min-w-0 text-[11px]">
                        <p className="font-semibold text-amber-950 dark:text-amber-100">Dev Bypass Active</p>
                        <p className="text-amber-800 dark:text-amber-300">
                          Universal test code <span className="font-mono font-bold bg-amber-200/80 dark:bg-amber-900/80 px-1 py-0.2 rounded text-amber-950 dark:text-amber-50">123456</span> auto-filled.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDigits(['1', '2', '3', '4', '5', '6']);
                        setError(null);
                      }}
                      className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 hover:underline shrink-0 cursor-pointer"
                    >
                      Refill 123456
                    </button>
                  </div>
                )}

                {codeSentBanner && !isDevMode && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Security code dispatched to your corporate inbox. Check your email or in-app notifications.</span>
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 6-Cell OTP Input Boxes */}
                <div className="py-2">
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    {digits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          digitInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                        onPaste={idx === 0 ? handlePaste : undefined}
                        className={`w-10 h-12 sm:w-12 sm:h-14 text-center font-mono text-xl sm:text-2xl font-bold rounded-xl bg-zinc-50 dark:bg-zinc-800/90 border text-zinc-900 dark:text-white focus:outline-none focus:ring-2 transition-all shadow-2xs ${
                          isDevMode 
                            ? 'border-amber-400/80 dark:border-amber-500/60 focus:ring-amber-500' 
                            : 'border-zinc-200 dark:border-zinc-700 focus:ring-zinc-900 dark:focus:ring-white'
                        }`}
                        autoFocus={idx === 0}
                      />
                    ))}
                  </div>
                </div>

                {/* Resend Code Action */}
                <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                  <span>Didn't receive the email?</span>
                  <button
                    type="button"
                    disabled={resendCooldown > 0}
                    onClick={handleResendCode}
                    className="text-zinc-900 dark:text-white font-medium hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline inline-flex items-center gap-1"
                  >
                    <RotateCw className={`w-3 h-3 ${resendCooldown > 0 ? '' : 'text-zinc-500'}`} />
                    <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}</span>
                  </button>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    Back to Details
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifying || digits.join('').length < 6}
                    className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
                      isDevMode
                        ? 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-zinc-950'
                        : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900'
                    }`}
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying Corporate Domain...</span>
                      </>
                    ) : (
                      <>
                        {isDevMode ? <Zap className="w-4 h-4 fill-current" /> : <ShieldCheck className="w-4 h-4" />}
                        <span>{isDevMode ? `Quick Verify (123456) & Claim ${company.name}` : `Verify & Claim ${company.name}`}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Success Confirmation */}
            {step === 'success' && (
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 mx-auto flex items-center justify-center shadow-2xs">
                  <ShieldCheck className="w-7 h-7 text-emerald-500" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    {company.name} Verified Successfully!
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
                    You are now the verified <span className="font-semibold text-zinc-900 dark:text-white">{roleTitle}</span> for <span className="font-semibold text-zinc-900 dark:text-white">{company.name}</span>.
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                    Verified Work Email: {cleanCorporateEmail}
                  </p>
                  {isDevMode && (
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 mt-1">
                      <Zap className="w-3 h-3 text-amber-500 fill-amber-500/40" />
                      <span>Claimed via Dev Mode Bypass</span>
                    </div>
                  )}
                </div>

                {/* Unlocked Abilities Summary */}
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/80 dark:border-zinc-800 text-left text-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-semibold">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Organization Admin Privileges Activated:</span>
                  </div>
                  <ul className="space-y-1.5 pl-6 list-disc text-zinc-600 dark:text-zinc-400 text-[11px]">
                    <li>
                      <strong className="text-zinc-900 dark:text-white">Subsumed Products ({subsumedProducts.length}):</strong> Official product team badges and verification status enabled across all suite products.
                    </li>
                    <li>
                      <strong className="text-zinc-900 dark:text-white">Preserved Credentials:</strong> Your login credentials ({currentUser?.email || currentUser?.handle || 'dev profile'}) are unchanged, with work email linked to your organization profile.
                    </li>
                    <li>
                      <strong className="text-zinc-900 dark:text-white">Team Management:</strong> Invite colleagues and deploy official responses from the {company.name} Hub.
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Enter {company.name} Organization Hub
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
