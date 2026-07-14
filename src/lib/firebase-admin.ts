import "server-only";

import { createRequire } from "module";

type DecodedAdminToken = {
  uid: string;
  email?: string;
  role?: string;
  status?: string;
  admin?: boolean;
};

type AdminAuth = {
  verifyIdToken: (token: string) => Promise<DecodedAdminToken>;
  createUser: (input: { email: string; password: string; displayName: string; disabled?: boolean }) => Promise<{ uid: string; email?: string }>;
  updateUser: (uid: string, input: { disabled?: boolean }) => Promise<unknown>;
  setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
};

type AdminDb = {
  collection: (name: string) => {
    doc: (id: string) => {
      get: () => Promise<{ id: string; exists: boolean; data: () => Record<string, unknown> | undefined }>;
      set: (data: Record<string, unknown>, options?: { merge: boolean }) => Promise<void>;
      update: (data: Record<string, unknown>) => Promise<void>;
    };
    orderBy: (field: string, direction?: "asc" | "desc") => {
      get: () => Promise<{ docs: Array<{ id: string; exists: boolean; data: () => Record<string, unknown> | undefined }> }>;
    };
    get: () => Promise<{ docs: Array<{ id: string; exists: boolean; data: () => Record<string, unknown> | undefined }> }>;
  };
};

type FirebaseAdminAppModule = {
  cert: (serviceAccount: { projectId: string; clientEmail: string; privateKey: string }) => unknown;
  getApps: () => unknown[];
  initializeApp: (options: { credential: unknown }) => unknown;
};

type FirebaseAdminAuthModule = {
  getAuth: (app: unknown) => AdminAuth;
};

type FirebaseAdminFirestoreModule = {
  getFirestore: (app: unknown) => AdminDb;
};

let cachedAdmin: { auth: AdminAuth; db: AdminDb } | null = null;

function adminEnv() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  console.log("[Firebase Admin] env presence", {
    projectId: Boolean(projectId),
    clientEmail: Boolean(clientEmail),
    privateKey: Boolean(privateKey)
  });

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin SDKの環境変数が未設定です。");
  }

  return { projectId, clientEmail, privateKey };
}

function requireAdminModule<T>(specifier: string): T {
  const serverRequire = createRequire(import.meta.url);
  const requireModule = Function("serverRequire", "specifier", "return serverRequire(specifier)") as <TResult>(
    serverRequire: NodeRequire,
    specifier: string
  ) => TResult;
  return requireModule<T>(serverRequire, specifier);
}

export function getFirebaseAdmin() {
  if (cachedAdmin) return cachedAdmin;

  const { projectId, clientEmail, privateKey } = adminEnv();
  const adminPackage = "firebase" + "-admin";
  const { cert, getApps, initializeApp } = requireAdminModule<FirebaseAdminAppModule>(`${adminPackage}/app`);
  const { getAuth } = requireAdminModule<FirebaseAdminAuthModule>(`${adminPackage}/auth`);
  const { getFirestore } = requireAdminModule<FirebaseAdminFirestoreModule>(`${adminPackage}/firestore`);

  const adminApp =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey
          })
        });

  cachedAdmin = {
    auth: getAuth(adminApp),
    db: getFirestore(adminApp)
  };
  return cachedAdmin;
}
