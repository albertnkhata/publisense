import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POST_IMAGE_ACCEPT,
  POST_IMAGES_MAX,
  isPostImageType,
  preparePostImage,
  removePostImages,
  uploadPostImage,
} from '../api';
import { IconButton, Spinner } from '../ui';

/*
 * Screenshots in the composer (0060). Each image uploads the moment it is added, so
 * Post only sends paths. Removing one, or discarding the draft, deletes what was
 * uploaded (best effort).
 */

export interface DraftImage {
  key: string;
  preview: string;
  status: 'uploading' | 'done' | 'error';
  path: string | null;
}

let seq = 0;

export function useImageDraft(viewerId: string | null) {
  const [items, setItems] = useState<DraftImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Free the previews when the composer goes away.
  useEffect(
    () => () => {
      for (const it of itemsRef.current) URL.revokeObjectURL(it.preview);
    },
    [],
  );

  const add = useCallback(
    (files: Iterable<File>) => {
      if (!viewerId) return;
      const list = [...files];
      const images = list.filter((f) => isPostImageType(f.type));
      if (list.length && images.length < list.length) setError('Use PNG, JPEG or WebP images.');
      else setError(null);
      const room = POST_IMAGES_MAX - itemsRef.current.length;
      if (images.length > room) setError(`You can add up to ${POST_IMAGES_MAX} images.`);
      for (const file of images.slice(0, Math.max(0, room))) {
        const key = `img-${++seq}`;
        const preview = URL.createObjectURL(file);
        setItems((cur) => [...cur, { key, preview, status: 'uploading', path: null }]);
        void (async () => {
          let path: string | null = null;
          let failed: string | null = null;
          try {
            const blob = await preparePostImage(file);
            const res = await uploadPostImage(viewerId, blob);
            path = res.path;
            failed = res.error;
          } catch {
            failed = 'We couldn’t read that image. Try another.';
          }
          // Removed while it uploaded: drop the orphan straight away.
          if (!itemsRef.current.some((it) => it.key === key)) {
            if (path) void removePostImages([path]);
            return;
          }
          if (failed) setError(failed);
          setItems((cur) => cur.map((it) => (it.key === key ? { ...it, status: path ? 'done' : 'error', path } : it)));
        })();
      }
    },
    [viewerId],
  );

  const remove = useCallback((key: string) => {
    const it = itemsRef.current.find((x) => x.key === key);
    if (!it) return;
    URL.revokeObjectURL(it.preview);
    if (it.path) void removePostImages([it.path]);
    setItems((cur) => cur.filter((x) => x.key !== key));
    setError(null);
  }, []);

  /** Throw the draft's uploads away (discard, or close without posting). */
  const discard = useCallback(() => {
    const paths = itemsRef.current.map((it) => it.path).filter((p): p is string => Boolean(p));
    void removePostImages(paths);
  }, []);

  return {
    items,
    error,
    add,
    remove,
    discard,
    paths: items.filter((it) => it.status === 'done' && it.path).map((it) => it.path as string),
    uploading: items.some((it) => it.status === 'uploading'),
    failed: items.some((it) => it.status === 'error'),
    full: items.length >= POST_IMAGES_MAX,
  };
}

export type ImageDraft = ReturnType<typeof useImageDraft>;

/** Pull image files from a paste (a copied screenshot) or a drop. */
export function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  return [...data.files].filter((f) => f.type.startsWith('image/'));
}

export function AddImagesButton({ draft }: { draft: ImageDraft }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton
        icon="image"
        label="Add screenshots"
        disabled={draft.full}
        onClick={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        accept={POST_IMAGE_ACCEPT}
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          draft.add(e.target.files ?? []);
          e.target.value = '';
        }}
      />
    </>
  );
}

export function DraftImages({ draft }: { draft: ImageDraft }) {
  if (draft.items.length === 0) return null;
  return (
    <ul aria-label="Screenshots to post" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {draft.items.map((it, i) => (
        <li key={it.key} className="relative size-10 overflow-hidden rounded-md border border-line bg-subtle">
          <img src={it.preview} alt={`Screenshot ${i + 1}`} className="block size-full object-cover" />
          {it.status === 'uploading' ? (
            <span className="absolute inset-0 grid place-items-center bg-card/70" aria-label="Uploading">
              <Spinner />
            </span>
          ) : null}
          {it.status === 'error' ? (
            <span className="absolute inset-x-0 bottom-0 bg-danger px-1 text-center text-xs text-on-brand">Failed</span>
          ) : null}
          <span className="absolute top-1 right-1">
            <IconButton icon="close" size="sm" variant="secondary" label={`Remove screenshot ${i + 1}`} onClick={() => draft.remove(it.key)} />
          </span>
        </li>
      ))}
    </ul>
  );
}
