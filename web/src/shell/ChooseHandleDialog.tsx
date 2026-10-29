import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AUTH_COPY, cleanHandle, isHandleTaken, markHandleChosen, SIGNUP_HANDLE_RE, updateHandle } from '../api';
import { useViewer } from '../lib/viewer';
import { Button, Dialog, Input, useToast } from '../ui';

/**
 * Google sign-up has no form, so a new Google-only account got a handle from its
 * email. Offer to pick one, once, on the first sign-in: prefilled with what they
 * got, checked live like the sign-up form. Keeping it, closing, or saving all
 * count as chosen, so it never comes back.
 */
export function ChooseHandleDialog() {
  const { viewer, refresh } = useViewer();
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const [handle, setHandle] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'free' | 'taken' | 'unknown'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = viewer?.handle ?? '';
  const open = Boolean(!done && viewer?.chooseHandle && current);

  useEffect(() => {
    if (open && !handle) setHandle(current);
  }, [open, current]);

  useEffect(() => {
    if (!open || !SIGNUP_HANDLE_RE.test(handle) || handle === current) {
      setStatus('idle');
      return;
    }
    let live = true;
    setStatus('checking');
    const t = setTimeout(async () => {
      const taken = await isHandleTaken(handle);
      if (live) setStatus(taken === null ? 'unknown' : taken ? 'taken' : 'free');
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, handle, current]);

  function close() {
    setDone(true);
    void markHandleChosen();
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!handle) return setError(AUTH_COPY.needHandle);
    if (!SIGNUP_HANDLE_RE.test(handle)) return setError(AUTH_COPY.badHandle);
    if (status === 'taken') return setError(AUTH_COPY.handleTaken);
    if (handle === current) return close();
    setBusy(true);
    const r = await updateHandle(viewer!.id, handle);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      inputRef.current?.focus();
      return;
    }
    close();
    refresh();
    toast(`You’re @${handle}`);
  }

  if (!open) return null;
  const hint =
    status === 'taken'
      ? `@${handle} is taken.`
      : status === 'free'
        ? `@${handle} is available.`
        : 'Your public name on Publisense. You can change it later in Settings.';
  return (
    <Dialog
      open
      onClose={close}
      title="Choose your handle"
      initialFocus={inputRef}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Keep @{current}
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={save}>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-ink-muted">
            @
          </span>
          <Input
            ref={inputRef}
            type="text"
            aria-label="Handle"
            aria-describedby="choose-handle-hint"
            aria-invalid={status === 'taken' || Boolean(error) || undefined}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            className="pl-7"
            value={handle}
            onChange={(e) => {
              setHandle(cleanHandle(e.target.value));
              setError('');
            }}
          />
        </div>
        <p
          id="choose-handle-hint"
          aria-live="polite"
          className={`mt-1 mb-0 text-sm ${status === 'taken' ? 'text-danger' : status === 'free' ? 'text-success' : 'text-ink-muted'}`}
        >
          {hint}
        </p>
        {error ? (
          <p role="alert" className="mt-2 mb-0 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
