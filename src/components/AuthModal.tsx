import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import {
  DEMO_PERSONAS_ENABLED,
  MAGIC_LINK_ENABLED,
  loadAuthCapabilities,
  visibleAuthMethods,
  type AuthCapabilities,
} from '../lib/authCapabilities';

type AuthMode = 'signin' | 'signup' | 'magic' | 'reset' | 'newpassword';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    authModalPrompt,
    closeAuthModal,
    currentUser,
    profiles,
    signInWithPassword,
    signUpWithPassword,
    signInWithMagicLink,
    requestPasswordReset,
    completePasswordReset,
    authLinkMessage,
    authLinkMode,
    clearAuthLinkMessage,
    signInWithOAuthProvider,
    signInAsProfile,
    signOut,
    updateCurrentProfile,
  } = useStore();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showDevPersonas, setShowDevPersonas] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  /** The new password has been accepted; show confirmation, not the form again. */
  const [resetDone, setResetDone] = useState(false);
  const [caps, setCaps] = useState<AuthCapabilities>({
    email: true,
    google: false,
    github: false,
    // Seeded from the build flag so an enabled Magic Link tab does not pop in
    // after the settings fetch resolves; providers still come from the project.
    magicLink: MAGIC_LINK_ENABLED,
    resolved: false,
  });

  // Ask the project which sign-in methods it can actually complete, and hide
  // the rest. Rendering a Google button on a project where Google is disabled
  // guarantees a failed round-trip for anyone who clicks it.
  React.useEffect(() => {
    if (!isAuthModalOpen) return;
    let cancelled = false;
    loadAuthCapabilities().then((next) => {
      if (cancelled) return;
      setCaps(next);
      setMode((prev) => (prev === 'magic' && !next.magicLink ? 'signin' : prev));
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthModalOpen]);

  // One pure function decides what can be offered; the JSX only renders it.
  const methods = visibleAuthMethods(caps);
  const showMagic = methods.includes('magic');
  const showOAuth = methods.includes('google') || methods.includes('github');
  const oauthCount = (methods.includes('github') ? 1 : 0) + (methods.includes('google') ? 1 : 0);

  // Profile edit state when signed in
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editHandle, setEditHandle] = useState(currentUser?.handle || '');
  const [editBio, setEditBio] = useState(currentUser?.bio || '');

  React.useEffect(() => {
    if (currentUser) {
      setEditName(currentUser.name);
      setEditHandle(currentUser.handle);
      setEditBio(currentUser.bio);
    }
    setErrorMsg(null);
    setStatusMsg(null);
  }, [currentUser, isAuthModalOpen]);

  // A dead emailed link is reported by the provider layer (token already spent,
  // usually by a mail scanner). Show it here and clear it so it does not stick
  // across openings, and route the user straight at the fix.
  React.useEffect(() => {
    if (!isAuthModalOpen || !authLinkMode) return;
    setErrorMsg(authLinkMessage ?? null);
    // A verified recovery link must ask for a password, not for an email.
    setMode(authLinkMode === 'newpassword' ? 'newpassword' : 'reset');
    clearAuthLinkMessage();
  }, [isAuthModalOpen, authLinkMessage, authLinkMode, clearAuthLinkMessage]);

  /**
   * The reset step is a one-off, not a mode of the sign-in form: once the modal
   * closes, the next time it opens it must be the ordinary sign-in panel again.
   */
  React.useEffect(() => {
    if (isAuthModalOpen) return;
    setResetDone(false);
    setMode('signin');
  }, [isAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const res = await signInWithPassword({ email, password });
        if (res.error) setErrorMsg(res.error);
      } else if (mode === 'signup') {
        if (password.length < 6) {
          setErrorMsg('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        const res = await signUpWithPassword({
          email,
          password,
          name: name.trim() || undefined,
          handle: handle.trim() || undefined,
        });
        if (res.error) setErrorMsg(res.error);
        else if (res.message) setStatusMsg(res.message);
      } else if (mode === 'magic') {
        const res = await signInWithMagicLink(email);
        if (res.error) setErrorMsg(res.error);
        else if (res.message) setStatusMsg(res.message);
      } else if (mode === 'reset') {
        const res = await requestPasswordReset(email);
        if (res.error) setErrorMsg(res.error);
        else {
          setResetSent(true);
          if (res.message) setStatusMsg(res.message);
        }
      } else if (mode === 'newpassword') {
        if (password.length < 6) {
          setErrorMsg('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        const res = await completePasswordReset(password);
        if (res.error) setErrorMsg(res.error);
        else {
          setPassword('');
          setResetDone(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'github' | 'google') => {
    setErrorMsg(null);
    const res = await signInWithOAuthProvider(provider);
    if (res.error) setErrorMsg(res.error);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await updateCurrentProfile({
      name: editName.trim(),
      handle: editHandle.trim(),
      bio: editBio.trim(),
    });
    setLoading(false);
    setStatusMsg('Profile saved to Supabase.');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0, 0, 0, 0.68)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={closeAuthModal}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '11px',
          boxShadow: 'var(--cmd-shadow)',
          padding: '22px 24px',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              className="brand-mark"
              src="/brand/publisense-icon-white-on-indigo.svg"
              alt=""
              width={26}
              height={26}
            />
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.02em' }}>
                {currentUser ? `@${currentUser.handle}` : 'Sign in to Publisense'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {currentUser
                  ? currentUser.email
                  : authModalPrompt || 'Log signals, upvote ideas, and share workarounds.'}
              </p>
            </div>
          </div>

          <button type="button" className="btn-ghost mono" onClick={closeAuthModal}>
            ✕
          </button>
        </div>

        {/* IF A RESET LINK BROUGHT THEM HERE: choose a password, and nothing
            else. This must come before the signed-in panel — a recovery link
            creates a session, so `currentUser` is set and the account panel
            would otherwise hide the one thing the user came for. */}
        {mode === 'newpassword' ? (
          resetDone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                className="mono"
                style={{
                  fontSize: '11px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  color: 'var(--accent-emerald)',
                  background: 'var(--accent-emerald-bg)',
                  border: '1px solid var(--accent-emerald-border)',
                }}
              >
                Password updated. You are signed in — use the new password next time.
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', height: '34px', justifyContent: 'center' }}
                onClick={closeAuthModal}
              >
                Continue to Publisense →
              </button>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                Your reset link worked. Choose the password you want for {currentUser?.email || 'your account'}.
              </p>

              <div>
                <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  NEW PASSWORD *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoFocus
                  className="reply-input"
                  style={{ width: '100%', minWidth: 0 }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {errorMsg && (
                <div
                  className="mono"
                  style={{
                    fontSize: '11px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    color: 'var(--accent-rose)',
                    background: 'var(--accent-rose-bg)',
                    border: '1px solid var(--accent-rose-border)',
                  }}
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ width: '100%', height: '34px', justifyContent: 'center', marginTop: '4px' }}
              >
                {loading ? 'Saving...' : 'Set New Password →'}
              </button>
            </form>
          )
        ) : currentUser ? (
          <div>
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    DISPLAY NAME
                  </label>
                  <input
                    type="text"
                    className="reply-input"
                    style={{ width: '100%', minWidth: 0 }}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    HANDLE
                  </label>
                  <input
                    type="text"
                    className="reply-input mono"
                    style={{ width: '100%', minWidth: 0 }}
                    value={editHandle}
                    onChange={(e) => setEditHandle(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  BIO
                </label>
                <input
                  type="text"
                  className="reply-input"
                  style={{ width: '100%', minWidth: 0 }}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                />
              </div>

              {statusMsg && (
                <div
                  className="mono"
                  style={{
                    fontSize: '11px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    color: 'var(--accent-emerald)',
                    background: 'var(--accent-emerald-bg)',
                    border: '1px solid var(--accent-emerald-border)',
                  }}
                >
                  {statusMsg}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '4px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-hairline)',
                }}
              >
                <button
                  type="button"
                  className="btn-ghost mono"
                  style={{ color: 'var(--accent-rose)', borderColor: 'var(--accent-rose-border)' }}
                  onClick={signOut}
                >
                  Sign out
                </button>

                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* IF SIGNED OUT: Real Supabase Auth (OAuth + Email/Password + Magic Link) */
          <div>
            {/* Mode Switcher */}
            <div
              className="omni-mode-switch"
              style={{ width: '100%', display: 'grid', gridTemplateColumns: showMagic ? '1fr 1fr 1fr' : '1fr 1fr', marginBottom: '14px' }}
            >
              <button
                type="button"
                className={`omni-mode-btn ${mode === 'signin' ? 'active' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`omni-mode-btn ${mode === 'signup' ? 'active' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
              >
                Create Account
              </button>
              {showMagic && (
                <button
                  type="button"
                  className={`omni-mode-btn ${mode === 'magic' ? 'active' : ''}`}
                  style={{ justifyContent: 'center' }}
                  onClick={() => {
                    setMode('magic');
                    setErrorMsg(null);
                    setStatusMsg(null);
                  }}
                >
                  Magic Link
                </button>
              )}
            </div>

            {/* OAuth Providers — rendered only for providers the project has enabled */}
            {showOAuth && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: oauthCount > 1 ? '1fr 1fr' : '1fr',
                  gap: '8px',
                  marginBottom: '14px',
                }}
              >
                {methods.includes('github') && (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ height: '32px', justifyContent: 'center' }}
                    onClick={() => handleOAuth('github')}
                  >
                    <span>⌘ GitHub</span>
                  </button>
                )}
                {methods.includes('google') && (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ height: '32px', justifyContent: 'center' }}
                    onClick={() => handleOAuth('google')}
                  >
                    <span>◎ Google</span>
                  </button>
                )}
              </div>
            )}

            {showOAuth && (
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  marginBottom: '12px',
                }}
              >
                — or with email —
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  EMAIL ADDRESS *
                </label>
                <input
                  type="email"
                  required
                  className="reply-input"
                  style={{ width: '100%', minWidth: 0 }}
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {mode !== 'magic' && mode !== 'reset' && (
                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    PASSWORD *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="reply-input"
                    style={{ width: '100%', minWidth: 0 }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {mode === 'signin' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                  <button
                    type="button"
                    className="mono"
                    onClick={() => {
                      setMode('reset');
                      setErrorMsg(null);
                      setStatusMsg(null);
                      setResetSent(false);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      textDecoration: 'underline',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {mode === 'reset' && (
                <p className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                  {resetSent
                    ? 'Link sent. Open it and choose a new password.'
                    : 'Enter your email and we will send a reset link.'}
                </p>
              )}

              {mode === 'signup' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      NAME
                    </label>
                    <input
                      type="text"
                      className="reply-input"
                      style={{ width: '100%', minWidth: 0 }}
                      placeholder="Alex Rivera"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mono" style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      @HANDLE
                    </label>
                    <input
                      type="text"
                      className="reply-input mono"
                      style={{ width: '100%', minWidth: 0 }}
                      placeholder="alex_r"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {errorMsg && (
                <div
                  className="mono"
                  style={{
                    fontSize: '11px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    color: 'var(--accent-rose)',
                    background: 'var(--accent-rose-bg)',
                    border: '1px solid var(--accent-rose-border)',
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {statusMsg && (
                <div
                  className="mono"
                  style={{
                    fontSize: '11px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    color: 'var(--accent-emerald)',
                    background: 'var(--accent-emerald-bg)',
                    border: '1px solid var(--accent-emerald-border)',
                  }}
                >
                  {statusMsg}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ width: '100%', height: '34px', justifyContent: 'center', marginTop: '4px' }}
              >
                {loading
                  ? 'Authenticating...'
                  : mode === 'signin'
                  ? 'Sign In →'
                  : mode === 'signup'
                  ? 'Create Account →'
                  : mode === 'reset'
                  ? (resetSent ? 'Send Again →' : 'Send Reset Link →')
                  : 'Send Magic Link →'}
              </button>
            </form>

            {/* Dev persona switcher — local only. It renders an admin/maintainer
                view with no Supabase session, so it must never ship enabled. */}
            {DEMO_PERSONAS_ENABLED && (
            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-hairline)' }}>
              <button
                type="button"
                className="mono"
                onClick={() => setShowDevPersonas((prev) => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '10.5px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Dev Preview Personas (Admin / Maintainer)</span>
                <span>{showDevPersonas ? '▾' : '▸'}</span>
              </button>

              {showDevPersonas && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {profiles.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="filter-chip mono"
                      onClick={() => signInAsProfile(p.id)}
                    >
                      @{p.handle} ({p.role})
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
