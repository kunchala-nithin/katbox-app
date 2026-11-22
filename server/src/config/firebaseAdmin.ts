
import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";

import { getMessaging } from "firebase-admin/messaging";

let firebaseApp: App | null = null;

/**
 * ============================================================
 * INITIALIZE FIREBASE ADMIN
 * ============================================================
 *
 * Reads the Firebase Admin service-account JSON from:
 *
 * FIREBASE_SERVICE_ACCOUNT
 *
 * The credential must only exist on the backend.
 */
export const initializeFirebaseAdmin = (): App => {
  if (firebaseApp) {
    return firebaseApp;
  }

  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT environment variable is missing."
    );
  }

  let serviceAccount: any;

  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT contains invalid JSON."
    );
  }

  if (
    !serviceAccount.project_id ||
    !serviceAccount.private_key ||
    !serviceAccount.client_email
  ) {
    throw new Error(
      "Firebase service-account JSON is missing required fields."
    );
  }

  const existingApp = getApps().find(
    (app) => app.name === "[DEFAULT]"
  );

  if (existingApp) {
    firebaseApp = existingApp;
  } else {
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });
  }

  console.log(
    "Firebase Admin initialized successfully."
  );

  return firebaseApp;
};

/**
 * ============================================================
 * GET FIREBASE MESSAGING
 * ============================================================
 */
export const getFirebaseMessaging = () => {
  const app = firebaseApp || initializeFirebaseAdmin();

  return getMessaging(app);
};

export default initializeFirebaseAdmin;
