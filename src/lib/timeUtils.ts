/**
 * Utility functions for calculating dynamic relative timestamps
 * Handles ISO strings, epoch millisecond numbers, and legacy date strings.
 */

export function parseTimestamp(val: string | number | undefined, fallbackId?: string): number | null {
  if (typeof val === 'number' && !isNaN(val) && val > 0) {
    return val;
  }

  if (typeof val === 'string' && val.trim()) {
    const trimmed = val.trim();

    // Check if it's a numeric string (epoch ms)
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) return num;
    }

    // Check if it's an ISO date or parseable date string
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed) && !trimmed.toLowerCase().includes('ago') && trimmed.toLowerCase() !== 'just now') {
      return parsed;
    }
  }

  // Fallback: extract timestamp from ID if format is fb-1791434654029, notif-1791..., c-1791...
  if (fallbackId && typeof fallbackId === 'string') {
    const match = fallbackId.match(/(\d{12,14})/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) return num;
    }
  }

  return null;
}

export function formatRelativeTime(
  createdAt: string | number | undefined,
  fallbackId?: string
): string {
  if (!createdAt && !fallbackId) return 'Just now';

  // If createdAt is already a human-written relative string like "2 days ago", "1 week ago", and not "just now"
  if (
    typeof createdAt === 'string' &&
    createdAt.toLowerCase().includes('ago')
  ) {
    return createdAt;
  }

  const timestamp = parseTimestamp(createdAt, fallbackId);
  if (!timestamp) {
    // If we couldn't parse a number and createdAt was "Just now", try to extract timestamp from fallbackId
    if (typeof createdAt === 'string' && createdAt.trim().toLowerCase() === 'just now') {
      const extracted = fallbackId ? parseTimestamp(undefined, fallbackId) : null;
      if (!extracted) return 'Just now';
      return formatElapsedTime(extracted);
    }
    return typeof createdAt === 'string' && createdAt ? createdAt : 'Just now';
  }

  return formatElapsedTime(timestamp);
}

function formatElapsedTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) {
    return 'Just now';
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin === 1 ? '1 min ago' : `${diffMin} mins ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) {
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
}
