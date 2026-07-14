"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthStatus } from "@/components/AuthGate";
import {
  createUserAccount,
  getUserAccounts,
  sendUserPasswordReset,
  updateUserAccountStatus
} from "@/lib/userAccountService";
import type { AuthRole } from "@/lib/authService";
import type { CreateUserAccountInput, UserAccount } from "@/lib/userAccountTypes";

const emptyForm: CreateUserAccountInput = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  department: "",
  branchId: "",
  role: "driver",
  notes: ""
};

function roleLabel(role: AuthRole) {
  if (role === "admin") return "管理者";
  if (role === "office") return "企画部";
  return "ドライバー";
}

function statusLabel(status: UserAccount["status"]) {
  return status === "active" ? "有効" : "無効";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

export default function UserAdmin() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [form, setForm] = useState<CreateUserAccountInput>(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      setUsers(await getUserAccounts());
    } catch (error) {
      console.error("[UserAdmin] Failed to load users.", error);
      setError(error instanceof Error ? error.message : "社員一覧を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => {
      return (
        user.name.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword) ||
        (user.department || "").toLowerCase().includes(keyword)
      );
    });
  }, [search, users]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const created = await createUserAccount(form);
      setUsers((current) => [created, ...current.filter((user) => user.uid !== created.uid)]);
      setForm(emptyForm);
      setMessage("社員アカウントを登録しました。");
    } catch (error) {
      console.error("[UserAdmin] Create user failed.", error);
      setError(error instanceof Error ? error.message : "社員アカウントを登録できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(user: UserAccount) {
    const nextStatus = user.status === "active" ? "inactive" : "active";
    const label = nextStatus === "inactive" ? "無効化" : "有効化";
    if (!window.confirm(`${user.name}さんのアカウントを${label}しますか？`)) return;
    setMessage("");
    setError("");
    try {
      const updated = await updateUserAccountStatus(user.uid, nextStatus);
      setUsers((current) => current.map((item) => (item.uid === updated.uid ? updated : item)));
      setMessage(`アカウントを${label}しました。`);
    } catch (error) {
      console.error("[UserAdmin] Status update failed.", error);
      setError(error instanceof Error ? error.message : "アカウント状態を変更できませんでした。");
    }
  }

  async function resetPassword(user: UserAccount) {
    if (!window.confirm(`${user.email} へパスワード再設定メールを送信しますか？`)) return;
    setMessage("");
    setError("");
    try {
      await sendUserPasswordReset(user.email);
      setMessage("パスワード再設定メールを送信しました。");
    } catch (error) {
      console.error("[UserAdmin] Password reset failed.", error);
      setError(error instanceof Error ? error.message : "パスワード再設定メールを送信できませんでした。");
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">管理者設定</p>
          <h1>社員アカウント管理</h1>
          <p className="small">LINE WORKSメールアドレスをログインIDとして使用します。</p>
        </div>
        <div className="toolbar">
          <AuthStatus />
          <a className="button-link" href="/dashboard">
            ダッシュボード
          </a>
          <a className="button-link" href="/admin/master">
            マスター管理
          </a>
        </div>
      </header>

      <section className="user-admin-grid">
        <form className="user-admin-form" onSubmit={submit}>
          <h2>新規社員追加</h2>
          <label>
            氏名
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            LINE WORKSメールアドレス
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              inputMode="email"
            />
          </label>
          <div className="two-column-fields">
            <label>
              初期パスワード
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                autoComplete="new-password"
              />
            </label>
            <label>
              初期パスワード確認
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="two-column-fields">
            <label>
              所属
              <input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
            </label>
            <label>
              権限
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AuthRole })}>
                <option value="driver">ドライバー</option>
                <option value="office">企画部</option>
                <option value="admin">管理者</option>
              </select>
            </label>
          </div>
          <label>
            備考
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "登録中..." : "社員を追加"}
          </button>
        </form>

        <section className="user-admin-list">
          <div className="user-admin-list-header">
            <div>
              <h2>社員一覧</h2>
              <p className="small">{loading ? "読み込み中..." : `${filteredUsers.length}件表示`}</p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="氏名・メール・所属で検索"
              aria-label="社員検索"
            />
          </div>
          {message ? <p className="send-status success">{message}</p> : null}
          {error ? <p className="send-status error">{error}</p> : null}
          <div className="admin-table-wrap">
            <table className="admin-table compact">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>LINE WORKSメール</th>
                  <th>所属</th>
                  <th>権限</th>
                  <th>状態</th>
                  <th>登録日</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length ? (
                  filteredUsers.map((user) => (
                    <tr key={user.uid}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.department || "-"}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td>
                        <span className="status-chip">{statusLabel(user.status)}</span>
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="table-actions compact-actions">
                          <button type="button" onClick={() => resetPassword(user)}>
                            再設定
                          </button>
                          <button
                            type="button"
                            className={user.status === "active" ? "danger-button" : ""}
                            onClick={() => changeStatus(user)}
                          >
                            {user.status === "active" ? "無効化" : "有効化"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-state">
                    <td colSpan={7}>社員アカウントがありません。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
