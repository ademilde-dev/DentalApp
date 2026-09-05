import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Safe standard client-side Firebase initialization
const shouldInitializeApp = getApps().length === 0;
const app = shouldInitializeApp ? initializeApp(firebaseConfig) : getApp();

// Keep Firestore writes available offline and synchronize them when connectivity returns.
const db = shouldInitializeApp
  ? initializeFirestore(app, { localCache: persistentLocalCache() })
  : getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
