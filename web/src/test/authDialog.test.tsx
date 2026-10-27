import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AuthDialog, type AuthMode } from '../shell/AuthDialog';
import { renderWith } from './renderApp';

// The dialog only talks to the api layer; mock the calls, keep the copy and rules.
const api = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendSignupConfirmation: vi.fn(),
  signInWithGoogle: vi.fn(),
  fetchAuthCapabilities: vi.fn(),
}));

vi.mock('../api/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/auth')>();
  return {
    ...real,
    signInWithPassword: api.signInWithPassword,
    signUp: api.signUp,
    requestPasswordReset: api.requestPasswordReset,
    resendSignupConfirmation: api.resendSignupConfirmation,
    signInWithGoogle: api.signInWithGoogle,
    useAuthCapabilities: () => api.fetchAuthCapabilities(),
  };
});

function open(mode: AuthMode = 'signin', reason?: string) {
  const onClose = vi.fn();
  renderWith(<AuthDialog open initialMode={mode} reason={reason} onClose={onClose} />);
  return { onClose };
}

const email = () => screen.getByRole('textbox', { name: 'Email address' });
const password = () => screen.getByLabelText('Password');
const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const alert = () => screen.getByRole('alert').textContent;

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchAuthCapabilities.mockReturnValue({ google: false, confirmEmail: true });
});

describe('AuthDialog: sign in', () => {
  it('is labelled by the mockup title and shows no GitHub button', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Sign in to Publisense' })).toBeTruthy();
    expect(screen.queryByText(/GitHub/)).toBeNull();
  });

  it('shows Continue with Google only when the project has it enabled', () => {
    api.fetchAuthCapabilities.mockReturnValue({ google: true, confirmEmail: true });
    api.signInWithGoogle.mockResolvedValue({ error: null });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(api.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('hides Google when the project does not report it', () => {
    open();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  });

  it('validates in the mockup order before calling the api', async () => {
    open();
    submit('Sign in');
    expect(alert()).toBe('Enter a valid email address.');
    fireEvent.change(email(), { target: { value: 'a@b.co' } });
    submit('Sign in');
    expect(alert()).toBe('Enter your password.');
    expect(api.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows the api’s safe error and stays open', async () => {
    api.signInWithPassword.mockResolvedValue({ error: 'That email and password don’t match. Try again or reset your password.' });
    const { onClose } = open();
    fireEvent.change(email(), { target: { value: 'a@b.co' } });
    fireEvent.change(password(), { target: { value: 'nope' } });
    submit('Sign in');
    await waitFor(() => expect(alert()).toBe('That email and password don’t match. Try again or reset your password.'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes and confirms on success', async () => {
    api.signInWithPassword.mockResolvedValue({ error: null });
    const { onClose } = open();
    fireEvent.change(email(), { target: { value: ' a@b.co ' } });
    fireEvent.change(password(), { target: { value: 'secret-pass' } });
    submit('Sign in');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.signInWithPassword).toHaveBeenCalledWith('a@b.co', 'secret-pass');
    expect(await screen.findByText('Signed in')).toBeTruthy();
  });

  it('uses the gated action as its sub line', () => {
    open('signin', 'upvote');
    expect(screen.getByText('Sign in to upvote. It takes a few seconds.')).toBeTruthy();
  });
});

describe('AuthDialog: sign up', () => {
  it('switches from sign in and asks for a name and an 8-character password', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('dialog', { name: 'Create your account' })).toBeTruthy();
    fireEvent.change(email(), { target: { value: 'new@b.co' } });
    submit('Create account');
    expect(alert()).toBe('Add your name.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Nia' } });
    fireEvent.change(password(), { target: { value: 'short' } });
    submit('Create account');
    expect(alert()).toBe('Use at least 8 characters.');
    expect(screen.getByText('Too weak')).toBeTruthy(); // the existing strength meter
    expect(api.signUp).not.toHaveBeenCalled();
  });

  it('asks the user to confirm their email when the project requires it', async () => {
    api.signUp.mockResolvedValue({ error: null, needsConfirmation: true });
    const { onClose } = open('signup');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Nia' } });
    fireEvent.change(email(), { target: { value: 'new@b.co' } });
    fireEvent.change(password(), { target: { value: 'Long-enough-1' } });
    submit('Create account');
    expect(await screen.findByRole('dialog', { name: 'Confirm your email' })).toBeTruthy();
    expect(screen.getByText(/Open the link we sent to new@b.co/)).toBeTruthy();
    expect(api.signUp).toHaveBeenCalledWith('Nia', 'new@b.co', 'Long-enough-1');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes with a toast when no confirmation is needed', async () => {
    api.signUp.mockResolvedValue({ error: null, needsConfirmation: false });
    const { onClose } = open('signup');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Nia' } });
    fireEvent.change(email(), { target: { value: 'new@b.co' } });
    fireEvent.change(password(), { target: { value: 'Long-enough-1' } });
    submit('Create account');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText('Account created')).toBeTruthy();
  });
});

describe('AuthDialog: confirm your email', () => {
  async function signUpNia() {
    api.signUp.mockResolvedValue({ error: null, needsConfirmation: true });
    open('signup');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Nia' } });
    fireEvent.change(email(), { target: { value: 'new@b.co' } });
    fireEvent.change(password(), { target: { value: 'Long-enough-1' } });
    await act(async () => submit('Create account'));
    expect(screen.getByRole('dialog', { name: 'Confirm your email' })).toBeTruthy();
  }

  it('offers Resend email a minute after sending, then waits another minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      api.resendSignupConfirmation.mockResolvedValue({ error: null });
      await signUpNia();
      expect(screen.getByText('Didn’t get it? You can resend it in a minute.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Resend email' })).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      await act(async () => submit('Resend email'));
      expect(api.resendSignupConfirmation).toHaveBeenCalledWith('new@b.co');
      expect(screen.getByText('Confirmation email sent')).toBeTruthy();
      expect(screen.getByText(/Sent again\. Check your spam folder too\. You can resend in a minute\./)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Resend email' })).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByRole('button', { name: 'Resend email' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows friendly copy when the resend is throttled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      api.resendSignupConfirmation.mockResolvedValue({ error: 'We just sent one. Wait a minute, then try again.' });
      await signUpNia();
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      await act(async () => submit('Resend email'));
      expect(alert()).toBe('We just sent one. Wait a minute, then try again.');
      expect(screen.queryByRole('button', { name: 'Resend email' })).toBeNull(); // a fresh minute
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes back to sign-up with the email kept and editable', async () => {
    await signUpNia();
    submit('Use a different email');
    expect(screen.getByRole('dialog', { name: 'Create your account' })).toBeTruthy();
    expect((email() as HTMLInputElement).value).toBe('new@b.co');
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Nia');
    fireEvent.change(email(), { target: { value: 'nia@b.co' } });
    expect((email() as HTMLInputElement).value).toBe('nia@b.co');
  });
});

describe('AuthDialog: forgot → sent', () => {
  it('answers the same way whether or not the email has an account', async () => {
    api.requestPasswordReset.mockResolvedValue({ error: null });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('dialog', { name: 'Reset your password' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.change(email(), { target: { value: 'who@b.co' } });
    submit('Send reset link');
    expect(await screen.findByRole('dialog', { name: 'Check your email' })).toBeTruthy();
    expect(screen.getByText('If who@b.co has an account, a reset link is on its way. It expires in 1 hour.')).toBeTruthy();
  });

  it('resends from the sent step and goes back to sign in', async () => {
    api.requestPasswordReset.mockResolvedValue({ error: null });
    open('forgot');
    fireEvent.change(email(), { target: { value: 'who@b.co' } });
    submit('Send reset link');
    await screen.findByRole('dialog', { name: 'Check your email' });
    await act(async () => submit('Resend'));
    expect(api.requestPasswordReset).toHaveBeenLastCalledWith('who@b.co');
    expect(await screen.findByText('Sent another link')).toBeTruthy();
    submit('Back to sign in');
    expect(screen.getByRole('dialog', { name: 'Sign in to Publisense' })).toBeTruthy();
  });

  it('only stops on a throttle or a network failure', async () => {
    api.requestPasswordReset.mockResolvedValue({ error: 'Too many tries. Wait a minute, then try again.' });
    open('forgot');
    fireEvent.change(email(), { target: { value: 'who@b.co' } });
    submit('Send reset link');
    await waitFor(() => expect(alert()).toBe('Too many tries. Wait a minute, then try again.'));
    expect(screen.getByRole('dialog', { name: 'Reset your password' })).toBeTruthy();
  });
});
