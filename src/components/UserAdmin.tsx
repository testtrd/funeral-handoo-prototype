"use client";

import { AuthStatus } from "@/components/AuthGate";
import { getPrototypeUsers } from "@/lib/authService";

export default function UserAdmin() {
  const users = getPrototypeUsers();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">管理者設定</p>
          <h1>ユーザー管理</h1>
          <p className="small">プロトタイプ用ユーザーを確認できます。本運用では外部認証へ差し替える想定です。</p>
        </div>
        <div className="toolbar">
          <AuthStatus />
          <a className="button-link" href="/dashboard">ダッシュボード</a>
          <a className="button-link" href="/admin/master">マスター管理</a>
        </div>
      </header>

      <section className="admin-table-wrap">
        <table className="admin-table compact">
          <thead>
            <tr><th>ユーザーID</th><th>氏名</th><th>ロール</th><th>拠点</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId}>
                <td>{user.userId}</td>
                <td>{user.name}</td>
                <td>{user.role}</td>
                <td>{user.branchId || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
