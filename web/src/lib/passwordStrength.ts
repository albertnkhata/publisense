/**
 * Coarse 0–3 strength used by the PasswordInput meter. Deliberately simple and
 * advisory: the server (Supabase auth) is what enforces the real policy.
 */
export type Strength = 0 | 1 | 2 | 3;

export function passwordStrength(pw: string): Strength {
  if (!pw) return 0;
  if (pw.length < 8) return 1;
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/\d/.test(pw)) variety++;
  if (/[^A-Za-z0-9]/.test(pw)) variety++;
  if (pw.length >= 12 && variety >= 3) return 3;
  if (variety >= 2) return 2;
  return 1;
}

export const STRENGTH_LABEL: Record<Strength, string> = {
  0: '',
  1: 'Too weak',
  2: 'Okay',
  3: 'Strong',
};
