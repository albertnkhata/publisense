import { useState, type FormEvent, type ReactNode } from 'react';
import {
  BODY_MAX,
  TITLE_MAX,
  useUpdatePost,
  validatePost,
  type Post,
  type PostDraft,
  type PostErrors,
  type PostType,
} from '../api';
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

/** Author edit: type, title and details (the only columns an author may change). */
export function EditPostDialog({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdatePost();
  const [draft, setDraft] = useState<PostDraft>({ type: post.type, title: post.title, body: post.body });
  const [errors, setErrors] = useState<PostErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const formId = `edit-post-${post.id}`;

  const unchanged = draft.type === post.type && draft.title.trim() === post.title && draft.body.trim() === post.body;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validatePost(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (unchanged) {
      onClose();
      return;
    }
    setFailure(null);
    update.mutate(
      { id: post.id, draft },
      {
        onSuccess: () => {
          toast('Post updated');
          onClose();
        },
        onError: (err) => setFailure(err instanceof Error ? err.message : 'We couldn’t save your changes. Try again.'),
      },
    );
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
            <option value="feature">Feature request</option>
          </Select>
        </Field>
        <Field label="Title" error={errors.title} aside={`${draft.title.trim().length}/${TITLE_MAX}`}>
          <Input value={draft.title} maxLength={TITLE_MAX + 20} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </Field>
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
