"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, getDefaultPathForRole, logout, type AuthRole, type AuthSession } from "@/lib/authService";

export function AuthGate({ allowedRoles, children }: { allowedRoles?: AuthRole[]; children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (allowedRoles?.length && !allowedRoles.includes(current.role)) {
      if (window.location.pathname.startsWith("/admin") && current.role !== "admin") {
        window.location.replace("/dashboard");
        return;
      }
    }
    setUser(current);
    setChecked(true);
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
            <a className="button-link" href={getDefaultPathForRole(user.role)}>利用できる画面へ移動</a>
            <button
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
            >
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

  useEffect(() => setUser(getCurrentUser()), []);

  if (!user) return null;

  return (
    <div className="auth-status">
      <span>{user.name}</span>
      <span>{user.role}</span>
      <button
        type="button"
        onClick={() => {
          logout();
          window.location.href = "/login";
        }}
      >
        ログアウト
      </button>
    </div>
  );
}
