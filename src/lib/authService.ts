import { getFirebaseAuth } from "@/lib/firebaseClient";

export type AuthRole = "admin" | "driver" | "office";

export type AuthUser = {
  userId: string;
  name: string;
  role: AuthRole;
  branchId?: string;
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

export function login(userId: string, password: string): AuthSession | null {
  if (!canUseStorage()) return null;
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

export function logout() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(authSessionKey);
}

export function getCurrentUser(): AuthSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(authSessionKey);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    return session.userId && session.role ? session : null;
  } catch {
    window.localStorage.removeItem(authSessionKey);
    return null;
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

export function getDefaultPathForRole(role: AuthRole) {
  return "/dashboard";
}

export function canAccessPath(user: AuthUser, path: string) {
  if (path.startsWith("/login")) return true;
  if (path.startsWith("/admin/master")) return user.role === "admin";
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
