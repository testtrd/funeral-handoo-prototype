import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User
} from "firebase/auth";
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

function rawFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: normalizeFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: normalizeFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: normalizeFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: normalizeFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: normalizeFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: normalizeFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    measurementId: normalizeFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID)
  };
}

function firebaseConfig(): FirebaseOptions | null {
  const config = rawFirebaseConfig();
  return config.apiKey && config.authDomain && config.projectId && config.appId ? config : null;
}

export function getFirebaseDebugInfo() {
  const config: FirebaseOptions = {
    ...rawFirebaseConfig()
  };
  const missing = [
    !config.apiKey ? "NEXT_PUBLIC_FIREBASE_API_KEY" : "",
    !config.authDomain ? "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" : "",
    !config.projectId ? "NEXT_PUBLIC_FIREBASE_PROJECT_ID" : "",
    !config.appId ? "NEXT_PUBLIC_FIREBASE_APP_ID" : ""
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    missing,
    projectId: config.projectId || "",
    authDomain: config.authDomain || "",
    currentHost: typeof window !== "undefined" ? window.location.host : "",
    appIdPresent: Boolean(config.appId),
    apiKeyPresent: Boolean(config.apiKey),
    messagingSenderIdPresent: Boolean(config.messagingSenderId),
    storageBucketPresent: Boolean(config.storageBucket)
  };
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

export async function signInWithEmailPassword(email: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase設定が未登録です。");
  return signInWithEmailAndPassword(auth, email, password);
}

export async function sendFirebasePasswordReset(email: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase設定が未登録です。");
  return sendPasswordResetEmail(auth, email);
}

export async function signOutFirebase() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export async function getFirebaseCurrentUserIdToken() {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) return "";
  return auth.currentUser.getIdToken();
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
    const firebaseError = error as { code?: string; message?: string };
    const message = firebaseError.code && firebaseError.message
      ? `${firebaseError.code}: ${firebaseError.message}`
      : firebaseError.message || "Firebase Authenticationの匿名ログインに失敗しました。";
    console.warn(
      "[Firebase Auth] Anonymous sign-in failed. If Firestore rules require authentication, cloud sync will fail.",
      {
        code: firebaseError.code,
        message: firebaseError.message,
        debug: getFirebaseDebugInfo(),
        error
      }
    );
    throw new Error(message);
  }
}

export function getFirebaseDb() {
  return getFirebaseServices()?.db || null;
}
