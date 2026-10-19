export function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return 'recently';
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(1, Math.floor(diffMs / 1000));

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}
