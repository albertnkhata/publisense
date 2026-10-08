export const STORAGE_PREFIX = 'crowdpulse_profile_';

export interface StoredProfile {
  name?: string;
  org?: string;
  bio?: string;
  avatar?: string;
  handle?: string;
  location?: string;
  joinedAt?: string;
  followers?: number;
  following?: number;
  role?: string;
  updatedAt?: number;
}

export function loadProfile(handle: string): StoredProfile | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = localStorage.getItem(STORAGE_PREFIX + handle);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load profile from localStorage:', err);
    return null;
  }
}

export function saveProfile(
  handle: string, 
  profile: { 
    name: string; 
    org: string; 
    bio: string; 
    avatar?: string; 
    handle?: string;
    location?: string;
    joinedAt?: string;
    followers?: number;
    following?: number;
    role?: string;
  }
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const existing = loadProfile(handle);
    const record: StoredProfile = {
      ...existing,
      name: profile.name,
      org: profile.org,
      bio: profile.bio,
      ...(profile.avatar !== undefined ? { avatar: profile.avatar } : {}),
      ...(profile.handle !== undefined ? { handle: profile.handle } : {}),
      ...(profile.location !== undefined ? { location: profile.location } : {}),
      ...(profile.joinedAt !== undefined ? { joinedAt: profile.joinedAt } : {}),
      ...(profile.followers !== undefined ? { followers: profile.followers } : {}),
      ...(profile.following !== undefined ? { following: profile.following } : {}),
      ...(profile.role !== undefined ? { role: profile.role } : {}),
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_PREFIX + handle, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent('crowdpulse_profile_updated'));
  } catch (err) {
    console.warn('Failed to save profile to localStorage:', err);
  }
}

export function getHandleFromProfileRoute(): string | null {
  if (typeof window === 'undefined' || !window.location?.hash) return null;
  const m = window.location.hash.match(/profile-([^?&\/]+)/);
  return m ? decodeURIComponent(m[1]).replace(/^@/, '') : null;
}

export function getStoredProfile(handle: string): (StoredProfile & { name: string }) | null {
  const p = loadProfile(handle);
  if (!p) return null;
  return {
    ...p,
    name: p.name || '',
  };
}

export function saveStoredProfile(
  handle: string, 
  profile: { 
    name: string; 
    org: string; 
    bio: string;
    location?: string;
    joinedAt?: string;
    followers?: number;
    following?: number;
    role?: string;
  }
): void {
  saveProfile(handle, profile);
}

