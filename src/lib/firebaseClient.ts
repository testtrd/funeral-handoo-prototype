import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, signInAnonymously, type Auth, type User } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from "firebase/firestore";

let cachedServices: {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
} | null = null;

function normalizeFirebaseEnvValue(value: string | undefined) {
  if (!value) return undefined;
  return value
    .trim()
    .replace(/,$/, "")
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
}

function firebaseEnv(nextPublicName: string, viteName: string) {
  return normalizeFirebaseEnvValue(process.env[nextPublicName] || process.env[viteName]);
}

function firebaseConfig(): FirebaseOptions | null {
  const config: FirebaseOptions = {
    apiKey: firebaseEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"),
    authDomain: firebaseEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: firebaseEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"),
    storageBucket: firebaseEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: firebaseEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: firebaseEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"),
    measurementId: firebaseEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", "VITE_FIREBASE_MEASUREMENT_ID")
  };

  return config.apiKey && config.authDomain && config.projectId && config.appId ? config : null;
}

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig());
}

export function getFirebaseServices() {
  if (cachedServices) return cachedServices;
  const config = firebaseConfig();
  if (!config) return null;

  const app = getApps().length ? getApp() : initializeApp(config);
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch {
    db = getFirestore(app);
  }

  cachedServices = {
    app,
    auth: getAuth(app),
    db
  };
  return cachedServices;
}

export function getFirebaseAuth() {
  return getFirebaseServices()?.auth || null;
}

export async function ensureFirebaseAuthSession(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;

  try {
    const credential = await signInAnonymously(auth);
    console.info("[Firebase Auth] Anonymous sign-in succeeded.", { uid: credential.user.uid });
    return credential.user;
  } catch (error) {
    console.warn(
      "[Firebase Auth] Anonymous sign-in failed. If Firestore rules require authentication, cloud sync will fail.",
      error
    );
    return null;
  }
}

export function getFirebaseDb() {
  return getFirebaseServices()?.db || null;
}
