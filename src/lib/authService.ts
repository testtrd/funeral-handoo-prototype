import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
  sendFirebasePasswordReset,
  signInWithEmailPassword,
  signOutFirebase
} from "@/lib/firebaseClient";
import { safeJsonParse } from "@/lib/safeJson";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type AuthRole = "admin" | "driver" | "office";

export type AuthUser = {
  userId: string;
  name: string;
  role: AuthRole;
  branchId?: string;
  email?: string;
};

export type AuthSession = AuthUser & {
  loggedInAt: string;
};

const authSessionKey = "funeral-handoff-auth-session-v1";

const prototypeUsers: Array<AuthUser & { password: string }> = [
  { userId: "admin", name: "管理者", password: "admin-pass", role: "admin" },
  { userId: "driver01", name: "ドライバー01", password: "driver-pass", role: "driver", branchId: "head_office" },
  { userId: "office01", name: "事務所担当01", password: "office-pass", role: "office", branchId: "head_office" }
];

export function getPrototypeUsers(): AuthUser[] {
  return prototypeUsers.map(({ password: _password, ...user }) => user);
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function initialAdminEmails() {
  return (process.env.NEXT_PUBLIC_INITIAL_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
}

function isValidRole(value: unknown): value is AuthRole {
  return value === "admin" || value === "driver" || value === "office";
}

function firebaseLoginErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code || "") : "";
  if (code === "auth/user-disabled") return "このアカウントは利用できません。";
  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    code === "auth/invalid-email"
  ) {
    return "メールアドレスまたはパスワードが違います。";
  }
  console.error("[Auth] Firebase login failed.", error);
  return "通信エラーが発生しました。時間をおいて再度お試しください。";
}

async function readOrBootstrapUserProfile(uid: string, email: string, fallbackName: string) {
  const db = getFirebaseDb();
  const defaultRole: AuthRole = initialAdminEmails().includes(email) ? "admin" : "driver";
  if (!db) {
    return {
      uid,
      name: fallbackName || email,
      email,
      role: defaultRole,
      status: "active",
      branchId: ""
    };
  }

  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    const profile = {
      uid,
      name: fallbackName || email,
      email,
      role: defaultRole,
      status: "active",
      branchId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (defaultRole === "admin") {
      await setDoc(userRef, profile, { merge: true }).catch((error) => {
        console.warn("[Auth] Initial admin profile could not be saved. Login will continue.", error);
      });
    }
    return profile;
  }

  return snapshot.data() as {
    uid?: string;
    name?: string;
    email?: string;
    role?: unknown;
    status?: string;
    branchId?: string;
  };
}

function prototypeLogin(userId: string, password: string): AuthSession | null {
  const user = prototypeUsers.find((item) => item.userId === userId && item.password === password);
  if (!user) return null;
  const session: AuthSession = {
    userId: user.userId,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
    loggedInAt: new Date().toISOString()
  };
  window.localStorage.setItem(authSessionKey, JSON.stringify(session));
  return session;
}

export async function login(userId: string, password: string): Promise<{ session: AuthSession | null; error?: string }> {
  if (!canUseStorage()) return { session: null, error: "通信エラーが発生しました。" };

  if (!isFirebaseConfigured()) {
    const session = prototypeLogin(userId.trim(), password);
    return session ? { session } : { session: null, error: "メールアドレスまたはパスワードが違います。" };
  }

  const email = normalizeEmail(userId);
  try {
    const credential = await signInWithEmailPassword(email, password);
    const profile = await readOrBootstrapUserProfile(
      credential.user.uid,
      email,
      credential.user.displayName || ""
    );

    if (profile.status === "inactive") {
      await signOutFirebase().catch(() => undefined);
      return { session: null, error: "このアカウントは利用できません。" };
    }

    const role = isValidRole(profile.role) ? profile.role : "driver";
    const session: AuthSession = {
      userId: credential.user.uid,
      name: profile.name || credential.user.displayName || profile.email || email,
      email: profile.email || email,
      role,
      branchId: profile.branchId || "",
      loggedInAt: new Date().toISOString()
    };
    window.localStorage.setItem(authSessionKey, JSON.stringify(session));
    return { session };
  } catch (error) {
    return { session: null, error: firebaseLoginErrorMessage(error) };
  }
}

export function logout() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(authSessionKey);
  void signOutFirebase();
}

export async function sendPasswordReset(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("メールアドレスを入力してください。");
  await sendFirebasePasswordReset(normalized);
}

export function getCurrentUser(): AuthSession | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(authSessionKey);
  const session = safeJsonParse<AuthSession | null>(raw, {
    fallback: null,
    label: "authService.getCurrentUser localStorage auth session"
  });
  if (!session?.userId || !session.role) {
    window.localStorage.removeItem(authSessionKey);
    return null;
  }
  return session;
}

export function isAuthenticated() {
  return Boolean(getCurrentUser());
}

export function getFirebaseAuthentication() {
  return getFirebaseAuth();
}

export function hasRole(roles: AuthRole | AuthRole[]) {
  const user = getCurrentUser();
  if (!user) return false;
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return allowedRoles.includes(user.role);
}

export function getDefaultPathForRole(_role: AuthRole) {
  return "/dashboard";
}

export function canAccessPath(user: AuthUser, path: string) {
  if (path.startsWith("/login")) return true;
  if (path.startsWith("/admin/master")) return user.role === "admin";
  if (path.startsWith("/admin/users")) return user.role === "admin";
  if (path.startsWith("/admin")) return true;
  if (path.startsWith("/dashboard")) return true;
  if (path.startsWith("/driver")) return true;
  return true;
}

export function getSafePathForUser(user: AuthUser, requestedPath: string | null) {
  const fallback = getDefaultPathForRole(user.role);
  if (!requestedPath) return fallback;
  if (!requestedPath.startsWith("/")) return fallback;
  return canAccessPath(user, requestedPath) ? requestedPath : fallback;
}
