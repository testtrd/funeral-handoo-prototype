import "server-only";

import type { AuthRole } from "@/lib/authService";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { CreateUserAccountInput, UserAccount, UserAccountStatus } from "@/lib/userAccountTypes";

type FirestoreDoc = {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

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
    status: data.status === "inactive" ? "inactive" : "active",
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("メールアドレスの形式を確認してください。");
  }
  if (password.length < 6) throw new Error("初期パスワードは6文字以上で入力してください。");
  if (password !== confirmPassword) {
    throw new Error("初期パスワードと確認用パスワードが一致しません。");
  }

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

function decodedIsAdmin(decoded: { email?: string; role?: string; status?: string; admin?: boolean }) {
  const email = normalizeEmail(decoded.email || "");
  if (email && adminEmails().includes(email)) return true;
  return (decoded.role === "admin" || decoded.admin === true) && decoded.status !== "inactive";
}

export async function requireAdminUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) throw new Error("ログイン状態を確認できません。もう一度ログインしてください。");

  const { auth, db } = getFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token);
  if (decodedIsAdmin(decoded)) {
    const email = normalizeEmail(decoded.email || "");
    if (email && adminEmails().includes(email)) {
      await auth.setCustomUserClaims(decoded.uid, { role: "admin", status: "active" }).catch((error: unknown) => {
        console.warn("[Firebase Admin] Initial admin custom claim could not be refreshed.", error);
      });
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
