/**
 * User Account Silo & Interaction Storage
 * Architecturally isolates interactions, upvotes, reposts, follows,
 * and notifications per user account to prevent data bleeding.
 */

const STORAGE_PREFIX = 'crowdpulse_silo_';

function getStorageKey(type: string, userIdOrHandle: string): string {
  let clean = (userIdOrHandle || 'anonymous').toLowerCase().trim();
  if (clean.startsWith('@')) clean = clean.slice(1);
  if (clean === 'usr-albert' || clean === 'albert' || clean.includes('albertnkhata')) {
    clean = 'albert';
  } else {
    clean = clean.replace(/[^a-z0-9_]/g, '_');
  }
  return `${STORAGE_PREFIX}${type}_${clean}`;
}

function isAlbertAccount(userIdOrHandle: string): boolean {
  const clean = (userIdOrHandle || '').toLowerCase().trim().replace(/^@/, '');
  return clean === 'albert' || clean === 'usr-albert' || clean.includes('albertnkhata');
}

export function getUserUpvotedIds(userIdOrHandle: string): Set<string> {
  if (!userIdOrHandle || typeof window === 'undefined') return new Set();
  try {
    const key = getStorageKey('upvotes', userIdOrHandle);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function setUserUpvotedIds(userIdOrHandle: string, ids: Set<string>): void {
  if (!userIdOrHandle || typeof window === 'undefined') return;
  try {
    const key = getStorageKey('upvotes', userIdOrHandle);
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.warn('Could not persist user upvotes:', e);
  }
}

export function toggleUserUpvote(userIdOrHandle: string, itemId: string): boolean {
  const current = getUserUpvotedIds(userIdOrHandle);
  let nextVoted = false;
  if (current.has(itemId)) {
    current.delete(itemId);
    nextVoted = false;
  } else {
    current.add(itemId);
    nextVoted = true;
  }
  setUserUpvotedIds(userIdOrHandle, current);
  return nextVoted;
}

export function getUserRepostedIds(userIdOrHandle: string): Set<string> {
  if (!userIdOrHandle || typeof window === 'undefined') return new Set();
  try {
    const key = getStorageKey('reposts', userIdOrHandle);
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (isAlbertAccount(userIdOrHandle)) {
        return new Set(['fb-6']);
      }
      return new Set();
    }
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function setUserRepostedIds(userIdOrHandle: string, ids: Set<string>): void {
  if (!userIdOrHandle || typeof window === 'undefined') return;
  try {
    const key = getStorageKey('reposts', userIdOrHandle);
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.warn('Could not persist user reposts:', e);
  }
}

export function toggleUserRepost(userIdOrHandle: string, itemId: string): boolean {
  const current = getUserRepostedIds(userIdOrHandle);
  let nextReposted = false;
  if (current.has(itemId)) {
    current.delete(itemId);
    nextReposted = false;
  } else {
    current.add(itemId);
    nextReposted = true;
  }
  setUserRepostedIds(userIdOrHandle, current);
  return nextReposted;
}

export function getUserFollowedProducts(userIdOrHandle: string): string[] {
  if (!userIdOrHandle || typeof window === 'undefined') return [];
  try {
    const key = getStorageKey('followed_products', userIdOrHandle);
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (isAlbertAccount(userIdOrHandle)) {
        return ['prod-cursor', 'prod-crowdpulse'];
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setUserFollowedProducts(userIdOrHandle: string, productIds: string[]): void {
  if (!userIdOrHandle || typeof window === 'undefined') return;
  try {
    const key = getStorageKey('followed_products', userIdOrHandle);
    localStorage.setItem(key, JSON.stringify(productIds));
  } catch (e) {
    console.warn('Could not persist followed products:', e);
  }
}

export function getUserFollowedUsers(userIdOrHandle: string): string[] {
  if (!userIdOrHandle || typeof window === 'undefined') return [];
  try {
    const key = getStorageKey('followed_users', userIdOrHandle);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setUserFollowedUsers(userIdOrHandle: string, handles: string[]): void {
  if (!userIdOrHandle || typeof window === 'undefined') return;
  try {
    const key = getStorageKey('followed_users', userIdOrHandle);
    localStorage.setItem(key, JSON.stringify(handles));
  } catch (e) {
    console.warn('Could not persist followed users:', e);
  }
}

export function getUserDismissedNotifIds(userIdOrHandle: string): Set<string> {
  if (!userIdOrHandle || typeof window === 'undefined') return new Set();
  try {
    const key = getStorageKey('dismissed_notifs', userIdOrHandle);
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markUserDismissedNotif(userIdOrHandle: string, notifId: string): void {
  if (!userIdOrHandle || typeof window === 'undefined') return;
  try {
    const dismissed = getUserDismissedNotifIds(userIdOrHandle);
    dismissed.add(notifId);
    const key = getStorageKey('dismissed_notifs', userIdOrHandle);
    localStorage.setItem(key, JSON.stringify(Array.from(dismissed)));
  } catch (e) {
    console.warn('Could not persist dismissed notification:', e);
  }
}

export function getUserReadNotifIds(userIdOrHandle: string): Set<string> {
  if (!userIdOrHandle || typeof window === 'undefined') return new Set();
  try {
    const key = getStorageKey('read_notifs', userIdOrHandle);
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markUserReadNotif(userIdOrHandle: string, notifId: string): void {
  if (!userIdOrHandle || typeof window === 'undefined') return;
  try {
    const read = getUserReadNotifIds(userIdOrHandle);
    read.add(notifId);
    const key = getStorageKey('read_notifs', userIdOrHandle);
    localStorage.setItem(key, JSON.stringify(Array.from(read)));
  } catch (e) {
    console.warn('Could not persist read notification:', e);
  }
}
