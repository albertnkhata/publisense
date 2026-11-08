import { STATUS_META, TYPE_META } from '../ui';
import type { Board, Post } from '../api';

const ORIGIN = 'https://publisense.app';
const GH_REPO_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+?)(?:\/.*)?$/i;

/** If a board's site is a GitHub repository ("github.com/owner/repo"), return "owner/repo". */
export function githubRepoFromSite(site: string | null | undefined): string | null {
  const m = GH_REPO_RE.exec((site ?? '').trim());
  if (!m?.[1]) return null;
  const repo = m[1].replace(/\.git$/i, '');
  const [owner] = repo.split('/');
  if (!owner || /^(orgs|users|topics|features|marketplace|pricing|settings|explore|sponsors)$/i.test(owner)) return null;
  return repo;
}

export function postPermalink(postId: string, origin = ORIGIN): string {
  return `${origin}/post/${postId}`;
}

/** Clean Markdown summary of a Publisense post for pasting into Jira, Notion, GitLab, or Linear. */
export function formatIssueMarkdown(post: Post, origin = ORIGIN): string {
  const typeLabel = TYPE_META[post.type].label;
  const statusLabel = STATUS_META[post.status].label;
  const url = postPermalink(post.id, origin);
  const author = post.author ? `@${post.author.handle}` : post.source_author ? `${post.source_author} (imported)` : 'Community member';
  const votes = `${post.vote_count} ${post.vote_count === 1 ? 'vote' : 'votes'}`;
  const body = post.body.trim();
  return [
    `## [${typeLabel}] ${post.title}`,
    ...(body ? ['', body] : []),
    '',
    '---',
    `**Publisense:** [${post.title}](${url}) · ${votes} · ${statusLabel} · Reported by ${author}`,
  ].join('\n');
}

/** Pre-filled Linear issue creation URL (`https://linear.app/new?title=...&description=...`). */
export function linearIssueUrl(post: Post, origin = ORIGIN): string {
  const typeLabel = TYPE_META[post.type].label;
  const params = new URLSearchParams({
    title: `[${typeLabel}] ${post.title}`,
    description: formatIssueMarkdown(post, origin),
  });
  return `https://linear.app/new?${params.toString()}`;
}

/** Pre-filled GitHub issue creation URL (`https://github.com/owner/repo/issues/new?title=...&body=...`). */
export function githubIssueUrl(repo: string, post: Post, origin = ORIGIN): string {
  const typeLabel = TYPE_META[post.type].label;
  const params = new URLSearchParams({
    title: `[${typeLabel}] ${post.title}`,
    body: formatIssueMarkdown(post, origin),
  });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

/** Resolve the board site from the board or optional site string. */
export function resolveBoardGitHubRepo(_post: Post, board?: Board | null, site?: string | null): string | null {
  return githubRepoFromSite(board?.site ?? site ?? null);
}
