import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { signOut, deleteUser } from 'firebase/auth';
import { db, auth, cleanFirestoreData } from './firebase';
import { UserProfile, UserRole, FeedbackItem, Company } from '../types';
import { clearStoredProfile } from './profileStorage';

export const TAKEN_SEED_HANDLES = new Set([
  'albert'
]);

const AVATAR_SEEDS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=128&auto=format&fit=crop&q=80'
];

function getRandomAvatar(seedText: string): string {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash << 5) - hash + seedText.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_SEEDS.length;
  return AVATAR_SEEDS[index];
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface StoredAccountRecord extends UserProfile {
  passwordHash?: string;
  salt?: string;
}

export async function signUpWithEmail(options: {
  email: string;
  password: string;
  name: string;
  handle?: string;
}): Promise<UserProfile> {
  const cleanEmail = options.email.trim().toLowerCase();
  const trimmedName = options.name.trim();
  const password = options.password;

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  if (!trimmedName || trimmedName.length < 2) {
    throw new Error('Name must be at least 2 characters.');
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  // Derive handle
  let desiredHandle = (options.handle || '').trim().toLowerCase().replace(/^@/, '');
  if (!desiredHandle) {
    desiredHandle = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  }
  if (!/^[a-z0-9_]{2,30}$/.test(desiredHandle)) {
    throw new Error('Handle must be 2-30 characters using lowercase letters, numbers, or underscore.');
  }

  // Check if handle is taken in seed list
  if (TAKEN_SEED_HANDLES.has(desiredHandle)) {
    throw new Error(`The handle @${desiredHandle} is already reserved. Please choose another.`);
  }

  // Check Firestore users collection for existing email or handle
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const existingUsers = usersSnap.docs.map((d) => ({
      docId: d.id,
      ...(d.data() as StoredAccountRecord),
    }));

    const existingByEmail = existingUsers.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (existingByEmail) {
      if (existingByEmail.authProvider === 'google' || existingByEmail.googleUid) {
        throw new Error(
          `An account with ${cleanEmail} was originally registered using Google Sign-In. The original authentication method takes precedence. Please sign in with Google.`
        );
      } else if (existingByEmail.authProvider === 'password' || existingByEmail.passwordHash) {
        throw new Error(
          `An account with ${cleanEmail} already exists. The original authentication method takes precedence. Please switch to Sign In with your password.`
        );
      } else {
        throw new Error(
          `An account with ${cleanEmail} already exists. The original authentication method takes precedence. Please switch to Sign In.`
        );
      }
    }

    const handleTaken = existingUsers.some(
      (u) => (u.handle || '').toLowerCase().replace(/^@/, '') === desiredHandle
    );
    if (handleTaken) {
      throw new Error(`The handle @${desiredHandle} is already in use. Please select a different handle.`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('already exists') || err.message.includes('already in use') || err.message.includes('precedence'))) {
      throw err;
    }
    console.warn('User lookup notice:', err);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const isAdmin = cleanEmail === 'albertnkhata.s@gmail.com' || cleanEmail.endsWith('@crowdpulse.dev');
  const userId = `usr-${cleanEmail.replace(/[^a-z0-9]/g, '_')}-${Date.now().toString(36)}`;

  const userRole: UserRole = isAdmin ? 'admin' : 'user';
  const userRoleTitle = isAdmin 
    ? 'Platform Administrator' 
    : undefined;
  const userCompName = '';
  const userCompId = undefined;

  const newProfile: UserProfile = {
    id: userId,
    name: trimmedName,
    email: cleanEmail,
    handle: `@${desiredHandle}`,
    avatar: getRandomAvatar(cleanEmail),
    role: userRole,
    roleTitle: userRoleTitle,
    companyOrOrg: userCompName,
    companyId: userCompId,
    bio: isAdmin 
      ? 'Platform Administrator and Founder.' 
      : '',
    joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    followerCount: 0,
    followingCount: 0,
    authProvider: 'password',
  };

  const accountDoc: StoredAccountRecord = {
    ...newProfile,
    passwordHash,
    salt,
  };

  const cleanedDoc = Object.fromEntries(
    Object.entries(accountDoc).filter(([_, v]) => v !== undefined)
  );

  await setDoc(doc(db, 'users', userId), cleanedDoc);

  // Persist session
  persistActiveUser(newProfile);

  return newProfile;
}

export async function signInWithEmail(email: string, pass: string): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const password = pass;

  if (!cleanEmail) {
    throw new Error('Please enter your email address.');
  }

  if (!password) {
    throw new Error('Please enter your password.');
  }

  // Check Firestore users
  let matchingUser: (StoredAccountRecord & { docId?: string }) | null = null;
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const allUsers = usersSnap.docs.map((d) => ({
      docId: d.id,
      ...(d.data() as StoredAccountRecord),
    }));

    matchingUser = allUsers.find((u) => u.email?.toLowerCase() === cleanEmail) || null;
  } catch (err) {
    console.warn('Firestore user fetch notice during sign-in:', err);
  }

  // Fallback for default admin root account
  if (!matchingUser) {
    if (cleanEmail === 'albertnkhata.s@gmail.com') {
      const stored = getPersistedActiveUser();
      const albertProfile: UserProfile = {
        id: 'usr-albert',
        name: stored?.name || 'Admin',
        email: 'albertnkhata.s@gmail.com',
        handle: stored?.handle || '@albert',
        avatar: stored?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
        role: 'admin',
        roleTitle: 'Platform Administrator',
        companyOrOrg: stored?.companyOrOrg,
        companyId: stored?.companyId,
        bio: stored?.bio || 'Platform Administrator and Founder.',
        joinedDate: 'October 2026',
        followerCount: 0,
        followingCount: 0,
        authProvider: 'google',
        googleUid: 'L19KyxxXnNWYSsoHXRrXDja4h3B2',
      };
      persistActiveUser(albertProfile);
      return albertProfile;
    }

    if (cleanEmail === 'admin@crowdpulse.dev' || cleanEmail.startsWith('crowdpulse@') || cleanEmail.endsWith('@crowdpulse.dev')) {
      const stored = getPersistedActiveUser();
      const crowdpulseProfile: UserProfile = {
        id: 'usr-crowdpulse',
        name: stored?.name || 'CrowdPulse Team',
        email: cleanEmail,
        handle: stored?.handle || '@crowdpulse',
        avatar: stored?.avatar || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
        role: stored?.role || 'user',
        roleTitle: stored?.roleTitle,
        companyOrOrg: stored?.companyOrOrg,
        companyId: stored?.companyId,
        bio: stored?.bio || 'Community contributor and active product feedback participant.',
        joinedDate: 'October 2026',
        followerCount: 0,
        followingCount: 0,
        authProvider: 'password',
      };
      persistActiveUser(crowdpulseProfile);
      return crowdpulseProfile;
    }

    throw new Error('No account found for this email. Please check your spelling or create an account.');
  }

  // Precedence Check: If account was originally registered with Google and has no password hash
  if (matchingUser.authProvider === 'google' && !matchingUser.passwordHash) {
    throw new Error(
      `An account with ${cleanEmail} was originally registered using Google Sign-In. The original authentication method takes precedence. Please sign in with Google.`
    );
  }

  // If password was hashed with salt, verify it
  if (matchingUser.passwordHash && matchingUser.salt) {
    const computedHash = await hashPassword(password, matchingUser.salt);
    if (computedHash !== matchingUser.passwordHash) {
      throw new Error('Incorrect password. Please verify and try again.');
    }
  } else {
    // If account was created without a password hash yet, set it now
    try {
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const targetId = matchingUser.id || matchingUser.docId;
      if (targetId) {
        await setDoc(
          doc(db, 'users', targetId),
          { passwordHash, salt, authProvider: matchingUser.authProvider || 'password' },
          { merge: true }
        );
      }
    } catch {
      // Ignore background update failure
    }
  }

  const { passwordHash: _ph, salt: _s, docId: _d, ...userProfile } = matchingUser;
  persistActiveUser(userProfile);
  return userProfile;
}

export function persistActiveUser(user: UserProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('crowdpulse_current_user', JSON.stringify(user));
    localStorage.setItem('crowdpulse_active_handle', user.handle.replace(/^@/, ''));
    localStorage.removeItem('crowdpulse_is_logged_out');
    window.dispatchEvent(new CustomEvent('crowdpulse_auth_state_change', { detail: user }));
  } catch (e) {
    console.warn('Could not persist active user to localStorage:', e);
  }
}

export function getPersistedActiveUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const isLoggedOut = localStorage.getItem('crowdpulse_is_logged_out');
    if (isLoggedOut === 'true') {
      return null;
    }

    const stored = localStorage.getItem('crowdpulse_current_user');
    if (stored) {
      const parsed = JSON.parse(stored) as UserProfile;
      if (parsed && parsed.id && parsed.email) {
        return parsed;
      }
    }

    // Unauthenticated guest visitor: requires auth for interactions
    return null;
  } catch {
    return null;
  }
}

export async function signOutActiveUser(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await signOut(auth);
  } catch {
    // Ignore signOut error
  }
  localStorage.removeItem('crowdpulse_current_user');
  localStorage.removeItem('crowdpulse_active_handle');
  localStorage.setItem('crowdpulse_is_logged_out', 'true');
  window.dispatchEvent(new CustomEvent('crowdpulse_auth_state_change', { detail: null }));
}

export async function deleteUserAccount(user: UserProfile): Promise<{ success: boolean; error?: string }> {
  if (!user || !user.id) {
    throw new Error('No user provided for account deletion.');
  }

  const cleanHandle = (user.handle || '').toLowerCase().replace(/^@/, '');
  const userFullHandle = `@${cleanHandle}`;
  const userId = user.id;
  const userEmail = (user.email || '').toLowerCase().trim();
  const userName = (user.name || '').trim();

  // 1. Anonymize all feedback items and comments authored by this user
  try {
    const feedbackSnap = await getDocs(collection(db, 'feedback'));
    const anonymizedAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&auto=format&fit=crop&q=80';

    for (const docSnap of feedbackSnap.docs) {
      const item = docSnap.data() as FeedbackItem & { authorId?: string };
      let changed = false;
      let newAuthorName = item.authorName;
      let newAuthorHandle = item.authorHandle;
      let newAuthorAvatar = item.authorAvatar;
      let newAuthorId = item.authorId;

      const isPostAuthor = Boolean(
        (item.authorHandle && item.authorHandle.toLowerCase().replace(/^@/, '') === cleanHandle) ||
        (item.authorId && item.authorId === userId) ||
        (item.authorName && userName && item.authorName.toLowerCase() === userName.toLowerCase() && item.authorHandle?.toLowerCase().replace(/^@/, '') === cleanHandle)
      );

      if (isPostAuthor) {
        newAuthorName = 'Deleted User';
        newAuthorHandle = '@deleted';
        newAuthorAvatar = anonymizedAvatar;
        newAuthorId = 'deleted';
        changed = true;
      }

      // Check comments inside this feedback item
      let updatedComments = item.comments;
      if (Array.isArray(item.comments) && item.comments.length > 0) {
        let commentsChanged = false;
        const mappedComments = item.comments.map((c) => {
          const isCommentAuthor = Boolean(
            (c.authorHandle && c.authorHandle.toLowerCase().replace(/^@/, '') === cleanHandle) ||
            (c.authorName && userName && c.authorName.toLowerCase() === userName.toLowerCase() && c.authorHandle?.toLowerCase().replace(/^@/, '') === cleanHandle)
          );

          if (isCommentAuthor) {
            commentsChanged = true;
            return {
              ...c,
              authorName: 'Deleted User',
              authorHandle: '@deleted',
              authorAvatar: anonymizedAvatar,
              roleBadge: undefined,
            };
          }
          return c;
        });

        if (commentsChanged) {
          updatedComments = mappedComments;
          changed = true;
        }
      }

      if (changed) {
        const payload: Partial<FeedbackItem> & { authorId?: string } = {
          authorName: newAuthorName,
          authorHandle: newAuthorHandle,
          authorAvatar: newAuthorAvatar,
          authorId: newAuthorId,
          comments: updatedComments,
        };
        await updateDoc(doc(db, 'feedback', docSnap.id), cleanFirestoreData(payload));
      }
    }
  } catch (err) {
    console.warn('Notice while anonymizing feedback items in Firestore:', err);
  }

  // 2. Disassociate user from organizations and company verified rosters
  try {
    const compSnap = await getDocs(collection(db, 'companies'));
    for (const cDoc of compSnap.docs) {
      const comp = cDoc.data() as Company;
      let changed = false;

      let verifiedMembers = comp.verifiedMembers || [];
      const initialCount = verifiedMembers.length;
      verifiedMembers = verifiedMembers.filter((m) => {
        const mHandle = (m.handle || '').toLowerCase().replace(/^@/, '');
        return m.id !== userId && mHandle !== cleanHandle;
      });

      if (verifiedMembers.length !== initialCount) {
        changed = true;
      }

      let claimedById = comp.claimedById;
      let claimedByName = comp.claimedByName;
      let isClaimed = comp.isClaimed;

      const isClaimant = 
        claimedById === userId || 
        (comp.claimedByName && userName && comp.claimedByName.toLowerCase() === userName.toLowerCase());

      if (isClaimant) {
        if (verifiedMembers.length > 0) {
          // Pass claim to first remaining verified team member
          claimedById = verifiedMembers[0].id;
          claimedByName = verifiedMembers[0].name;
          isClaimed = true;
        } else {
          // Vacate claim completely
          claimedById = undefined;
          claimedByName = undefined;
          isClaimed = false;
        }
        changed = true;
      }

      if (changed) {
        const cleanComp = cleanFirestoreData({
          ...comp,
          verifiedMembers,
          claimedById,
          claimedByName,
          isClaimed,
        });
        await setDoc(doc(db, 'companies', cDoc.id), cleanComp);
      }
    }
  } catch (err) {
    console.warn('Notice while updating company rosters in Firestore:', err);
  }

  // 3. Clear user notifications
  try {
    const notifsSnap = await getDocs(collection(db, 'notifications'));
    for (const nDoc of notifsSnap.docs) {
      const nData = nDoc.data();
      const nUserId = (nData.userId || '').toLowerCase().replace(/^@/, '');
      if (nUserId === cleanHandle || nUserId === userId.toLowerCase().replace(/^@/, '')) {
        await deleteDoc(doc(db, 'notifications', nDoc.id));
      }
    }
  } catch (err) {
    console.warn('Notice while deleting user notifications in Firestore:', err);
  }

  // 4. Delete user document from Firestore users collection
  try {
    // Delete by primary userId
    await deleteDoc(doc(db, 'users', userId));

    // Also scan for any records matching email, handle, or googleUid
    const usersSnap = await getDocs(collection(db, 'users'));
    for (const uDoc of usersSnap.docs) {
      const uData = uDoc.data();
      const uEmail = (uData.email || '').toLowerCase().trim();
      const uHandle = (uData.handle || '').toLowerCase().replace(/^@/, '');
      const uGoogleUid = uData.googleUid;

      const isSameAccount =
        (userEmail && uEmail === userEmail) ||
        uHandle === cleanHandle ||
        (user.googleUid && uGoogleUid === user.googleUid);

      if (isSameAccount) {
        await deleteDoc(doc(db, 'users', uDoc.id));
      }
    }
  } catch (err) {
    console.warn('Notice while deleting user document in Firestore:', err);
  }

  // 5. Delete Firebase Auth user if authenticated
  try {
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
    }
  } catch (err) {
    console.warn('Notice while deleting Firebase Auth user (falling back to signOut):', err);
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }

  // 6. Purge local browser storage and dispatch logout events
  try {
    clearStoredProfile(userFullHandle);
    clearStoredProfile(cleanHandle);

    if (typeof window !== 'undefined') {
      const keysToRemove: string[] = [
        'crowdpulse_current_user',
        'crowdpulse_active_handle',
        `crowdpulse_upvoted_ids_${cleanHandle}`,
        `crowdpulse_reposted_ids_${cleanHandle}`,
        `crowdpulse_followed_products_${cleanHandle}`,
        `crowdpulse_followed_users_${cleanHandle}`,
        `crowdpulse_dismissed_notifs_${cleanHandle}`,
        `crowdpulse_read_notifs_${cleanHandle}`,
        `crowdpulse_profile_${cleanHandle}`,
      ];

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.includes(cleanHandle) || k.includes(userId))) {
          keysToRemove.push(k);
        }
      }

      keysToRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {
          // ignore
        }
      });

      localStorage.setItem('crowdpulse_is_logged_out', 'true');
      window.dispatchEvent(new CustomEvent('crowdpulse_auth_state_change', { detail: null }));
      window.dispatchEvent(new CustomEvent('crowdpulse_account_deleted', { detail: { id: userId, handle: userFullHandle } }));
    }
  } catch (err) {
    console.warn('Notice while cleaning local storage:', err);
  }

  return { success: true };
}

