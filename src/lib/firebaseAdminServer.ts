import type { AuthRole } from "@/lib/authService";
import type { CreateUserAccountInput, UserAccount, UserAccountStatus } from "@/lib/userAccountTypes";

type AdminModules = {
  getApps: () => unknown[];
  initializeApp: (options: unknown, name?: string) => unknown;
  cert: (serviceAccount: unknown) => unknown;
  getApp: (name?: string) => unknown;
  getAuth: (app?: unknown) => {
    verifyIdToken: (token: string) => Promise<{ uid: string; email?: string }>;
    createUser: (input: { email: string; password: string; displayName: string; disabled?: boolean }) => Promise<{ uid: string; email?: string }>;
    updateUser: (uid: string, input: { disabled?: boolean }) => Promise<unknown>;
  };
  getFirestore: (app?: unknown) => {
    collection: (name: string) => unknown;
  };
};

type FirestoreAdmin = {
  collection: (name: string) => {
    doc: (id: string) => {
      get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      set: (data: Record<string, unknown>, options?: { merge: boolean }) => Promise<void>;
      update: (data: Record<string, unknown>) => Promise<void>;
    };
  };
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function adminEmails() {
  return (process.env.INITIAL_ADMIN_EMAILS || process.env.NEXT_PUBLIC_INITIAL_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
}

function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSONの形式を確認してください。");
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin SDKの環境変数が未設定です。");
  }
  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey)
  };
}

async function loadAdminModules(): Promise<AdminModules> {
  try {
    const importModule = Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
    const appModule = await importModule("firebase-admin/app") as {
      getApps: AdminModules["getApps"];
      initializeApp: AdminModules["initializeApp"];
      cert: AdminModules["cert"];
      getApp: AdminModules["getApp"];
    };
    const authModule = await importModule("firebase-admin/auth") as {
      getAuth: AdminModules["getAuth"];
    };
    const firestoreModule = await importModule("firebase-admin/firestore") as {
      getFirestore: AdminModules["getFirestore"];
    };
    return { ...appModule, ...authModule, ...firestoreModule };
  } catch (error) {
    console.error("[Firebase Admin] Failed to load firebase-admin.", error);
    throw new Error("Firebase Admin SDKを読み込めません。firebase-adminの依存関係を確認してください。");
  }
}

async function getAdminServices() {
  const admin = await loadAdminModules();
  const app = admin.getApps().length
    ? admin.getApp("[DEFAULT]")
    : admin.initializeApp({ credential: admin.cert(serviceAccountFromEnv()) });
  return {
    auth: admin.getAuth(app),
    db: admin.getFirestore(app) as FirestoreAdmin
  };
}

function roleFromValue(value: unknown): AuthRole {
  return value === "admin" || value === "office" || value === "driver" ? value : "driver";
}

function validateCreateInput(input: CreateUserAccountInput) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;
  const confirmPassword = input.confirmPassword;
  if (!name) throw new Error("氏名を入力してください。");
  if (!email) throw new Error("LINE WORKSメールアドレスを入力してください。");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("メールアドレスの形式を確認してください。");
  if (password.length < 6) throw new Error("初期パスワードは6文字以上で入力してください。");
  if (password !== confirmPassword) throw new Error("初期パスワードと確認用パスワードが一致しません。");
  return {
    name,
    email,
    password,
    role: roleFromValue(input.role),
    department: input.department?.trim() || "",
    branchId: input.branchId?.trim() || "",
    notes: input.notes?.trim() || ""
  };
}

export async function requireAdminUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) throw new Error("ログイン状態を確認できません。");
  const { auth, db } = await getAdminServices();
  const decoded = await auth.verifyIdToken(token);
  const email = normalizeEmail(decoded.email || "");
  if (email && adminEmails().includes(email)) return { decoded, auth, db };

  const userDoc = await db.collection("users").doc(decoded.uid).get();
  const data = userDoc.data();
  if (userDoc.exists && data?.role === "admin" && data.status !== "inactive") {
    return { decoded, auth, db };
  }
  throw new Error("この操作を行う権限がありません。");
}

export async function createEmployeeAccount(request: Request, input: CreateUserAccountInput): Promise<UserAccount> {
  const { auth, db } = await requireAdminUser(request);
  const normalized = validateCreateInput(input);
  try {
    const firebaseUser = await auth.createUser({
      email: normalized.email,
      password: normalized.password,
      displayName: normalized.name,
      disabled: false
    });
    const now = new Date().toISOString();
    const user: UserAccount = {
      uid: firebaseUser.uid,
      name: normalized.name,
      email: normalized.email,
      department: normalized.department,
      branchId: normalized.branchId,
      role: normalized.role,
      status: "active",
      notes: normalized.notes,
      createdAt: now,
      updatedAt: now
    };
    await db.collection("users").doc(firebaseUser.uid).set(user, { merge: true });
    return user;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code === "auth/email-already-exists") {
      throw new Error("このメールアドレスはすでに登録されています。");
    }
    console.error("[Firebase Admin] Create employee failed.", error);
    throw error instanceof Error ? error : new Error("社員アカウントの登録に失敗しました。");
  }
}

export async function setEmployeeAccountStatus(request: Request, uid: string, status: UserAccountStatus): Promise<UserAccount> {
  const { auth, db } = await requireAdminUser(request);
  if (!uid) throw new Error("対象社員を確認できません。");
  if (status !== "active" && status !== "inactive") throw new Error("アカウント状態を確認できません。");
  await auth.updateUser(uid, { disabled: status === "inactive" });
  const now = new Date().toISOString();
  await db.collection("users").doc(uid).update({ status, updatedAt: now });
  const updated = await db.collection("users").doc(uid).get();
  const data = updated.data() || {};
  return {
    uid,
    name: String(data.name || ""),
    email: String(data.email || ""),
    department: String(data.department || ""),
    branchId: String(data.branchId || ""),
    role: roleFromValue(data.role),
    status,
    notes: String(data.notes || ""),
    createdAt: String(data.createdAt || now),
    updatedAt: String(data.updatedAt || now)
  };
}
