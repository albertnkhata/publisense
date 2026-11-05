import { useState, type KeyboardEvent } from 'react';
import { postImageUrl } from '../api';
import { cx } from '../lib/cx';
import { Dialog, IconButton } from '../ui';

/**
 * Screenshots on a post (0060). One image shows wide; two to four sit in a grid of
 * even tiles. A tap opens the image full size, with arrows between them.
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
        {urls.map((url, i) => (
          <li key={url} className={cx(count === 3 && i === 0 ? 'row-span-2' : '')}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Open ${label(i).charAt(0).toLowerCase()}${label(i).slice(1)}`}
              className="block size-full cursor-zoom-in border-0 bg-subtle p-0"
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                className={cx(
                  'block w-full border border-line object-cover',
                  count === 1 ? (page ? 'max-h-shot-page object-contain' : 'max-h-shot') : count === 3 && i === 0 ? 'h-full' : 'aspect-shot',
                  'rounded-md',
                )}
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <Viewer urls={urls} index={open} onIndex={setOpen} onClose={() => setOpen(null)} label={label} /> : null}
    </>
  );
}

function Viewer({
  urls,
  index,
  onIndex,
  onClose,
  label,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  label: (i: number) => string;
}) {
  const many = urls.length > 1;
  const prev = () => onIndex((index - 1 + urls.length) % urls.length);
  const next = () => onIndex((index + 1) % urls.length);
  const onKey = (e: KeyboardEvent) => {
    if (!many) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
  };
  return (
    <Dialog open onClose={onClose} title={many ? `Screenshot ${index + 1} of ${urls.length}` : 'Screenshot'} size="lg">
      <div onKeyDown={onKey} className="flex flex-col items-center gap-3">
        <a href={urls[index]} target="_blank" rel="noreferrer" className="block">
          <img src={urls[index]} alt={label(index)} className="block max-h-shot-page max-w-full rounded-md border border-line object-contain" />
        </a>
        {many ? (
          <div className="flex items-center gap-2">
            <IconButton icon="chevron-left" label="Previous screenshot" variant="secondary" onClick={prev} />
            <IconButton icon="chevron-right" label="Next screenshot" variant="secondary" onClick={next} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
