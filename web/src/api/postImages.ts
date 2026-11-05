import { getSupabase, publicStorageUrl } from './supabase';

/*
 * Screenshots on posts (0060). Files go to the public post-images bucket under
 * {user_id}/{uuid}.{ext}, and the post row keeps the paths in display order. The
 * browser downscales and re-encodes each image first, so a phone screenshot lands well
 * under the 3 MB bucket limit and any location metadata in the original is dropped.
 */

export const POST_IMAGES_BUCKET = 'post-images';
export const POST_IMAGES_MAX = 4;
export const POST_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
/** Longest edge after downscaling: enough to read a desktop screenshot. */
export const POST_IMAGE_EDGE = 2400;
export const POST_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
type ImageType = keyof typeof EXT;

export const isPostImageType = (t: string): t is ImageType => t in EXT;

/** Same shape the database checks: {uuid}/{uuid}.{png|jpg|webp}. */
export const isPostImagePath = (p: string) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(p);

export function postImageUrl(path: string): string | null {
  return publicStorageUrl(POST_IMAGES_BUCKET, path);
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export function postImagePath(userId: string, type: ImageType): string {
  return `${userId}/${uuid()}.${EXT[type]}`;
}

/** The size to draw at so the longest edge is at most `edge`. */
export function fitWithin(w: number, h: number, edge = POST_IMAGE_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Downscale and re-encode in the browser. WebP where the browser can write it,
 * else JPEG for photos and PNG for small images, so text stays sharp.
 */
export async function preparePostImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const encode = (type: string, q?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  let blob = await encode('image/webp', 0.9);
  if (!blob || blob.type !== 'image/webp') blob = await encode(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
  if (blob && blob.size > POST_IMAGE_MAX_BYTES && blob.type !== 'image/jpeg') blob = await encode('image/jpeg', 0.85);
  if (!blob) throw new Error('could not encode image');
  return blob;
}

/** Upload one prepared image; the path goes on the post when it is posted. */
export async function uploadPostImage(userId: string, blob: Blob): Promise<{ path: string | null; error: string | null }> {
  if (!isPostImageType(blob.type)) return { path: null, error: 'Use a PNG, JPEG or WebP image.' };
  if (blob.size > POST_IMAGE_MAX_BYTES) return { path: null, error: 'That image is over 3 MB. Try a smaller one.' };
  const path = postImagePath(userId, blob.type);
  const { error } = await getSupabase().storage.from(POST_IMAGES_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) return { path: null, error: 'We couldn’t upload that image. Try again.' };
  return { path, error: null };
}

/** Best effort: an upload the composer dropped (removed, or the draft discarded). */
export async function removePostImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await getSupabase().storage.from(POST_IMAGES_BUCKET).remove(paths);
  } catch {
    /* an orphan in the bucket is harmless */
  }
}
