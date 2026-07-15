import type { AuthUser } from "@/lib/authService";

export type CaseAccessData = {
  branchId?: string;
};

export function userRoleLabel(role: AuthUser["role"]) {
  if (role === "master") return "\u7ba1\u7406\u8005";
  if (role === "planning") return "\u4f01\u753b\u90e8";
  if (role === "manager") return "\u5f79\u8077\u8005\u4ee5\u4e0a";
  return "\u30c9\u30e9\u30a4\u30d0\u30fc";
}

export function isActiveUser(user: AuthUser | null | undefined) {
  return Boolean(user);
}

export function userBranchIds(user: Pick<AuthUser, "branchId" | "branchIds"> | null | undefined) {
  if (!user) return [];
  if (Array.isArray(user.branchIds) && user.branchIds.length) return user.branchIds.filter(Boolean);
  return user.branchId ? [user.branchId] : [];
}

export function isSameBranchUser(user: AuthUser | null | undefined, caseData: CaseAccessData) {
  const branchIds = userBranchIds(user);
  return Boolean(caseData.branchId && branchIds.includes(caseData.branchId));
}

export function canViewAllCases(user: AuthUser | null | undefined) {
  return isActiveUser(user) && (user?.role === "master" || user?.role === "planning" || user?.role === "manager");
}

export function canViewCase(user: AuthUser | null | undefined, caseData: CaseAccessData) {
  if (!isActiveUser(user)) return false;
  if (canViewAllCases(user)) return true;
  return user?.role === "staff" && isSameBranchUser(user, caseData);
}

export function canEditCase(user: AuthUser | null | undefined, caseData: CaseAccessData) {
  if (!isActiveUser(user)) return false;
  if (user?.role === "master" || user?.role === "planning") return true;
  if (user?.role === "manager" || user?.role === "staff") return isSameBranchUser(user, caseData);
  return false;
}

export function canDeleteCase(user: AuthUser | null | undefined) {
  return isActiveUser(user) && user?.role === "master";
}

export function canManageUsers(user: AuthUser | null | undefined) {
  return isActiveUser(user) && user?.role === "master";
}

export function canManageMasters(user: AuthUser | null | undefined) {
  return isActiveUser(user) && user?.role === "master";
}
