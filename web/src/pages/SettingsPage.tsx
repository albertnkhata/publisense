import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AUTH_COPY,
  BIO_MAX,
  changeEmail,
  changePassword,
  CHANNELS,
  cropAvatar,
  deleteAccount,
  downloadJson,
  exportMyData,
  isEmail,
  KIND_COPY,
  MIN_PASSWORD,
  NOTIFICATION_KINDS,
  removeAvatar,
  requestPasswordReset,
  setNewPassword,
  updateProfile,
  uploadAvatar,
  useDeletionBlockers,
  useNotificationPrefs,
  useSetNotificationPref,
  validateAvatarFile,
  validateProfile,
  type AvatarType,
  type Channel,
  type NotificationKind,
  type OwnedScope,
  type ProfileErrors,
} from '../api';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer, type Viewer } from '../lib/viewer';
import { useLocation } from 'react-router';
import { useAuthDialog } from '../shell/auth';
import { Button, Card, Dialog, EmptyState, Field, Input, PasswordInput, Skeleton, Spinner, Textarea, UserAvatar, useToast } from '../ui';

/**
 * /settings: profile, notification preferences and the account controls.
 * The Account section is the mockup's account dialog laid out on the page
 * (email, password, connected sign-in, export, delete); its sub-flows (change
 * password, delete) open as dialogs with the mockup's wording.
 */
export function SettingsPage() {
  usePageTitle('Settings');
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  const location = useLocation();

  useEffect(() => {
    if (!ready || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: 'smooth' });
  }, [ready, location.hash]);
  return (
    <div className="flex flex-col gap-7">
      <h1 id="page-title" className="m-0 text-2xl font-bold text-ink">
        Settings
      </h1>
      {!ready ? (
        <Skeleton variant="header" />
      ) : !viewer ? (
        <Card padding="none">
          <EmptyState
            icon="settings"
            title="Sign in to manage your settings"
            action={<Button onClick={() => openAuth('signin', 'manage your settings')}>Sign in</Button>}
          >
            Your profile, notifications and account live here.
          </EmptyState>
        </Card>
      ) : (
        <>
          <ProfileSection viewer={viewer} />
          <NotificationsSection viewer={viewer} />
          <AccountSection viewer={viewer} />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
  id: explicitId,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  return (
    <section id={explicitId} aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="m-0 text-lg font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 mb-0 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ profile

function ProfileSection({ viewer }: { viewer: Viewer }) {
  const { refresh } = useViewer();
  const { toast } = useToast();
  const initial = { name: viewer.name, handle: viewer.handle, bio: viewer.bio ?? '' };
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-seed when the stored profile changes (after a save or a refetch).
  useEffect(() => {
    setDraft({ name: viewer.name, handle: viewer.handle, bio: viewer.bio ?? '' });
  }, [viewer.name, viewer.handle, viewer.bio]);

  const dirty = draft.name !== initial.name || draft.handle !== initial.handle || draft.bio !== initial.bio;

  async function save(e: FormEvent) {
    e.preventDefault();
    const found = validateProfile(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    const r = await updateProfile(viewer.id, draft);
    setSaving(false);
    if (r.error) return setErrors(r.error);
    refresh();
    toast('Profile saved');
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const invalid = validateAvatarFile(file);
    setPhotoError(invalid ?? '');
    if (invalid) return;
    setPhotoBusy(true);
    try {
      const blob = await cropAvatar(file);
      const r = await uploadAvatar(viewer.id, blob, file.type as AvatarType, viewer.avatarPath ?? null);
      if (r.error) setPhotoError(r.error);
      else {
        refresh();
        toast('Photo updated');
      }
    } catch {
      setPhotoError('We couldn’t read that image. Try another one.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function clearPhoto() {
    setPhotoBusy(true);
    const r = await removeAvatar(viewer.id, viewer.avatarPath ?? null);
    setPhotoBusy(false);
    if (r.error) setPhotoError(r.error);
    else {
      refresh();
      toast('Photo removed');
    }
  }

  return (
    <Section id="profile" title="Profile" description="Shown next to everything you post.">
      <Card>
        <form noValidate onSubmit={save} className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <UserAvatar size="xl" src={viewer.avatarUrl ?? null} name={`${viewer.name}’s photo`} />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" loading={photoBusy} onClick={() => fileRef.current?.click()}>
                  {viewer.avatarPath ? 'Change photo' : 'Upload photo'}
                </Button>
                {viewer.avatarPath ? (
                  <Button variant="ghost" size="sm" disabled={photoBusy} onClick={clearPhoto}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="m-0 text-sm text-ink-muted">PNG, JPG or WebP. We crop it to a square.</p>
              {photoError ? (
                <p role="alert" className="m-0 text-sm text-danger">
                  {photoError}
                </p>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a profile photo"
              onChange={pick}
            />
          </div>
          <Field label="Name" error={errors.name}>
            <Input
              autoComplete="name"
              value={draft.name}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
                setErrors(({ name: _stale, ...rest }) => rest);
              }}
            />
          </Field>
          <Field label="Handle" hint={`publisense.app/u/${draft.handle || 'your-handle'}`} error={errors.handle}>
            <Input
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={draft.handle}
              onChange={(e) => {
                setDraft({ ...draft, handle: e.target.value.toLowerCase().replace(/^@/, '') });
                // An error belongs to the value that was submitted; once the person edits
                // the field it no longer describes what they see, so drop it.
                setErrors(({ handle: _stale, ...rest }) => rest);
              }}
            />
          </Field>
          <Field label="Bio" optional aside={`${draft.bio.length}/${BIO_MAX}`} error={errors.bio}>
            <Textarea
              rows={3}
              value={draft.bio}
              maxLength={BIO_MAX}
              onChange={(e) => {
                setDraft({ ...draft, bio: e.target.value });
                setErrors(({ bio: _stale, ...rest }) => rest);
              }}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={!dirty} loading={saving}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ notifications

function NotificationsSection({ viewer }: { viewer: Viewer }) {
  const prefs = useNotificationPrefs(viewer.id);
  const setPref = useSetNotificationPref(viewer.id);
  const { toast } = useToast();
  const channelLabel: Record<Channel, string> = { in_app: 'In app', email: 'Email' };

  const toggle = (kind: NotificationKind, channel: Channel, enabled: boolean) =>
    setPref.mutate({ kind, channel, enabled }, { onError: () => toast('Couldn’t save that change. Try again.') });

  return (
    <Section id="notifications" title="Notifications" description="Choose what reaches you, in the app and by email. Every email also has a one-click unsubscribe.">
      <Card padding="none">
        {prefs.isPending ? (
          <div className="px-5 py-4">
            <Skeleton variant="row" />
            <Skeleton variant="row" />
            <Skeleton variant="row" />
          </div>
        ) : prefs.isError ? (
          <p role="alert" className="m-0 px-5 py-4 text-sm text-danger">
            We couldn’t load your notification settings.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-3 text-sm font-semibold text-ink-muted max-sm:px-4">
                  Notify me about
                </th>
                {CHANNELS.map((c) => (
                  <th key={c} scope="col" className="px-3 py-3 text-center text-sm font-semibold whitespace-nowrap text-ink-muted">
                    {channelLabel[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_KINDS.map((k) => (
                <tr key={k} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-5 py-3 font-normal max-sm:px-4">
                    <span className="block text-base font-medium text-ink">{KIND_COPY[k].label}</span>
                    <span className="block text-sm text-ink-muted">{KIND_COPY[k].hint}</span>
                  </th>
                  {CHANNELS.map((c) => (
                    <td key={c} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand"
                        aria-label={`${KIND_COPY[k].label}: ${channelLabel[c]}`}
                        checked={prefs.data[`${k}:${c}`]}
                        onChange={(e) => toggle(k, c, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ account

function AccountRow({ title, detail, action }: { title: string; detail: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0">
      <span className="min-w-0 text-base">
        <b className="font-semibold text-ink">{title}</b>
        <small className="mt-1 block text-sm break-words text-ink-muted">{detail}</small>
      </span>
      {action}
    </div>
  );
}

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', github: 'GitHub' };

function AccountSection({ viewer }: { viewer: Viewer }) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<null | 'email' | 'password' | 'delete'>(null);
  const [exporting, setExporting] = useState(false);
  const close = () => setDialog(null);

  async function exportData() {
    setExporting(true);
    try {
      const data = await exportMyData();
      downloadJson(`publisense-${viewer.handle || 'account'}-${new Date().toISOString().slice(0, 10)}.json`, data);
      toast('Your data is downloading');
    } catch {
      toast('We couldn’t export your data. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Section id="account" title="Account">
      <Card>
        <AccountRow
          title="Email"
          detail={`${viewer.email ?? 'No email'} · sign-in links go here`}
          action={
            <Button variant="secondary" size="sm" onClick={() => setDialog('email')}>
              Change
            </Button>
          }
        />
        <AccountRow
          title="Password"
          detail={viewer.hasPassword ? 'Sign in with your email and password' : 'Not set. You sign in with Google.'}
          action={
            <Button variant="secondary" size="sm" onClick={() => setDialog('password')}>
              {viewer.hasPassword ? 'Change' : 'Set'}
            </Button>
          }
        />
        {(viewer.connected ?? []).map((c) => (
          <AccountRow
            key={c.provider}
            title="Connected sign-in"
            detail={[PROVIDER_LABEL[c.provider] ?? c.provider, c.email].filter(Boolean).join(' · ')}
          />
        ))}
        <AccountRow
          title="Your data"
          detail="Posts, replies, votes and follows as a JSON file."
          action={
            <Button variant="secondary" size="sm" loading={exporting} onClick={exportData}>
              Export
            </Button>
          }
        />
        <div className="mt-4 rounded-md border border-danger p-4">
          <h3 className="mt-0 mb-1 text-base font-semibold text-danger">Delete account</h3>
          <p className="mt-0 mb-3 text-sm text-ink-secondary">Removes your profile, votes and follows. Posts stay, shown as from a deleted user.</p>
          <Button variant="secondary" size="sm" onClick={() => setDialog('delete')}>
            Delete account…
          </Button>
        </div>
      </Card>
      <ChangeEmailDialog open={dialog === 'email'} onClose={close} viewer={viewer} />
      <ChangePasswordDialog open={dialog === 'password'} onClose={close} viewer={viewer} />
      <DeleteAccountDialog open={dialog === 'delete'} onClose={close} viewer={viewer} />
    </Section>
  );
}

function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-col gap-2">{children}</div>;
}

function ChangeEmailDialog({ open, onClose, viewer }: { open: boolean; onClose: () => void; viewer: Viewer }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setError(AUTH_COPY.invalidEmail);
    if (email.trim().toLowerCase() === (viewer.email ?? '').toLowerCase()) return setError('That’s already your email.');
    setBusy(true);
    const r = await changeEmail(email);
    setBusy(false);
    if (r.error) return setError(r.error);
    onClose();
    setEmail('');
    toast('We sent a link to confirm the new address');
  }

  return (
    <Dialog open={open} onClose={onClose} title="Change email">
      <form noValidate onSubmit={submit}>
        <Field label="New email" hint="We’ll send a link to confirm the new address. Nothing changes until you open it." error={error || undefined}>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
          />
        </Field>
        <DialogActions>
          <Button type="submit" block loading={busy}>
            Send confirmation link
          </Button>
          <Button variant="ghost" block onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onClose, viewer }: { open: boolean; onClose: () => void; viewer: Viewer }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setOnly = !viewer.hasPassword;

  const reset = () => {
    setCurrent('');
    setNext('');
    setError('');
  };
  const close = () => {
    reset();
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Mockup copy and order.
    const msg =
      !setOnly && !current
        ? 'Enter your current password.'
        : next.length < MIN_PASSWORD
          ? 'Use at least 8 characters.'
          : !setOnly && next === current
            ? 'Pick a password you haven’t used here.'
            : '';
    if (msg) return setError(msg);
    setBusy(true);
    const r = setOnly ? await setNewPassword(next) : await changePassword(viewer.email ?? '', current, next);
    setBusy(false);
    if (r.error) return setError(r.error);
    close();
    toast(setOnly ? 'Password set' : 'Password updated · other sessions signed out');
  }

  async function forgot() {
    if (!viewer.email) return;
    const r = await requestPasswordReset(viewer.email);
    if (r.error) return setError(r.error);
    close();
    toast(`Reset link sent to ${viewer.email}`);
  }

  return (
    <Dialog open={open} onClose={close} title={setOnly ? 'Set a password' : 'Change password'}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {setOnly ? null : (
          <Field label="Current password">
            <PasswordInput
              autoComplete="current-password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setError('');
              }}
            />
          </Field>
        )}
        <Field
          label="New password"
          hint="At least 8 characters. You’ll stay signed in here and be signed out everywhere else."
          error={error || undefined}
        >
          <PasswordInput
            autoComplete="new-password"
            showStrength
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setError('');
            }}
          />
        </Field>
        <DialogActions>
          <Button type="submit" block loading={busy}>
            {setOnly ? 'Set password' : 'Update password'}
          </Button>
          <Button variant="ghost" block onClick={close}>
            Cancel
          </Button>
        </DialogActions>
        {setOnly || !viewer.email ? null : (
          <p className="m-0 text-sm text-ink-muted">
            <button type="button" onClick={forgot} className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-ink hover:underline">
              Forgot your current password?
            </button>
          </p>
        )}
      </form>
    </Dialog>
  );
}

const listNames = (scopes: OwnedScope[]) => scopes.map((s) => s.name).join(', ');

function DeleteAccountDialog({ open, onClose, viewer }: { open: boolean; onClose: () => void; viewer: Viewer }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const blockers = useDeletionBlockers(viewer.id, open);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [serverBlockers, setServerBlockers] = useState<OwnedScope[] | null>(null);
  const [busy, setBusy] = useState(false);
  const target = viewer.handle ? `@${viewer.handle}` : (viewer.email ?? '');
  const typed = viewer.handle ? `@${confirm.trim().replace(/^@?/, '')}` : confirm.trim();
  const owned = serverBlockers ?? blockers.data ?? [];
  const canDelete = typed === target && !owned.length && !blockers.isPending && !busy;

  const close = () => {
    setConfirm('');
    setError('');
    setServerBlockers(null);
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canDelete) return;
    setBusy(true);
    const r = await deleteAccount();
    setBusy(false);
    if (r.ok) {
      close();
      navigate('/', { replace: true });
      toast('Account deleted');
      return;
    }
    if (r.reason === 'sole_owner') setServerBlockers(r.scopes ?? []);
    else if (r.reason === 'last_platform_admin') setError('You’re the last Publisense admin. Appoint another admin first.');
    else setError('We couldn’t delete your account. Try again in a moment.');
  }

  return (
    <Dialog open={open} onClose={close} title="Delete account?">
      <form noValidate onSubmit={submit}>
        <p className="mt-0 mb-3 text-sm text-ink-muted">
          This removes your profile, votes and follows. Your posts and replies stay but show as <b className="text-ink">deleted user</b>. You can’t undo
          this.
        </p>
        {blockers.isPending ? (
          <p role="status" className="mt-0 mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Spinner /> Checking boards you own…
          </p>
        ) : owned.length ? (
          <p role="alert" className="mt-0 mb-3 text-sm text-danger">
            You’re the only owner of {listNames(owned)}. Add another owner first, then come back to delete your account.
          </p>
        ) : null}
        <Field
          label={
            <>
              Type <b>{target}</b> to confirm
            </>
          }
          error={error || undefined}
        >
          <Input
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={target}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError('');
            }}
          />
        </Field>
        <DialogActions>
          <Button type="submit" variant="danger" block disabled={!canDelete} loading={busy}>
            Delete account
          </Button>
          <Button variant="ghost" block onClick={close}>
            Cancel
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
