import { useQuery } from '@tanstack/react-query';
import { getSupabase, publicStorageUrl } from './supabase';

/** The v2 `profile` row (0016_v2_schema.sql). */
export interface ProfileRow {
  id: string;
  handle: string;
  name: string;
  avatar_path: string | null;
  bio: string;
}

export const profileKey = (id: string | null | undefined) => ['profile', id ?? 'none'] as const;

export async function fetchProfile(id: string): Promise<ProfileRow | null> {
  const { data, error } = await getSupabase()
    .from('profile')
    .select('id, handle, name, avatar_path, bio')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ProfileRow | null) ?? null;
}

export function useProfile(id: string | null | undefined) {
  return useQuery({
    queryKey: profileKey(id),
    queryFn: () => fetchProfile(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export const avatarUrl = (path: string | null | undefined) => publicStorageUrl('avatars', path);

// ------------------------------------------------------------------ validation

export const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
export const NAME_MAX = 60;
export const BIO_MAX = 280;

export interface ProfileDraft {
  name: string;
  handle: string;
  bio: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>;

/** Mirrors the table's checks so the form explains them before the server refuses. */
export function validateProfile(d: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!d.name.trim()) errors.name = 'Add your name.';
  else if (d.name.trim().length > NAME_MAX) errors.name = `Keep it to ${NAME_MAX} characters.`;
  if (!HANDLE_RE.test(d.handle)) errors.handle = '3 to 30 characters: lowercase letters, numbers and underscores.';
  if (d.bio.length > BIO_MAX) errors.bio = `Keep it to ${BIO_MAX} characters.`;
  return errors;
}

export async function updateProfile(id: string, d: ProfileDraft): Promise<{ error: ProfileErrors | null }> {
  const { error } = await getSupabase()
    .from('profile')
    .update({ name: d.name.trim(), handle: d.handle, bio: d.bio.trim() })
    .eq('id', id);
  if (!error) return { error: null };
  if (error.code === '23505') return { error: { handle: 'That handle is taken.' } };
  if (error.code === '23514') return { error: { handle: 'That handle isn’t allowed.' } };
  return { error: { name: 'We couldn’t save your profile. Try again.' } };
}

// ------------------------------------------------------------------ avatar

/** The bucket's limit, enforced on what we upload (the cropped image). */
export const AVATAR_MAX_BYTES = 1024 * 1024;
/** What we accept to crop from. Bigger photos are fine: the crop scales them down. */
export const AVATAR_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
export type AvatarType = keyof typeof AVATAR_TYPES;
/** Output edge of the square crop. 512px PNG/JPEG/WebP stays well under 1 MB. */
export const AVATAR_EDGE = 512;

/** Validates the file the user picked, before cropping. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!(file.type in AVATAR_TYPES)) return 'Use a PNG, JPG or WebP image.';
  if (file.size > AVATAR_INPUT_MAX_BYTES) return 'That image is too large. Pick one under 10 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Square centre crop: the largest centred square of a w×h image. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h);
  return { sx: Math.round((w - size) / 2), sy: Math.round((h - size) / 2), size };
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

/** Storage path for a new avatar: `{user_id}/{uuid}.{ext}` (0018_v2_storage.sql). */
export function avatarPath(userId: string, type: AvatarType): string {
  return `${userId}/${uuid()}.${AVATAR_TYPES[type]}`;
}

/** Crop `file` to a centred square in the browser and re-encode it in its own type. */
export async function cropAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, size } = squareCrop(bitmap.width, bitmap.height);
  const edge = Math.min(size, AVATAR_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, edge, edge);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.9));
  if (!blob) throw new Error('could not encode image');
  return blob;
}

/**
 * Upload a cropped avatar, point the profile at it, then remove the previous
 * object through the Storage API (direct deletes from storage.objects are refused).
 */
export async function uploadAvatar(userId: string, blob: Blob, type: AvatarType, previous: string | null): Promise<{ path: string | null; error: string | null }> {
  if (blob.size > AVATAR_MAX_BYTES) return { path: null, error: 'That image is over 1 MB after cropping. Pick a smaller one.' };
  const sb = getSupabase();
  const path = avatarPath(userId, type);
  const up = await sb.storage.from('avatars').upload(path, blob, { contentType: type, upsert: false });
  if (up.error) return { path: null, error: 'We couldn’t upload that image. Try again.' };
  const { error } = await sb.from('profile').update({ avatar_path: path }).eq('id', userId);
  if (error) {
    await sb.storage.from('avatars').remove([path]);
    return { path: null, error: 'We couldn’t save your photo. Try again.' };
  }
  if (previous && previous !== path) await sb.storage.from('avatars').remove([previous]);
  return { path, error: null };
}

export async function removeAvatar(userId: string, previous: string | null): Promise<{ error: string | null }> {
  const sb = getSupabase();
  const { error } = await sb.from('profile').update({ avatar_path: null }).eq('id', userId);
  if (error) return { error: 'We couldn’t remove your photo. Try again.' };
  if (previous) await sb.storage.from('avatars').remove([previous]);
  return { error: null };
}
