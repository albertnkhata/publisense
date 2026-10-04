import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  getDocFromServer,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { FeedbackItem, Company, Product } from '../types';
import { INITIAL_FEEDBACK, INITIAL_PRODUCTS } from '../data/mockData';
import { INITIAL_COMPANIES } from '../data/companyData';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific Database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test initial connection as required by skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Initial database seeding if empty
export async function bootstrapFirestoreData() {
  try {
    // 1. Check feedback
    const feedbackSnap = await getDocs(collection(db, 'feedback'));
    if (feedbackSnap.empty) {
      console.log('Seeding initial feedback to Firestore...');
      for (const item of INITIAL_FEEDBACK) {
        await setDoc(doc(db, 'feedback', item.id), item);
      }
    }

    // 2. Check companies
    const companiesSnap = await getDocs(collection(db, 'companies'));
    if (companiesSnap.empty) {
      console.log('Seeding initial companies to Firestore...');
      for (const comp of INITIAL_COMPANIES) {
        await setDoc(doc(db, 'companies', comp.id), comp);
      }
    }

    // 3. Check products
    const productsSnap = await getDocs(collection(db, 'products'));
    if (productsSnap.empty) {
      console.log('Seeding initial products to Firestore...');
      for (const prod of INITIAL_PRODUCTS) {
        await setDoc(doc(db, 'products', prod.id), prod);
      }
    }
  } catch (err) {
    console.warn('Firestore bootstrap notice (continuing):', err);
  }
}

// Notification Interface
export interface RealtimeNotification {
  id: string;
  userId: string;
  actorName: string;
  actorAvatar: string;
  title: string;
  message: string;
  type: 'status_shipped' | 'status_progress' | 'reply' | 'claim';
  targetFeedbackId?: string;
  targetProductId?: string;
  isRead: boolean;
  createdAt: string;
}

// Real-time Listeners
export function subscribeToFeedback(onUpdate: (items: FeedbackItem[]) => void) {
  const path = 'feedback';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (!snapshot.empty) {
        const items = snapshot.docs.map((docSnap) => docSnap.data() as FeedbackItem);
        onUpdate(items);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeToCompanies(onUpdate: (items: Company[]) => void) {
  const path = 'companies';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (!snapshot.empty) {
        const items = snapshot.docs.map((docSnap) => docSnap.data() as Company);
        onUpdate(items);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeToProducts(onUpdate: (items: Product[]) => void) {
  const path = 'products';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (!snapshot.empty) {
        const items = snapshot.docs.map((docSnap) => docSnap.data() as Product);
        onUpdate(items);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeToNotifications(userId: string, onUpdate: (items: RealtimeNotification[]) => void) {
  const path = 'notifications';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const allNotifs = snapshot.docs.map((docSnap) => docSnap.data() as RealtimeNotification);
      // Filter for this user or broadcast notifications
      const userNotifs = allNotifs
        .filter((n) => !n.userId || n.userId === userId || n.userId === 'all')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(userNotifs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

// Database Mutation APIs
export async function syncFeedbackDoc(item: FeedbackItem) {
  const path = 'feedback';
  try {
    await setDoc(doc(db, path, item.id), item);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${item.id}`);
  }
}

export async function syncCompanyDoc(company: Company) {
  const path = 'companies';
  try {
    await setDoc(doc(db, path, company.id), company);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${company.id}`);
  }
}

export async function syncProductDoc(product: Product) {
  const path = 'products';
  try {
    await setDoc(doc(db, path, product.id), product);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${product.id}`);
  }
}

export async function dispatchRealtimeNotification(notification: RealtimeNotification) {
  const path = 'notifications';
  try {
    await setDoc(doc(db, path, notification.id), notification);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${notification.id}`);
  }
}
