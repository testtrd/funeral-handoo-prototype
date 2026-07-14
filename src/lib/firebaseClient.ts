import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
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

function publicEnv(primary: string | undefined, viteAlias: string | undefined) {
  return normalizeFirebaseEnvValue(primary || viteAlias);
}

function rawFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: publicEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, process.env.VITE_FIREBASE_API_KEY),
    authDomain: publicEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, process.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: publicEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, process.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: publicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      process.env.VITE_FIREBASE_STORAGE_BUCKET
    ),
    messagingSenderId: publicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID
    ),
    appId: publicEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, process.env.VITE_FIREBASE_APP_ID),
    measurementId: publicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
      process.env.VITE_FIREBASE_MEASUREMENT_ID
    )
  };
}

function firebaseConfig(): FirebaseOptions | null {
  const config = rawFirebaseConfig();
  return config.apiKey && config.authDomain && config.projectId && config.appId ? config : null;
}

async function waitForAuthReady(auth: Auth) {
  const authWithReady = auth as Auth & { authStateReady?: () => Promise<void> };
  if (authWithReady.authStateReady) {
    await authWithReady.authStateReady();
    return;
  }

  if (auth.currentUser) return;

  await new Promise<void>((resolve) => {
    let unsubscribe: () => void = () => undefined;
    const timer = window.setTimeout(() => {
      unsubscribe();
      resolve();
    }, 3000);
    unsubscribe = onAuthStateChanged(auth, () => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

export function getFirebaseDebugInfo() {
  const config: FirebaseOptions = {
    ...rawFirebaseConfig()
  };
  const missing = [
    !config.apiKey ? "NEXT_PUBLIC_FIREBASE_API_KEY or VITE_FIREBASE_API_KEY" : "",
    !config.authDomain ? "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN or VITE_FIREBASE_AUTH_DOMAIN" : "",
    !config.projectId ? "NEXT_PUBLIC_FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID" : "",
    !config.appId ? "NEXT_PUBLIC_FIREBASE_APP_ID or VITE_FIREBASE_APP_ID" : ""
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

  if (auth.currentUser?.isAnonymous) {
    await signOut(auth);
  }

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
  if (!auth) return "";
  await waitForAuthReady(auth);

  const user = auth.currentUser;
  if (!user) {
    console.warn("[Firebase Auth] Current user is not available when requesting ID token.", getFirebaseDebugInfo());
    return "";
  }

  console.info("[Firebase Auth] Current user before protected API call.", {
    uidSuffix: user.uid.slice(-6),
    email: user.email || "",
    isAnonymous: user.isAnonymous
  });

  if (user.isAnonymous || !user.email) {
    await signOut(auth).catch(() => undefined);
    throw new Error("メールログイン状態を確認できません。もう一度ログインしてください。");
  }

  return user.getIdToken(true);
}

export async function ensureFirebaseAuthSession(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  await waitForAuthReady(auth);

  const user = auth.currentUser;
  if (!user) {
    throw new Error("クラウド同期にはメールログインが必要です。");
  }

  if (user.isAnonymous || !user.email) {
    console.warn("[Firebase Auth] Anonymous or email-less user detected. Signing out.", {
      uidSuffix: user.uid.slice(-6),
      isAnonymous: user.isAnonymous,
      emailPresent: Boolean(user.email)
    });
    await signOut(auth).catch(() => undefined);
    throw new Error("匿名ログインでは同期できません。メールアドレスでログインしてください。");
  }

  return user;
}

export function getFirebaseDb() {
  return getFirebaseServices()?.db || null;
}
