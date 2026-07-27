import "server-only";

import { normalizeAuthRole, type AuthRole } from "@/lib/authService";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { CreateUserAccountInput, ResetUserPasswordInput, UpdateUserAccountInput, UserAccount, UserAccountStatus } from "@/lib/userAccountTypes";

type FirestoreDoc = {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

type DecodedToken = {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
  status?: string;
  branchId?: string;
  branchIds?: string[];
  admin?: boolean;
};

type AdminDb = ReturnType<typeof getFirebaseAdmin>["db"];
type AdminAuth = ReturnType<typeof getFirebaseAdmin>["auth"];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function adminEmails() {
  return (process.env.INITIAL_ADMIN_EMAILS || process.env.NEXT_PUBLIC_INITIAL_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
}

function roleFromValue(value: unknown): AuthRole {
  return normalizeAuthRole(value);
}

function statusFromValue(value: unknown): UserAccountStatus {
  return value === "inactive" ? "inactive" : "active";
}

function stringArrayFromValue(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function roleUsesAllBranches(role: AuthRole) {
  return role === "master" || role === "planning";
}

function claimsForUser(role: AuthRole, status: UserAccountStatus, branchId: string, branchIds: string[]) {
  const normalizedBranchId = roleUsesAllBranches(role) ? "" : branchId;
  const normalizedBranchIds = roleUsesAllBranches(role) ? [] : branchIds;
  return {
    role,
    status,
    branchId: normalizedBranchId,
    branchIds: normalizedBranchIds
  };
}

function claimsMatchUser(decoded: DecodedToken, role: AuthRole, status: UserAccountStatus, branchId: string, branchIds: string[]) {
  const expected = claimsForUser(role, status, branchId, branchIds);
  const actualBranchIds = stringArrayFromValue(decoded.branchIds);
  return (
    normalizeAuthRole(decoded.role) === expected.role &&
    statusFromValue(decoded.status) === expected.status &&
    String(decoded.branchId || "") === expected.branchId &&
    actualBranchIds.length === expected.branchIds.length &&
    actualBranchIds.every((value, index) => value === expected.branchIds[index])
  );
}

function timestampString(value: unknown, fallback: string) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  return String(value);
}

function userFromDoc(doc: FirestoreDoc): UserAccount {
  const data = doc.data() || {};
  const now = new Date().toISOString();
  const branchIds = stringArrayFromValue(data.branchIds);
  const branchId = String(data.branchId || branchIds[0] || "");
  return {
    uid: String(data.uid || doc.id),
    name: String(data.name || ""),
    email: String(data.email || "").toLowerCase(),
    department: String(data.department || ""),
    branchId,
    branchIds: branchIds.length ? branchIds : branchId ? [branchId] : [],
    role: roleFromValue(data.role),
    status: statusFromValue(data.status),
    mustChangePassword: data.mustChangePassword === true,
    notes: String(data.notes || ""),
    createdAt: timestampString(data.createdAt, now),
    updatedAt: timestampString(data.updatedAt, now)
  };
}

function validateCreateInput(input: CreateUserAccountInput) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;
  const confirmPassword = input.confirmPassword;

  if (!name) throw new Error("氏名を入力してください。");
  if (!email) throw new Error("LINE WORKSメールアドレスを入力してください。");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("メールアドレスの形式を確認してください。");
  if (password.length < 8) throw new Error("初期パスワードは8文字以上で入力してください。");
  if (password !== confirmPassword) throw new Error("初期パスワードと確認用パスワードが一致しません。");

  const role = roleFromValue(input.role);
  const branchIds = roleUsesAllBranches(role) ? [] : stringArrayFromValue(input.branchIds);
  const branchId = roleUsesAllBranches(role) ? "" : input.branchId?.trim() || branchIds[0] || "";

  return {
    name,
    email,
    password,
    role,
    department: roleUsesAllBranches(role) ? "全拠点" : input.department?.trim() || "",
    branchId,
    branchIds: branchIds.length ? branchIds : branchId ? [branchId] : [],
    notes: input.notes?.trim() || ""
  };
}

function validateUpdateInput(input: UpdateUserAccountInput) {
  const name = input.name.trim();
  if (!name) throw new Error("氏名を入力してください。");

  const role = roleFromValue(input.role);
  const branchIds = roleUsesAllBranches(role) ? [] : stringArrayFromValue(input.branchIds);
  const branchId = roleUsesAllBranches(role) ? "" : input.branchId?.trim() || branchIds[0] || "";

  return {
    name,
    role,
    department: roleUsesAllBranches(role) ? "全拠点" : input.department?.trim() || "",
    branchId,
    branchIds: branchIds.length ? branchIds : branchId ? [branchId] : [],
    notes: input.notes?.trim() || ""
  };
}

function validateInitialPassword(input: ResetUserPasswordInput) {
  const password = input.password;
  const confirmPassword = input.confirmPassword;
  if (!password || !password.trim()) throw new Error("初期パスワードを入力してください。");
  if (password.length < 8) throw new Error("初期パスワードは8文字以上で入力してください。");
  if (password !== confirmPassword) throw new Error("確認用パスワードが一致しません。");
  return password;
}

function userClaimValuesFromProfile(profile: Record<string, unknown> | undefined) {
  const role = roleFromValue(profile?.role);
  const status = statusFromValue(profile?.status);
  const rawBranchIds = stringArrayFromValue(profile?.branchIds);
  const rawBranchId = String(profile?.branchId || rawBranchIds[0] || "");
  const branchIds = rawBranchIds.length ? rawBranchIds : rawBranchId ? [rawBranchId] : [];
  return {
    role,
    status,
    branchId: rawBranchId,
    branchIds
  };
}

function claimsAreMaster(decoded: DecodedToken) {
  const role = normalizeAuthRole(decoded.role);
  return (role === "master" || decoded.admin === true) && decoded.status !== "inactive";
}

function profileIsMaster(profile: Record<string, unknown> | undefined) {
  return normalizeAuthRole(profile?.role) === "master" && profile?.status !== "inactive";
}

function safeSuffix(value: string) {
  return value ? value.slice(-6) : "";
}

async function syncUserClaims(auth: AdminAuth, uid: string, role: AuthRole, status: UserAccountStatus, branchId: string, branchIds: string[], reason: string) {
  const claims = claimsForUser(role, status, branchId, branchIds);
  await auth.setCustomUserClaims(uid, claims).catch((error: unknown) => {
    console.warn("[Firebase Admin] Custom claims could not be refreshed.", { reason, uidSuffix: safeSuffix(uid), error });
    throw error;
  });
  console.info("[Firebase Admin] Custom claims refreshed.", {
    reason,
    uidSuffix: safeSuffix(uid),
    role: claims.role,
    status: claims.status,
    branchId: claims.branchId,
    branchIdsCount: claims.branchIds.length
  });
}

async function refreshMasterClaims(auth: AdminAuth, uid: string, reason: "initial-email" | "firestore-profile" | "claim-shape") {
  await syncUserClaims(auth, uid, "master", "active", "", [], reason);
}

async function findUserProfile(db: AdminDb, uid: string, email: string) {
  const users = db.collection("users");
  const uidSnapshot = await users.doc(uid).get().catch((error: unknown) => {
    console.warn("[Firebase Admin] Failed to read user profile by uid.", { uidSuffix: safeSuffix(uid), error });
    return null;
  });

  if (uidSnapshot?.exists) {
    return {
      source: "uid" as const,
      docId: uidSnapshot.id,
      snapshot: uidSnapshot,
      profile: uidSnapshot.data()
    };
  }

  if (!email) {
    return {
      source: "none" as const,
      docId: "",
      snapshot: uidSnapshot,
      profile: undefined
    };
  }

  const emailQuery = await users.where("email", "==", email).limit(1).get().catch((error: unknown) => {
    console.warn("[Firebase Admin] Failed to read user profile by email.", { emailPresent: Boolean(email), error });
    return null;
  });
  const emailDoc = emailQuery?.docs?.[0];
  return {
    source: emailDoc ? ("email" as const) : ("none" as const),
    docId: emailDoc?.id || "",
    snapshot: emailDoc || uidSnapshot,
    profile: emailDoc?.data()
  };
}

export async function syncOwnUserClaims(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) throw new Error("ログイン状態を確認できません。もう一度ログインしてください。");

  const { auth, db } = getFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token) as DecodedToken;
  const email = normalizeEmail(decoded.email || "");
  const profileResult = await findUserProfile(db, decoded.uid, email);
  const profile = profileResult.profile;
  const configuredAdminEmails = adminEmails();
  const initialAdmin = Boolean(email && configuredAdminEmails.includes(email));
  const now = new Date().toISOString();

  if (!profile && !initialAdmin) {
    throw new Error("社員情報が見つかりません。管理者へ確認してください。");
  }

  const canonicalRef = db.collection("users").doc(decoded.uid);
  const claimValues = initialAdmin && (!profile || profileResult.docId !== decoded.uid)
    ? { role: "master" as AuthRole, status: "active" as UserAccountStatus, branchId: "", branchIds: [] }
    : userClaimValuesFromProfile(profile);

  if (claimValues.status === "inactive") {
    throw new Error("このアカウントは利用できません。");
  }

  if (initialAdmin && (!profile || profileResult.docId !== decoded.uid)) {
    await canonicalRef.set(
      {
        uid: decoded.uid,
        name: String(profile?.name || decoded.name || email || "管理者"),
        email: email || String(profile?.email || ""),
        role: "master",
        status: "active",
        branchId: "",
        branchIds: [],
        updatedAt: now,
        createdAt: String(profile?.createdAt || now)
      },
      { merge: true }
    );
  }

  if (!claimsMatchUser(decoded, claimValues.role, claimValues.status, claimValues.branchId, claimValues.branchIds)) {
    await syncUserClaims(auth, decoded.uid, claimValues.role, claimValues.status, claimValues.branchId, claimValues.branchIds, "sync-own-user");
  }

  return {
    ok: true,
    role: claimValues.role,
    status: claimValues.status,
    branchId: claimsForUser(claimValues.role, claimValues.status, claimValues.branchId, claimValues.branchIds).branchId,
    branchIds: claimsForUser(claimValues.role, claimValues.status, claimValues.branchId, claimValues.branchIds).branchIds
  };
}
export async function requireAdminUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) throw new Error("ログイン状態を確認できません。もう一度ログインしてください。");

  const { auth, db } = getFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token) as DecodedToken;
  const email = normalizeEmail(decoded.email || "");
  const configuredAdminEmails = adminEmails();
  const initialAdmin = Boolean(email && configuredAdminEmails.includes(email));
  const profileResult = await findUserProfile(db, decoded.uid, email);
  const profile = profileResult.profile;
  if (profile?.mustChangePassword === true) {
    throw new Error("初回パスワード設定が完了するまで、この操作は利用できません。");
  }
  const customClaimAdmin = claimsAreMaster(decoded);
  const firestoreProfileAdmin = profileIsMaster(profile);
  const uidDocMatched = profileResult.source === "uid";
  const emailDocMatched = profileResult.source === "email";

  console.log("[Firebase Admin] admin check", {
    uidPresent: Boolean(decoded.uid),
    uidSuffix: safeSuffix(decoded.uid),
    profileDocIdSuffix: safeSuffix(profileResult.docId),
    uidDocMatched,
    emailPresent: Boolean(email),
    initialAdminEmailCount: configuredAdminEmails.length,
    initialAdmin,
    customClaimAdmin,
    firestoreProfileAdmin,
    emailDocMatched,
    claimRole: decoded.role || "",
    claimStatus: decoded.status || "",
    profileRole: String(profile?.role || ""),
    profileStatus: String(profile?.status || ""),
    claimBranchId: decoded.branchId || "",
    claimBranchIdsCount: stringArrayFromValue(decoded.branchIds).length
  });

  if (initialAdmin || customClaimAdmin || firestoreProfileAdmin) {
    const now = new Date().toISOString();
    const canonicalRef = db.collection("users").doc(decoded.uid);
    const shouldRefreshProfile =
      initialAdmin ||
      firestoreProfileAdmin ||
      !profile ||
      profileResult.docId !== decoded.uid ||
      normalizeAuthRole(profile.role) !== "master" ||
      profile.status === "inactive";

    if (shouldRefreshProfile) {
      await canonicalRef.set(
        {
          uid: decoded.uid,
          name: String(profile?.name || decoded.name || email || "管理者"),
          email: email || String(profile?.email || ""),
          role: "master",
          status: "active",
          branchId: "",
          branchIds: [],
          updatedAt: now,
          createdAt: String(profile?.createdAt || now)
        },
        { merge: true }
      ).catch((error: unknown) => {
        console.warn("[Firebase Admin] Admin profile could not be refreshed.", { uidSuffix: safeSuffix(decoded.uid), error });
      });
    }

    if (!claimsMatchUser(decoded, "master", "active", "", [])) {
      await refreshMasterClaims(auth, decoded.uid, !customClaimAdmin ? initialAdmin ? "initial-email" : "firestore-profile" : "claim-shape");
    }

    return { decoded, auth, db };
  }

  throw new Error("この操作を行う権限がありません。");
}

export async function listEmployeeAccounts(request: Request): Promise<UserAccount[]> {
  const { db } = await requireAdminUser(request);
  const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
  return snapshot.docs.map(userFromDoc);
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
    await syncUserClaims(auth, firebaseUser.uid, normalized.role, "active", normalized.branchId, normalized.branchIds, "create-employee");

    const now = new Date().toISOString();
    const user: UserAccount = {
      uid: firebaseUser.uid,
      name: normalized.name,
      email: normalized.email,
      department: normalized.department,
      branchId: normalized.branchId,
      branchIds: normalized.branchIds,
      role: normalized.role,
      status: "active",
      notes: normalized.notes,
      mustChangePassword: true,
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

  const userRef = db.collection("users").doc(uid);
  const current = await userRef.get();
  const currentData = current.data() || {};
  const role = roleFromValue(currentData.role);
  await auth.updateUser(uid, { disabled: status === "inactive" });
  const branchIds = stringArrayFromValue(currentData.branchIds);
  const branchId = String(currentData.branchId || branchIds[0] || "");
  await syncUserClaims(auth, uid, role, status, branchId, branchIds.length ? branchIds : branchId ? [branchId] : [], "set-employee-status");

  const now = new Date().toISOString();
  await userRef.update({ status, updatedAt: now });
  const updated = await userRef.get();
  return userFromDoc(updated);
}

export async function resetEmployeePassword(request: Request, uid: string, input: ResetUserPasswordInput): Promise<UserAccount> {
  const { auth, db } = await requireAdminUser(request);
  if (!uid) throw new Error("対象社員を確認できません。");
  const password = validateInitialPassword(input);
  const userRef = db.collection("users").doc(uid);
  const current = await userRef.get();
  if (!current.exists) throw new Error("対象社員が見つかりません。");

  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid).catch((error: unknown) => {
    console.warn("[Firebase Admin] Failed to revoke employee refresh tokens.", { uidSuffix: safeSuffix(uid), error });
  });
  await userRef.set(
    {
      mustChangePassword: true,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  const updated = await userRef.get();
  return userFromDoc(updated);
}

export async function completeOwnPasswordChange(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) throw new Error("ログイン状態を確認できません。もう一度ログインしてください。");

  const { auth, db } = getFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token);
  const userRef = db.collection("users").doc(decoded.uid);
  await userRef.set(
    {
      mustChangePassword: false,
      passwordChangedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export async function updateEmployeeAccount(request: Request, uid: string, input: UpdateUserAccountInput): Promise<UserAccount> {
  const { auth, db } = await requireAdminUser(request);
  if (!uid) throw new Error("対象社員を確認できません。");
  const normalized = validateUpdateInput(input);

  const userRef = db.collection("users").doc(uid);
  const current = await userRef.get();
  if (!current.exists) throw new Error("対象社員が見つかりません。");
  const currentData = current.data() || {};
  const status = statusFromValue(currentData.status);
  const now = new Date().toISOString();

  await auth.updateUser(uid, {
    displayName: normalized.name,
    disabled: status === "inactive"
  });
  await syncUserClaims(auth, uid, normalized.role, status, normalized.branchId, normalized.branchIds, "update-employee");
  await userRef.set(
    {
      uid,
      name: normalized.name,
      department: normalized.department,
      branchId: normalized.branchId,
      branchIds: normalized.branchIds,
      role: normalized.role,
      notes: normalized.notes,
      status,
      updatedAt: now
    },
    { merge: true }
  );

  const updated = await userRef.get();
  return userFromDoc(updated);
}


