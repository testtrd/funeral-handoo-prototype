"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, getDefaultPathForRole, logout, refreshCurrentUserProfile, type AuthRole, type AuthSession } from "@/lib/authService";
import { userRoleLabel } from "@/lib/accessControl";
import { releaseCurrentEditingLock } from "@/lib/handoffStorage";

async function logoutAndGoLogin() {
  releaseCurrentEditingLock();
  await logout().catch((error) => {
    console.warn("[AuthGate] Firebase sign-out failed.", error);
  });
  window.location.href = "/login";
}

export function AuthGate({ allowedRoles, children }: { allowedRoles?: AuthRole[]; children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
    try {
      const current = await refreshCurrentUserProfile();
      if (!current) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      if (current.mustChangePassword && !window.location.pathname.startsWith("/change-password")) {
        window.location.replace("/change-password");
        return;
      }

      if (allowedRoles?.length && !allowedRoles.includes(current.role)) {
        if (window.location.pathname.startsWith("/admin/master") && current.role !== "master") {
          window.location.replace("/dashboard");
          return;
        }
      }

      if (!cancelled) setUser(current);
    } catch (error) {
      console.error("[AuthGate] Failed to check auth state.", error);
    } finally {
      if (!cancelled) setChecked(true);
    }
    }
    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [allowedRoles]);

  if (!checked) {
    return (
      <main className="app-shell">
        <section className="section">
          <p className="notice">ログイン状態を確認しています。</p>
        </section>
      </main>
    );
  }

  if (allowedRoles?.length && user && !allowedRoles.includes(user.role)) {
    return (
      <main className="app-shell">
        <section className="section">
          <h1>権限がありません</h1>
          <p className="error">この画面を表示する権限がありません。</p>
          <div className="toolbar">
            <a className="button-link" href={getDefaultPathForRole(user.role)}>
              利用できる画面へ移動
            </a>
            <button type="button" onClick={() => void logoutAndGoLogin()}>
              ログアウト
            </button>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

export function AuthStatus() {
  const [user, setUser] = useState<AuthSession | null>(null);

  useEffect(() => {
    try {
      setUser(getCurrentUser());
    } catch (error) {
      console.error("[AuthStatus] Failed to read current user.", error);
      setUser(null);
    }
  }, []);

  if (!user) return null;

  return (
    <div className="auth-status">
      <span>{user.name}</span>
      <span>{userRoleLabel(user.role)}</span>
      <button type="button" onClick={() => void logoutAndGoLogin()}>
        ログアウト
      </button>
    </div>
  );
}
