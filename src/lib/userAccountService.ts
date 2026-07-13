"use client";

import { getFirebaseCurrentUserIdToken, getFirebaseDb, sendFirebasePasswordReset } from "@/lib/firebaseClient";
import type { CreateUserAccountInput, UserAccount, UserAccountStatus } from "@/lib/userAccountTypes";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

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
  const token = await getFirebaseCurrentUserIdToken();
  if (!token) throw new Error("ログイン状態を確認できません。もう一度ログインしてください。");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "処理に失敗しました。");
  }
  return result as T;
}

export async function getUserAccounts(): Promise<UserAccount[]> {
  const db = getFirebaseDb();
  if (!db) return [];
  const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(usersQuery);
  return snapshot.docs.map((item) => normalizeUserAccount({ id: item.id, ...item.data() }));
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
