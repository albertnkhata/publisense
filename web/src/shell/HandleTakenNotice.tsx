import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { clearRequestedHandle } from '../api';
import { useViewer } from '../lib/viewer';
import { Button, Dialog } from '../ui';

/**
 * Sign-up asks for a handle, but it is only reserved when the account is created
 * (after the email is confirmed). If someone took it in between, the sign-up
 * trigger added a number. Say so once, and offer to keep it or pick another.
 */
export function HandleTakenNotice() {
  const { viewer } = useViewer();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  const asked = viewer?.requestedHandle;
  const got = viewer?.handle;
  const open = Boolean(!done && asked && got && asked !== got);

  // Got what they asked for: forget the request, so a later change in Settings
  // never reads as "taken".
  useEffect(() => {
    if (asked && got && asked === got) void clearRequestedHandle();
  }, [asked, got]);

  function finish(change: boolean) {
    setDone(true);
    void clearRequestedHandle();
    if (change) navigate('/settings');
  }

  if (!open) return null;
  return (
    <Dialog
      open
      onClose={() => finish(false)}
      title={`@${asked} was taken`}
      footer={
        <>
          <Button variant="secondary" onClick={() => finish(false)}>
            Keep @{got}
          </Button>
          <Button onClick={() => finish(true)}>Change handle</Button>
        </>
      }
    >
      <p className="m-0 text-base text-ink-secondary">
        Someone claimed it before your account was ready, so you’re @{got}. You can keep it or choose another in Settings.
      </p>
    </Dialog>
  );
}
