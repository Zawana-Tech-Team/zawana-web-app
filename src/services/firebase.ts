import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

export const firebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId
);
export const firebaseAuth: Auth | null = firebaseConfigured
  ? getAuth(getApps().length ? getApp() : initializeApp(config))
  : null;
export const googleProvider = new GoogleAuthProvider();
export const firebaseReady = firebaseAuth
  ? setPersistence(firebaseAuth, browserLocalPersistence)
  : Promise.resolve();
