import {
  getFirebaseAuth,
  getFirebaseCurrentUserIdToken,
  getFirebaseDb,
  isFirebaseConfigured,
  sendFirebasePasswordReset,
  signInWithEmailPassword,
  signOutFirebase
} from "@/lib/firebaseClient";
import { safeJsonParse } from "@/lib/safeJson";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type AuthRole = "master" | "planning" | "manager" | "staff";

export type AuthUser = {
  userId: string;
  name: string;
  role: AuthRole;
  branchId?: string;
  branchIds?: string[];
  email?: string;
  mustChangePassword?: boolean;
};

export type AuthSession = AuthUser & {
  loggedInAt: string;
};

const authSessionKey = "funeral-handoff-auth-session-v1";

const prototypeUsers: Array<AuthUser & { password: string }> = [
  { userId: "admin", name: "\u7ba1\u7406\u8005", password: "admin-pass", role: "master" },
  { userId: "driver01", name: "\u30c9\u30e9\u30a4\u30d0\u30fc01", password: "driver-pass", role: "staff", branchId: "head_office", branchIds: ["head_office"] },
  { userId: "office01", name: "\u4f01\u753b\u90e801", password: "office-pass", role: "planning", branchId: "head_office", branchIds: ["head_office"] }
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

export function normalizeAuthRole(value: unknown): AuthRole {
  if (value === "master" || value === "planning" || value === "manager" || value === "staff") return value;
  if (value === "admin") return "master";
  if (value === "office") return "planning";
  if (value === "driver") return "staff";
  return "staff";
}

function normalizedBranchIds(branchId?: unknown, branchIds?: unknown) {
  if (Array.isArray(branchIds) && branchIds.length) {
    return branchIds.map((value) => String(value || "").trim()).filter(Boolean);
  }
  const id = String(branchId || "").trim();
  return id ? [id] : [];
}

function firebaseLoginErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code || "") : "";
  if (code === "auth/user-disabled") return "\u3053\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u5229\u7528\u3067\u304d\u307e\u305b\u3093\u3002";
  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    code === "auth/invalid-email"
  ) {
    return "\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u307e\u305f\u306f\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u9055\u3044\u307e\u3059\u3002";
  }
  console.error("[Auth] Firebase login failed.", error);
  return "\u901a\u4fe1\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u304a\u3044\u3066\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002";
}

async function readOrBootstrapUserProfile(uid: string, email: string, fallbackName: string) {
  const db = getFirebaseDb();
  const defaultRole: AuthRole = initialAdminEmails().includes(email) ? "master" : "staff";
  if (!db) {
    return {
      uid,
      name: fallbackName || email,
      email,
      role: defaultRole,
      status: "active",
      mustChangePassword: false,
      branchId: "",
      branchIds: []
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
      mustChangePassword: false,
      branchId: "",
      branchIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (defaultRole === "master") {
      await setDoc(userRef, profile, { merge: true }).catch((error) => {
        console.warn("[Auth] Initial master profile could not be saved. Login will continue.", error);
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
    mustChangePassword?: boolean;
    branchId?: string;
    branchIds?: unknown;
  };
}

function prototypeLogin(userId: string, password: string): AuthSession | null {
  const user = prototypeUsers.find((item) => item.userId === userId && item.password === password);
  if (!user) return null;
  const branchIds = normalizedBranchIds(user.branchId, user.branchIds);
  const session: AuthSession = {
    userId: user.userId,
    name: user.name,
    role: normalizeAuthRole(user.role),
    mustChangePassword: false,
    branchId: user.branchId || branchIds[0] || "",
    branchIds,
    loggedInAt: new Date().toISOString()
  };
  window.localStorage.setItem(authSessionKey, JSON.stringify(session));
  return session;
}

export async function login(userId: string, password: string): Promise<{ session: AuthSession | null; error?: string }> {
  if (!canUseStorage()) return { session: null, error: "\u901a\u4fe1\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002" };

  if (!isFirebaseConfigured()) {
    const session = prototypeLogin(userId.trim(), password);
    return session ? { session } : { session: null, error: "\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u307e\u305f\u306f\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u9055\u3044\u307e\u3059\u3002" };
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
      return { session: null, error: "\u3053\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u5229\u7528\u3067\u304d\u307e\u305b\u3093\u3002" };
    }

    const branchIds = normalizedBranchIds(profile.branchId, profile.branchIds);
    const session: AuthSession = {
      userId: credential.user.uid,
      name: profile.name || credential.user.displayName || profile.email || email,
      email: profile.email || email,
      role: normalizeAuthRole(profile.role),
      mustChangePassword: profile.mustChangePassword === true,
      branchId: profile.branchId || branchIds[0] || "",
      branchIds,
      loggedInAt: new Date().toISOString()
    };
    window.localStorage.setItem(authSessionKey, JSON.stringify(session));
    return { session };
  } catch (error) {
    return { session: null, error: firebaseLoginErrorMessage(error) };
  }
}

export async function logout() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(authSessionKey);
  await signOutFirebase();
}

export async function sendPasswordReset(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002");
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
  const branchIds = normalizedBranchIds(session.branchId, session.branchIds);
  return {
    ...session,
    role: normalizeAuthRole(session.role),
    mustChangePassword: session.mustChangePassword === true,
    branchId: session.branchId || branchIds[0] || "",
    branchIds
  };
}

export async function refreshCurrentUserProfile(): Promise<AuthSession | null> {
  if (!canUseStorage()) return null;
  const current = getCurrentUser();
  const db = getFirebaseDb();
  if (!current || !db || !isFirebaseConfigured()) return current;
  try {
    const userRef = doc(db, "users", current.userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) return current;
    const profile = snapshot.data() as {
      name?: string;
      email?: string;
      role?: unknown;
      status?: string;
      branchId?: string;
      branchIds?: unknown;
      mustChangePassword?: boolean;
    };
    if (profile.status === "inactive") {
      await logout();
      return null;
    }
    const branchIds = normalizedBranchIds(profile.branchId, profile.branchIds);
    const nextSession: AuthSession = {
      ...current,
      name: profile.name || current.name,
      email: profile.email || current.email,
      role: normalizeAuthRole(profile.role || current.role),
      branchId: profile.branchId || branchIds[0] || current.branchId || "",
      branchIds: branchIds.length ? branchIds : current.branchIds || [],
      mustChangePassword: profile.mustChangePassword === true
    };
    window.localStorage.setItem(authSessionKey, JSON.stringify(nextSession));
    return nextSession;
  } catch (error) {
    console.warn("[Auth] Failed to refresh current user profile.", error);
    return current;
  }
}

export async function markPasswordChangeCompleted() {
  const token = await getFirebaseCurrentUserIdToken();
  const response = await fetch("/api/auth/password-changed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof result === "object" && result && "message" in result
        ? String((result as { message?: string }).message || "パスワード変更後の保存に失敗しました。")
        : "パスワード変更後の保存に失敗しました。"
    );
  }
  const current = getCurrentUser();
  if (current) {
    const nextSession = { ...current, mustChangePassword: false };
    window.localStorage.setItem(authSessionKey, JSON.stringify(nextSession));
  }
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
  if (path.startsWith("/change-password")) return true;
  if (user.mustChangePassword) return false;
  if (path.startsWith("/admin/master")) return user.role === "master";
  if (path.startsWith("/admin/users")) return user.role === "master";
  if (path.startsWith("/admin")) return true;
  if (path.startsWith("/dashboard")) return true;
  if (path.startsWith("/driver")) return true;
  return true;
}

export function getSafePathForUser(user: AuthUser, requestedPath: string | null) {
  if (user.mustChangePassword) return "/change-password";
  const fallback = getDefaultPathForRole(user.role);
  if (!requestedPath) return fallback;
  if (!requestedPath.startsWith("/")) return fallback;
  return canAccessPath(user, requestedPath) ? requestedPath : fallback;
}
