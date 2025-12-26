
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Firebase configuration using standard environment variables.
 */
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

/**
 * Audit object for diagnostics
 */
export const firebaseConfigStatus = {
  FIREBASE_API_KEY: !!process.env.FIREBASE_API_KEY,
  FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
  FIREBASE_AUTH_DOMAIN: !!process.env.FIREBASE_AUTH_DOMAIN,
  FIREBASE_STORAGE_BUCKET: !!process.env.FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: !!process.env.FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: !!process.env.FIREBASE_APP_ID
};

const isConfigured = !!firebaseConfig.projectId && 
                   !!firebaseConfig.apiKey && 
                   firebaseConfig.apiKey !== "dummy-key" &&
                   firebaseConfig.projectId !== "dummy-project";

const app = !getApps().length ? initializeApp(isConfigured ? firebaseConfig : {
  apiKey: "dummy-key",
  authDomain: "dummy.firebaseapp.com",
  projectId: "dummy-project"
}) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const isFirebaseReady = isConfigured;
export const firebaseProjectId = firebaseConfig.projectId;
