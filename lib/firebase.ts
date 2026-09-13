import { getApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Safe standard client-side Firebase initialization
const shouldInitializeApp = getApps().length === 0;
const app = shouldInitializeApp ? initializeApp(firebaseConfig) : getApp();
const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";

// Keep Firestore writes available offline and synchronize them when connectivity returns.
let db: Firestore;
try {
  const isClient = typeof window !== 'undefined';
  db = shouldInitializeApp
    ? initializeFirestore(
        app,
        isClient ? { localCache: persistentLocalCache() } : {},
        databaseId
      )
    : getFirestore(app, databaseId);
} catch (e) {
  console.warn("Could not initialize persistentLocalCache, falling back to standard Firestore:", e);
  db = getFirestore(app, databaseId);
}
const auth = getAuth(app);

export { app, db, auth };
