"use client";

import {
  getFirebaseAuth,
  getFirebaseCurrentUserIdToken,
  sendFirebasePasswordReset,
  signOutFirebase
} from "@/lib/firebaseClient";
import type { CreateUserAccountInput, UserAccount, UserAccountStatus } from "@/lib/userAccountTypes";

function normalizeUserAccount(raw: Partial<UserAccount> & { uid?: string; id?: string }): UserAccount {
  const now = new Date().toISOString();
  return {
    uid: raw.uid || raw.id || "",
    name: raw.name || "",
    email: (raw.email || "").toLowerCase(),
    department: raw.department || "",
    branchId: raw.branchId || "",
    role: raw.role === "admin" || raw.role === "office" || raw.role === "driver" ? raw.role : "driver",
    status: raw.status === "inactive" ? "inactive" : "active",
    notes: raw.notes || "",
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  };
}

async function authHeaders() {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser || null;
  console.info("[UserAdmin] Firebase user before admin API call.", {
    uidSuffix: user?.uid ? user.uid.slice(-6) : "",
    email: user?.email || "",
    isAnonymous: Boolean(user?.isAnonymous)
  });

  if (user?.isAnonymous || (user && !user.email)) {
    await signOutFirebase().catch(() => undefined);
    throw new Error("匿名ログイン状態のため社員管理を開けません。メールアドレスでログインし直してください。");
  }

  const token = await getFirebaseCurrentUserIdToken();
  if (!token) throw new Error("ログイン状態を確認できません。もう一度ログインしてください。");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof result === "object" && result && "message" in result
          ? String((result as { message?: string }).message || "処理に失敗しました。")
          : "処理に失敗しました。"
      );
    }
    return result as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("サーバーから応答がありません。環境変数またはデプロイ状態を確認してください。");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getUserAccounts(): Promise<UserAccount[]> {
  const result = await requestJson<{ users?: UserAccount[] }>("/api/admin/users", {
    method: "GET",
    headers: await authHeaders()
  });
  return (result.users || []).map((user) => normalizeUserAccount(user));
}

export async function createUserAccount(input: CreateUserAccountInput): Promise<UserAccount> {
  const result = await requestJson<{ user: UserAccount }>("/api/admin/users", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(input)
  });
  return normalizeUserAccount(result.user);
}

export async function updateUserAccountStatus(uid: string, status: UserAccountStatus): Promise<UserAccount> {
  const result = await requestJson<{ user: UserAccount }>(`/api/admin/users/${encodeURIComponent(uid)}/status`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ status })
  });
  return normalizeUserAccount(result.user);
}

export async function sendUserPasswordReset(email: string) {
  await sendFirebasePasswordReset(email.trim().toLowerCase());
}
