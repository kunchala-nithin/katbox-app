
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";

import { getMessaging } from "firebase-admin/messaging";

let firebaseApp: App | null = null;

const getFirebaseApp = (): App => {
  if (firebaseApp) return firebaseApp;

  const existing = getApps();

  if (existing.length > 0) {
    firebaseApp = getApp();
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    );
  }

  const privateKey = rawPrivateKey.replace(/\\n/g, "\n").trim();

  firebaseApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });

  return firebaseApp;
};

// Default initialization function used by server/src/index.ts
const initializeFirebaseAdmin = (): App => {
  return getFirebaseApp();
};

// Named export used by FCM notification utilities
export const getFirebaseMessaging = () => {
  return getMessaging(getFirebaseApp());
};

// Named export used to check Firebase Admin configuration
export const isFirebaseAdminConfigured = (): boolean =>
  Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );

export default initializeFirebaseAdmin;
