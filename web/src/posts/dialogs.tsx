import { useState, type FormEvent, type ReactNode } from 'react';
import {
  BODY_MAX,
  isSourceUrl,
  sourceAuthorFromUrl,
  TITLE_MAX,
  TITLE_TOO_LONG,
  useEditSeededPost,
  useUpdatePost,
  validatePost,
  type Post,
  type PostDraft,
  type PostErrors,
  type PostType,
} from '../api';
import { useViewer } from '../lib/viewer';
import { PlatformField } from './PlatformField';
import { Button, Dialog, Field, Input, Select, Textarea, useToast } from '../ui';

/** A yes/no question before something that cannot be undone. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="m-0 text-base text-ink-secondary">{children}</p>
      {error ? (
        <p role="alert" className="mt-3 mb-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

/**
 * Author edit: type, title and details (the only columns an author may change).
 * `seeded`: staff correcting a seeded post, which adds its source link and original date (0031).
 */
export function EditPostDialog({ post, open, onClose, seeded = false }: { post: Post; open: boolean; onClose: () => void; seeded?: boolean }) {
  const { toast } = useToast();
  const { viewer } = useViewer();
  const authorUpdate = useUpdatePost();
  const seededUpdate = useEditSeededPost(viewer?.id ?? null);
  const update = seeded ? seededUpdate : authorUpdate;
  const originalDay = post.created_at.slice(0, 10);
  const [sourceUrl, setSourceUrl] = useState(post.source_url ?? '');
  const [postedOn, setPostedOn] = useState(originalDay);
  const [sourceAuthor, setSourceAuthor] = useState(post.source_author ?? sourceAuthorFromUrl(post.source_url) ?? '');
  const [sourceError, setSourceError] = useState<string | undefined>();
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<PostDraft>({ type: post.type, title: post.title, body: post.body, platform: post.platform });
  const [errors, setErrors] = useState<PostErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const formId = `edit-post-${post.id}`;

  const unchanged =
    draft.type === post.type &&
    (draft.platform ?? null) === post.platform &&
    draft.title.trim() === post.title &&
    draft.body.trim() === post.body &&
    (!seeded ||
      (sourceUrl.trim() === (post.source_url ?? '') && postedOn === originalDay && sourceAuthor.trim() === (post.source_author ?? '')));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validatePost(draft);
    setErrors(found);
    const badSource = seeded && !isSourceUrl(sourceUrl) ? 'Paste the full https link to the original post.' : undefined;
    setSourceError(badSource);
    if (Object.keys(found).length || badSource) return;
    if (unchanged) {
      onClose();
      return;
    }
    setFailure(null);
    const callbacks = {
      onSuccess: () => {
        toast('Post updated');
        onClose();
      },
      onError: (err: unknown) => setFailure(err instanceof Error ? err.message : 'We couldn’t save your changes. Try again.'),
    };
    if (seeded) {
      seededUpdate.mutate({ id: post.id, draft: { ...draft, sourceUrl, sourceAuthor, postedOn: postedOn === originalDay ? null : postedOn || null } }, callbacks);
    } else {
      authorUpdate.mutate({ id: post.id, draft }, callbacks);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit post"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Type" error={errors.type}>
          <Select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as PostType }))}>
            <option value="bug">Bug</option>
            <option value="friction">Friction</option>
            <option value="feature">Feature request</option>
          </Select>
        </Field>
        <PlatformField value={draft.platform ?? null} onChange={(platform) => setDraft((d) => ({ ...d, platform }))} />
        <Field
          label="Title"
          error={draft.title.trim().length > TITLE_MAX ? TITLE_TOO_LONG : errors.title}
          aside={`${draft.title.trim().length}/${TITLE_MAX}`}
        >
          <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </Field>
        {seeded ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Source link" error={sourceError} className="min-w-0 flex-1">
              <Input
                type="url"
                inputMode="url"
                value={sourceUrl}
                autoComplete="off"
                onChange={(e) => {
                  setSourceUrl(e.target.value);
                  setSourceError(undefined);
                }}
              />
            </Field>
            <Field label="Originally posted">
              <Input type="date" value={postedOn} max={today} onChange={(e) => setPostedOn(e.target.value)} />
            </Field>
          </div>
        ) : null}
        {seeded ? (
          <Field label="Original poster" optional hint="Credited on the card as “@name on X”, linking to the original.">
              <Input
                value={sourceAuthor}
                placeholder="@handle or u/name"
                maxLength={80}
                autoComplete="off"
                onChange={(e) => setSourceAuthor(e.target.value)}
              />
          </Field>
        ) : null}
        <Field label="Details" optional error={errors.body}>
          <Textarea
            rows={6}
            value={draft.body}
            maxLength={BODY_MAX}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          />
        </Field>
        {failure ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {failure}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
