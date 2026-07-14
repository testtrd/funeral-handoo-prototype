import "server-only";

import type { AuthRole } from "@/lib/authService";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { CreateUserAccountInput, UserAccount, UserAccountStatus } from "@/lib/userAccountTypes";

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
  return value === "admin" || value === "office" || value === "driver" ? value : "driver";
}

function statusFromValue(value: unknown): UserAccountStatus {
  return value === "inactive" ? "inactive" : "active";
}

function userFromDoc(doc: FirestoreDoc): UserAccount {
  const data = doc.data() || {};
  const now = new Date().toISOString();
  return {
    uid: String(data.uid || doc.id),
    name: String(data.name || ""),
    email: String(data.email || "").toLowerCase(),
    department: String(data.department || ""),
    branchId: String(data.branchId || ""),
    role: roleFromValue(data.role),
    status: statusFromValue(data.status),
    notes: String(data.notes || ""),
    createdAt: String(data.createdAt || now),
    updatedAt: String(data.updatedAt || now)
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

function claimsAreAdmin(decoded: DecodedToken) {
  return (decoded.role === "admin" || decoded.admin === true) && decoded.status !== "inactive";
}

function profileIsAdmin(profile: Record<string, unknown> | undefined) {
  return profile?.role === "admin" && profile.status !== "inactive";
}

function safeSuffix(value: string) {
  return value ? value.slice(-6) : "";
}

async function refreshAdminClaims(auth: AdminAuth, uid: string, reason: "initial-email" | "firestore-profile") {
  await auth.setCustomUserClaims(uid, { role: "admin", status: "active" }).catch((error: unknown) => {
    console.warn("[Firebase Admin] Admin custom claim could not be refreshed.", { reason, error });
  });
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
  const customClaimAdmin = claimsAreAdmin(decoded);
  const firestoreProfileAdmin = profileIsAdmin(profile);
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
    profileStatus: String(profile?.status || "")
  });

  if (initialAdmin || customClaimAdmin || firestoreProfileAdmin) {
    const now = new Date().toISOString();
    const canonicalRef = db.collection("users").doc(decoded.uid);
    const shouldRefreshProfile =
      initialAdmin ||
      firestoreProfileAdmin ||
      !profile ||
      profileResult.docId !== decoded.uid ||
      profile.role !== "admin" ||
      profile.status === "inactive";

    if (shouldRefreshProfile) {
      await canonicalRef.set(
        {
          uid: decoded.uid,
          name: String(profile?.name || decoded.name || email || "管理者"),
          email: email || String(profile?.email || ""),
          role: "admin",
          status: "active",
          updatedAt: now,
          createdAt: String(profile?.createdAt || now)
        },
        { merge: true }
      ).catch((error: unknown) => {
        console.warn("[Firebase Admin] Admin profile could not be refreshed.", { uidSuffix: safeSuffix(decoded.uid), error });
      });
    }

    if (!customClaimAdmin) {
      await refreshAdminClaims(auth, decoded.uid, initialAdmin ? "initial-email" : "firestore-profile");
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
    await auth.setCustomUserClaims(firebaseUser.uid, { role: normalized.role, status: "active" });

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

  const userRef = db.collection("users").doc(uid);
  const current = await userRef.get();
  const currentData = current.data() || {};
  const role = roleFromValue(currentData.role);
  await auth.updateUser(uid, { disabled: status === "inactive" });
  await auth.setCustomUserClaims(uid, { role, status });

  const now = new Date().toISOString();
  await userRef.update({ status, updatedAt: now });
  const updated = await userRef.get();
  return userFromDoc(updated);
}
