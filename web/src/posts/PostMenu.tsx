import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDeletePost, useFollowPost, type Post } from '../api';
import { copyText, postUrl } from '../lib/share';
import { useViewer } from '../lib/viewer';
import { useRequireAuth } from '../shell/auth';
import { IconButton, Menu, MenuItem, MenuSeparator, useToast } from '../ui';
import { ConfirmDialog, EditPostDialog } from './dialogs';

/**
 * The ⋯ menu on a post: Follow/Unfollow, Copy link, and for the author Edit and
 * Delete. The mockup's Save, Hide and Report are left out until they exist
 * (FOUNDATION §10: hide a control rather than fake it); Update status arrives
 * with Manage in step 7.
 */
export function PostMenu({ post, onDeleted }: { post: Post; onDeleted?: () => void }) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const follow = useFollowPost(viewer?.id ?? null);
  const del = useDeletePost();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = Boolean(viewer && post.author_id === viewer.id);
  const canEdit = isAuthor && post.status !== 'merged';

  const toggleFollow = () => {
    if (!requireAuth('follow posts')) return;
    const on = !post.following;
    follow.mutate(
      { post, on },
      {
        onSuccess: () => toast(on ? 'You’ll get updates on this post' : 'Unfollowed · no more updates'),
        onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };

  const confirmDelete = () => {
    setError(null);
    del.mutate(post.id, {
      onSuccess: () => {
        setDeleting(false);
        toast('Post deleted');
        if (onDeleted) onDeleted();
        else void navigate('/');
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'We couldn’t delete this post. Try again.'),
    });
  };

  return (
    <>
      <Menu label="Post options" align="end" trigger={(p) => <IconButton {...p} icon="more" label="More options" size="sm" />}>
        <MenuItem
          icon="bell"
          description={post.following ? 'Stop status and reply updates' : 'Get status changes and team replies'}
          onSelect={toggleFollow}
        >
          {post.following ? 'Unfollow post' : 'Follow post'}
        </MenuItem>
        <MenuItem
          icon="link"
          onSelect={() => {
            void copyText(postUrl(post.id)).then((ok) => toast(ok ? 'Link copied' : 'Copy failed'));
          }}
        >
          Copy link
        </MenuItem>
        {isAuthor ? (
          <>
            <MenuSeparator />
            {canEdit ? (
              <MenuItem icon="edit" onSelect={() => setEditing(true)}>
                Edit post
              </MenuItem>
            ) : null}
            <MenuItem
              icon="trash"
              danger
              onSelect={() => {
                setError(null);
                setDeleting(true);
              }}
            >
              Delete post
            </MenuItem>
          </>
        ) : null}
      </Menu>
      {editing ? <EditPostDialog post={post} open onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={deleting}
        title="Delete this post?"
        confirmLabel="Delete post"
        busy={del.isPending}
        error={error}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(false)}
      >
        This removes the post with its upvotes and replies. You can’t undo this.
      </ConfirmDialog>
    </>
  );
}
