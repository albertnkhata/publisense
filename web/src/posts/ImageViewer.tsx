import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { trapTab } from '../lib/focus';
import { Icon, Spinner, type IconName } from '../ui';

/** How far a touch has to travel before it counts as a swipe (px). */
const SWIPE = 56;
/** A drag shorter than this is still a tap (px). */
const TAP = 8;

/**
 * Full-screen screenshot viewer (0060). The image fills the window on a dark
 * backdrop; arrows on the edges, a counter, a thumbnail strip, Open original and
 * a zoom toggle (fit ↔ actual size) sit over it. Keys work from anywhere while it
 * is open (←/→, Home/End, Esc), touch swipes step left/right and a swipe down
 * closes. Focus is trapped and returns to the tile that opened it.
 */
export function ImageViewer({
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
  const count = urls.length;
  const many = count > 1;
  const url = urls[index]!;
  const title = many ? `Screenshot ${index + 1} of ${count}` : 'Screenshot';
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [states, setStates] = useState<Record<string, { status: 'loaded'; zoomable: boolean } | { status: 'failed' }>>({});
  const [zoomed, setZoomed] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // A swipe ends in a click too; this swallows that click.
  const swiped = useRef(false);

  const go = (i: number) => {
    setZoomed(false);
    onIndex((i + count) % count);
  };
  const prev = () => go(index - 1);
  const next = () => go(index + 1);

  // Latest handlers for the document listener, which is bound once.
  const keys = useRef({ prev, next, go, onClose, many, count });
  keys.current = { prev, next, go, onClose, many, count };

  // Remember the opener so focus can go back to it.
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        k.onClose();
      } else if (e.key === 'Tab' && panel) {
        trapTab(e, panel);
      } else if (k.many && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') k.prev();
        else if (e.key === 'ArrowRight') k.next();
        else k.go(e.key === 'Home' ? 0 : k.count - 1);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      const back = returnTo.current;
      if (back && document.contains(back)) back.focus();
    };
  }, []);

  // Warm the neighbours so stepping through feels instant.
  useEffect(() => {
    if (!many || typeof Image === 'undefined') return;
    for (const i of [index - 1, index + 1]) {
      const img = new Image();
      img.src = urls[(i + count) % count]!;
    }
  }, [index, urls, many, count]);

  // Touch: swipe sideways to step, down to close. Mouse keeps click-to-zoom.
  const onPointerDown = (e: ReactPointerEvent) => {
    swiped.current = false;
    if (zoomed || e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    setDrag(Math.abs(x) > Math.abs(y) ? { x: many ? x : 0, y: 0 } : { x: 0, y: Math.max(0, y) });
  };
  const endDrag = () => {
    const d = drag;
    start.current = null;
    setDrag(null);
    if (!d) return;
    swiped.current = Math.abs(d.x) > TAP || d.y > TAP;
    if (many && d.x <= -SWIPE) next();
    else if (many && d.x >= SWIPE) prev();
    else if (d.y >= SWIPE * 1.5) onClose();
  };
  const currentState = states[url];
  const isLoaded = currentState?.status === 'loaded';
  const isFailed = currentState?.status === 'failed';
  const canZoom = currentState?.status === 'loaded' && currentState.zoomable;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-viewer text-on-image backdrop-blur-md outline-none"
    >
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      <p aria-live="polite" className="sr-only">
        {label(index)}
      </p>

      <header className="relative z-10 flex items-center gap-1 py-2 pr-2 pl-4">
        <span aria-hidden="true" className="flex-1 font-mono text-sm text-on-image-muted">
          {many ? `${index + 1} / ${count}` : null}
        </span>
        {canZoom ? (
          <ViewerButton
            icon={zoomed ? 'zoom-out' : 'zoom-in'}
            label={zoomed ? 'Fit to screen' : 'Zoom to actual size'}
            pressed={zoomed}
            onClick={() => setZoomed((z) => !z)}
          />
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open original in a new tab"
          className={BUTTON}
        >
          <Icon name="arrow-up-right" size={20} strokeWidth={1.8} />
        </a>
        <ViewerButton icon="close" label="Close" onClick={onClose} />
      </header>

      <div
        className={cx('relative min-h-0 flex-1', zoomed ? 'overflow-auto' : 'touch-none overflow-hidden')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className={cx('flex', zoomed ? 'min-h-full min-w-full p-4' : 'absolute inset-0 px-4 py-2 max-sm:px-0')}
          onClick={(e) => {
            if (e.target === e.currentTarget && !swiped.current) onClose();
          }}
        >
          {!isLoaded && !isFailed ? (
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-on-image-muted">
              <Spinner className="size-6" />
            </span>
          ) : null}
          {isFailed ? (
            <p className="m-auto px-6 text-center text-base text-on-image-muted">
              Couldn’t load this screenshot.{' '}
              <a href={url} target="_blank" rel="noreferrer" className="text-on-image underline">
                Open it in a new tab
              </a>
            </p>
          ) : (
            <img
              key={url}
              src={url}
              alt={label(index)}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                const box = img.parentElement;
                const zoomable = box ? img.naturalWidth > box.clientWidth || img.naturalHeight > box.clientHeight : false;
                setStates((m) => ({ ...m, [url]: { status: 'loaded', zoomable } }));
              }}
              onError={() => setStates((m) => ({ ...m, [url]: { status: 'failed' } }))}
              onClick={() => {
                if (canZoom && !swiped.current) setZoomed((z) => !z);
              }}
              style={{ '--drag-x': `${drag?.x ?? 0}px`, '--drag-y': `${drag?.y ?? 0}px` }}
              className={cx(
                'm-auto block select-none rounded-sm object-contain transition-opacity duration-180 ease-out',
                zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full',
                !zoomed && canZoom && 'cursor-zoom-in',
                drag && 'translate-x-(--drag-x) translate-y-(--drag-y) transition-none',
                isLoaded ? 'opacity-100' : 'opacity-0',
              )}
            />
          )}
        </div>

        {many && !zoomed ? (
          <>
            <EdgeButton side="left" icon="chevron-left" label="Previous screenshot" onClick={prev} />
            <EdgeButton side="right" icon="chevron-right" label="Next screenshot" onClick={next} />
          </>
        ) : null}
      </div>

      {many ? (
        <ul aria-label="All screenshots" className="m-0 flex list-none justify-center gap-2 p-0 px-4 pt-2 pb-4">
          {urls.map((u, i) => (
            <li key={u}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Show screenshot ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className={cx(
                  'block overflow-hidden rounded-sm border-0 bg-on-image/10 p-0 transition-opacity duration-120 ease-out',
                  i === index ? 'opacity-100 ring-2 ring-on-image' : 'opacity-55 hover:opacity-90',
                )}
              >
                <img src={u} alt="" loading="lazy" decoding="async" className="block h-9 w-10 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>,
    document.body,
  );
}

const BUTTON =
  'inline-grid size-8 shrink-0 place-items-center rounded-pill border-0 bg-transparent text-on-image-muted transition-colors duration-120 ease-out hover:bg-on-image/10 hover:text-on-image';

function ViewerButton({ icon, label, onClick, pressed }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} className={BUTTON}>
      <Icon name={icon} size={20} strokeWidth={1.8} />
    </button>
  );
}

function EdgeButton({ side, icon, label, onClick }: { side: 'left' | 'right'; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx(
        'absolute top-1/2 inline-grid size-9 -translate-y-1/2 place-items-center rounded-pill border border-on-image-line bg-scrim text-on-image backdrop-blur-md',
        'transition-colors duration-120 ease-out hover:bg-on-image/20 max-sm:size-8',
        side === 'left' ? 'left-4 max-sm:left-2' : 'right-4 max-sm:right-2',
      )}
    >
      <Icon name={icon} size={20} strokeWidth={2} />
    </button>
  );
}
