import { useState } from 'react';
import { postImageUrl } from '../api';
import { cx } from '../lib/cx';
import { ImageViewer } from './ImageViewer';

/**
 * Screenshots on a post (0060). One image shows wide; two to four sit in a grid of
 * even tiles. A tap opens the full-screen viewer (ImageViewer).
 */
export function PostImages({ paths, title, page = false }: { paths: string[] | undefined; title: string; page?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const urls = (paths ?? []).map((p) => postImageUrl(p)).filter((u): u is string => Boolean(u));
  if (urls.length === 0) return null;
  const count = urls.length;
  const label = (i: number) => (count === 1 ? `Screenshot for ${title}` : `Screenshot ${i + 1} of ${count} for ${title}`);

  return (
    <>
      <ul
        aria-label="Screenshots"
        className={cx('m-0 mt-2 grid list-none gap-1 overflow-hidden rounded-md p-0', count === 1 ? 'grid-cols-1' : 'grid-cols-2')}
      >
        {urls.map((url, i) => {
          const span = count === 3 && i === 0;
          return (
            <li key={url} className={cx(span && 'relative row-span-2')}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Open ${label(i).charAt(0).toLowerCase()}${label(i).slice(1)}`}
                className={cx('group block size-full cursor-zoom-in border-0 bg-subtle p-0', span && 'absolute inset-0')}
              >
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={cx(
                    'block w-full border border-line object-cover transition-opacity duration-120 ease-out group-hover:opacity-90',
                    count === 1 ? (page ? 'max-h-shot-page object-contain' : 'max-h-shot') : span ? 'h-full' : 'aspect-shot',
                    'rounded-md',
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
      {open !== null ? <ImageViewer urls={urls} index={open} onIndex={setOpen} onClose={() => setOpen(null)} label={label} /> : null}
    </>
  );
}
