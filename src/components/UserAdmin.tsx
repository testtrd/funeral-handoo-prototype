"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthStatus } from "@/components/AuthGate";
import { getAllBranches } from "@/lib/masterDataService";
import {
  createUserAccount,
  getUserAccounts,
  sendUserPasswordReset,
  updateUserAccount,
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
  branchIds: [],
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

export default function UserAdmin({ embedded = false }: { embedded?: boolean }) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [form, setForm] = useState<CreateUserAccountInput>(emptyForm);
  const [editingUid, setEditingUid] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const branches = useMemo(() => getAllBranches(), []);
  const enabledBranches = useMemo(() => branches.filter((branch) => branch.enabled), [branches]);

  function branchIdsFromValue(value: Pick<UserAccount, "branchId" | "branchIds"> | Pick<CreateUserAccountInput, "branchId" | "branchIds">) {
    if (Array.isArray(value.branchIds) && value.branchIds.length) return value.branchIds.filter(Boolean);
    return value.branchId ? [value.branchId] : [];
  }

  function branchNameText(branchIds: string[]) {
    return branchIds
      .map((branchId) => branches.find((branch) => branch.id === branchId)?.name || branchId)
      .filter(Boolean)
      .join("、");
  }

  function updateFormBranchIds(branchIds: string[]) {
    const uniqueBranchIds = Array.from(new Set(branchIds.filter(Boolean)));
    setForm((current) => ({
      ...current,
      branchIds: uniqueBranchIds,
      branchId: uniqueBranchIds[0] || "",
      department: branchNameText(uniqueBranchIds)
    }));
  }

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
      const branchText = branchNameText(branchIdsFromValue(user));
      return (
        user.name.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword) ||
        (user.department || "").toLowerCase().includes(keyword) ||
        branchText.toLowerCase().includes(keyword)
      );
    });
  }, [branches, search, users]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const selectedBranchIds = branchIdsFromValue(form);
      const department = branchNameText(selectedBranchIds);
      if (editingUid) {
        const updated = await updateUserAccount(editingUid, {
          name: form.name,
          department,
          branchId: selectedBranchIds[0] || "",
          branchIds: selectedBranchIds,
          role: form.role,
          notes: form.notes
        });
        setUsers((current) => current.map((user) => (user.uid === updated.uid ? updated : user)));
        setMessage("社員情報を更新しました。");
      } else {
        const created = await createUserAccount({
          ...form,
          department,
          branchId: selectedBranchIds[0] || "",
          branchIds: selectedBranchIds
        });
        setUsers((current) => [created, ...current.filter((user) => user.uid !== created.uid)]);
        setMessage("社員アカウントを登録しました。");
      }
      setForm(emptyForm);
      setEditingUid("");
    } catch (error) {
      console.error("[UserAdmin] Save user failed.", error);
      setError(error instanceof Error ? error.message : "社員アカウントを保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(user: UserAccount) {
    const branchIds = branchIdsFromValue(user);
    setEditingUid(user.uid);
    setMessage("");
    setError("");
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      confirmPassword: "",
      department: branchNameText(branchIds) || user.department || "",
      branchId: branchIds[0] || "",
      branchIds,
      role: user.role,
      notes: user.notes || ""
    });
  }

  function cancelEdit() {
    setEditingUid("");
    setForm(emptyForm);
    setMessage("");
    setError("");
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

  const Shell = embedded ? "section" : "main";

  return (
    <Shell className={embedded ? "master-panel user-admin-embedded" : "admin-shell"}>
      {!embedded ? (
        <header className="admin-header">
          <div>
            <p className="eyebrow">管理設定</p>
            <h1>社員管理</h1>
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
      ) : null}

      <section className="user-admin-grid">
        <form className="user-admin-form" onSubmit={submit}>
          <h2>{editingUid ? "社員情報を編集" : "新規社員追加"}</h2>
          <label>
            氏名
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          {editingUid ? (
            <p className="small">ログインID: {form.email}</p>
          ) : (
            <>
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
            </>
          )}
          <div className="two-column-fields">
            <fieldset className="master-field">
              <legend>所属（拠点）</legend>
              <div className="master-check-grid">
                {enabledBranches.map((branch) => {
                  const selectedBranchIds = branchIdsFromValue(form);
                  const checked = selectedBranchIds.includes(branch.id);
                  return (
                    <label className="master-check" key={branch.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          updateFormBranchIds(
                            event.target.checked
                              ? [...selectedBranchIds, branch.id]
                              : selectedBranchIds.filter((branchId) => branchId !== branch.id)
                          );
                        }}
                      />
                      {branch.name}
                    </label>
                  );
                })}
              </div>
              <p className="small">複数拠点を兼任する場合は、複数選択できます。</p>
            </fieldset>
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
            {saving ? "保存中..." : editingUid ? "社員情報を保存" : "社員を追加"}
          </button>
          {editingUid ? (
            <button type="button" onClick={cancelEdit}>
              編集をキャンセル
            </button>
          ) : null}
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
                  <th>所属（拠点）</th>
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
                      <td>{branchNameText(branchIdsFromValue(user)) || user.department || "-"}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td>
                        <span className="status-chip">{statusLabel(user.status)}</span>
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="table-actions compact-actions">
                          <button type="button" onClick={() => startEdit(user)}>
                            編集
                          </button>
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
    </Shell>
  );
}
