import { useState } from 'react';
import { useNavigate } from 'react-router';
import { editLockReason, postKind, useDeletePost, useFollowPost, useHidePost, useIsBoardTeam, useIsPlatformAdmin, type Post } from '../api';
import { copyText, postUrl } from '../lib/share';
import { useViewer } from '../lib/viewer';
import { useRequireAuth } from '../shell/auth';
import { IconButton, Menu, MenuItem, MenuSeparator, useToast } from '../ui';
import { ConfirmDialog, EditPostDialog } from './dialogs';
import { MergeDialog } from './MergeDialog';
import { ReportDialog } from './ReportDialog';
import { StatusDialog } from './StatusDialog';

/**
 * The ⋯ menu on a post: Follow/Unfollow, Copy link, Update status and Merge for
 * the board's team, Hide/Unhide for the team and platform admins (everyone else
 * stops seeing it), Report for everyone else, and Edit and Delete for the author.
 * The mockup's Save is left out until it exists (FOUNDATION §10).
 */
export function PostMenu({ post, onDeleted }: { post: Post; onDeleted?: () => void }) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const follow = useFollowPost(viewer?.id ?? null);
  const del = useDeletePost();
  const team = useIsBoardTeam(post.board_id, viewer?.id ?? null);
  const staff = useIsPlatformAdmin(viewer?.id ?? null);
  const hide = useHidePost();
  const [statusOpen, setStatusOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = Boolean(viewer && post.author_id === viewer.id);
  // Staff look after seeded posts (no author, a source link): edit and delete them (0031).
  const staffSeeded = Boolean(staff.data) && postKind(post) === 'seeded';
  // Authors edit within the window and never once Shipped, Closed or Merged (0045; the DB enforces it).
  const lock = staffSeeded ? null : editLockReason(post);
  const showEdit = isAuthor || staffSeeded;
  const canDelete = isAuthor || staffSeeded;
  const canHide = Boolean(team.data || staff.data);

  const toggleHidden = () => {
    const hidden = !post.hidden_at;
    hide.mutate(
      { postId: post.id, hidden },
      {
        onSuccess: () => toast(hidden ? 'Post hidden' : 'Post visible again'),
        onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };

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
    del.mutate(staffSeeded && !isAuthor ? { id: post.id, seeded: true } : post.id, {
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
        {team.data && post.status !== 'merged' ? (
          <MenuItem icon="status-planned" description="Set a status and add a timeline note" onSelect={() => setStatusOpen(true)}>
            Update status
          </MenuItem>
        ) : null}
        {team.data && post.status !== 'merged' ? (
          <MenuItem icon="status-merged" description="Move its votes to the original" onSelect={() => setMerging(true)}>
            Merge duplicate
          </MenuItem>
        ) : null}
        <MenuItem
          icon="link"
          onSelect={() => {
            void copyText(postUrl(post.id)).then((ok) => toast(ok ? 'Link copied' : 'Copy failed'));
          }}
        >
          Copy link
        </MenuItem>
        {canHide ? (
          <>
            <MenuSeparator />
            <MenuItem
              icon="eye-off"
              description={post.hidden_at ? 'Show it to everyone again' : 'Only the team and the author will see it'}
              onSelect={toggleHidden}
            >
              {post.hidden_at ? 'Unhide post' : 'Hide post'}
            </MenuItem>
          </>
        ) : null}
        {!isAuthor ? (
          <>
            {canHide ? null : <MenuSeparator />}
            <MenuItem
              icon="flag"
              danger
              onSelect={() => {
                if (!requireAuth('report posts')) return;
                setReporting(true);
              }}
            >
              Report
            </MenuItem>
          </>
        ) : null}
        {canDelete ? (
          <>
            <MenuSeparator />
            {showEdit ? (
              <MenuItem icon="edit" disabled={Boolean(lock)} description={lock ?? undefined} onSelect={() => setEditing(true)}>
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
      {statusOpen ? <StatusDialog post={post} open onClose={() => setStatusOpen(false)} /> : null}
      {merging ? <MergeDialog post={post} open onClose={() => setMerging(false)} /> : null}
      {reporting ? <ReportDialog target="post" id={post.id} subject={post.title} open onClose={() => setReporting(false)} /> : null}
      {editing ? <EditPostDialog post={post} seeded={staffSeeded} open onClose={() => setEditing(false)} /> : null}
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
