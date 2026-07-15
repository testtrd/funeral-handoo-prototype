"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthStatus } from "@/components/AuthGate";
import { userRoleLabel } from "@/lib/accessControl";
import { getAllBranches } from "@/lib/masterDataService";
import {
  createUserAccount,
  getUserAccounts,
  resetUserInitialPassword,
  updateUserAccount,
  updateUserAccountStatus
} from "@/lib/userAccountService";
import type { AuthRole } from "@/lib/authService";
import type { CreateUserAccountInput, UserAccount } from "@/lib/userAccountTypes";

const labels = {
  settings: "\u7ba1\u7406\u8a2d\u5b9a",
  title: "\u793e\u54e1\u7ba1\u7406",
  description: "LINE WORKS\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u3092\u30ed\u30b0\u30a4\u30f3ID\u3068\u3057\u3066\u4f7f\u7528\u3057\u307e\u3059\u3002",
  dashboard: "\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9",
  masterAdmin: "\u30de\u30b9\u30bf\u30fc\u7ba1\u7406",
  editEmployee: "\u793e\u54e1\u60c5\u5831\u3092\u7de8\u96c6",
  newEmployee: "\u65b0\u898f\u793e\u54e1\u8ffd\u52a0",
  name: "\u6c0f\u540d",
  loginId: "\u30ed\u30b0\u30a4\u30f3ID",
  email: "LINE WORKS\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9",
  initialPassword: "\u521d\u671f\u30d1\u30b9\u30ef\u30fc\u30c9",
  confirmPassword: "\u521d\u671f\u30d1\u30b9\u30ef\u30fc\u30c9\u78ba\u8a8d",
  affiliation: "\u6240\u5c5e\uff08\u62e0\u70b9\uff09",
  multiBranchHint: "\u8907\u6570\u62e0\u70b9\u3092\u517c\u4efb\u3059\u308b\u5834\u5408\u306f\u3001\u8907\u6570\u9078\u629e\u3067\u304d\u307e\u3059\u3002",
  role: "\u6a29\u9650",
  notes: "\u5099\u8003",
  saving: "\u4fdd\u5b58\u4e2d...",
  saveEmployee: "\u793e\u54e1\u60c5\u5831\u3092\u4fdd\u5b58",
  addEmployee: "\u793e\u54e1\u3092\u8ffd\u52a0",
  cancelEdit: "\u7de8\u96c6\u3092\u30ad\u30e3\u30f3\u30bb\u30eb",
  list: "\u793e\u54e1\u4e00\u89a7",
  loading: "\u8aad\u307f\u8fbc\u307f\u4e2d...",
  searchPlaceholder: "\u6c0f\u540d\u30fb\u30e1\u30fc\u30eb\u30fb\u6240\u5c5e\u3067\u691c\u7d22",
  searchLabel: "\u793e\u54e1\u691c\u7d22",
  status: "\u72b6\u614b",
  createdAt: "\u767b\u9332\u65e5",
  actions: "\u64cd\u4f5c",
  active: "\u6709\u52b9",
  inactive: "\u7121\u52b9",
  edit: "\u7de8\u96c6",
  reset: "\u518d\u8a2d\u5b9a",
  resetInitialPassword: "初期パスワード再発行",
  newInitialPassword: "新しい初期パスワード",
  newInitialPasswordConfirm: "新しい初期パスワード確認",
  resetPasswordButton: "初期パスワードを保存",
  disable: "\u7121\u52b9\u5316",
  enable: "\u6709\u52b9\u5316",
  noUsers: "\u793e\u54e1\u30a2\u30ab\u30a6\u30f3\u30c8\u304c\u3042\u308a\u307e\u305b\u3093\u3002"
};

const emptyForm: CreateUserAccountInput = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  department: "",
  branchId: "",
  branchIds: [],
  role: "staff",
  notes: ""
};

function statusLabel(status: UserAccount["status"]) {
  return status === "active" ? labels.active : labels.inactive;
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
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
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
      .join("\u3001");
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
      setError(error instanceof Error ? error.message : "\u793e\u54e1\u4e00\u89a7\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
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
        setMessage("\u793e\u54e1\u60c5\u5831\u3092\u66f4\u65b0\u3057\u307e\u3057\u305f\u3002");
      } else {
        if (!form.password.trim()) {
          throw new Error("初期パスワードを入力してください。");
        }
        if (form.password.length < 8) {
          throw new Error("初期パスワードは8文字以上で入力してください。");
        }
        if (form.password !== form.confirmPassword) {
          throw new Error("確認用パスワードが一致しません。");
        }
        const created = await createUserAccount({
          ...form,
          department,
          branchId: selectedBranchIds[0] || "",
          branchIds: selectedBranchIds
        });
        setUsers((current) => [created, ...current.filter((user) => user.uid !== created.uid)]);
        setMessage("\u793e\u54e1\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u767b\u9332\u3057\u307e\u3057\u305f\u3002");
      }
      setForm(emptyForm);
      setEditingUid("");
    } catch (error) {
      console.error("[UserAdmin] Save user failed.", error);
      setError(error instanceof Error ? error.message : "\u793e\u54e1\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u4fdd\u5b58\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
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
    const label = nextStatus === "inactive" ? labels.disable : labels.enable;
    if (!window.confirm(`${user.name}\u3055\u3093\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u3092${label}\u3057\u307e\u3059\u304b\uff1f`)) return;
    setMessage("");
    setError("");
    try {
      const updated = await updateUserAccountStatus(user.uid, nextStatus);
      setUsers((current) => current.map((item) => (item.uid === updated.uid ? updated : item)));
      setMessage(`\u30a2\u30ab\u30a6\u30f3\u30c8\u3092${label}\u3057\u307e\u3057\u305f\u3002`);
    } catch (error) {
      console.error("[UserAdmin] Status update failed.", error);
      setError(error instanceof Error ? error.message : "\u30a2\u30ab\u30a6\u30f3\u30c8\u72b6\u614b\u3092\u5909\u66f4\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
    }
  }

  function openPasswordReset(user: UserAccount) {
    setResetTarget(user);
    setResetPasswordValue("");
    setResetPasswordConfirm("");
    setMessage("");
    setError("");
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    setMessage("");
    setError("");
    if (!resetPasswordValue.trim()) {
      setError("初期パスワードを入力してください。");
      return;
    }
    if (resetPasswordValue.length < 8) {
      setError("初期パスワードは8文字以上で入力してください。");
      return;
    }
    if (resetPasswordValue !== resetPasswordConfirm) {
      setError("確認用パスワードが一致しません。");
      return;
    }
    setResetSaving(true);
    try {
      const updated = await resetUserInitialPassword(resetTarget.uid, {
        password: resetPasswordValue,
        confirmPassword: resetPasswordConfirm
      });
      setUsers((current) => current.map((user) => (user.uid === updated.uid ? updated : user)));
      setResetTarget(null);
      setResetPasswordValue("");
      setResetPasswordConfirm("");
      setMessage("初期パスワードを再発行しました。対象社員は次回ログイン時に新しいパスワード設定が必要です。");
    } catch (error) {
      console.error("[UserAdmin] Initial password reset failed.", error);
      setError(error instanceof Error ? error.message : "初期パスワードを再発行できませんでした。");
    } finally {
      setResetSaving(false);
    }
  }

  const Shell = embedded ? "section" : "main";

  return (
    <Shell className={embedded ? "master-panel user-admin-embedded" : "admin-shell"}>
      {!embedded ? (
        <header className="admin-header">
          <div>
            <p className="eyebrow">{labels.settings}</p>
            <h1>{labels.title}</h1>
            <p className="small">{labels.description}</p>
          </div>
          <div className="toolbar">
            <AuthStatus />
            <a className="button-link" href="/dashboard">{labels.dashboard}</a>
            <a className="button-link" href="/admin/master">{labels.masterAdmin}</a>
          </div>
        </header>
      ) : null}

      <section className="user-admin-grid">
        <form className="user-admin-form" onSubmit={submit}>
          <h2>{editingUid ? labels.editEmployee : labels.newEmployee}</h2>
          <label>
            {labels.name}
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          {editingUid ? (
            <p className="small">{labels.loginId}: {form.email}</p>
          ) : (
            <>
              <label>
                {labels.email}
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} inputMode="email" />
              </label>
              <div className="two-column-fields">
                <label>
                  {labels.initialPassword}
                  <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" />
                </label>
                <label>
                  {labels.confirmPassword}
                  <input type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" />
                </label>
              </div>
            </>
          )}
          <fieldset className="master-field user-branch-field">
            <legend>{labels.affiliation}</legend>
            <div className="master-check-grid user-branch-grid">
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
            <p className="small">{labels.multiBranchHint}</p>
          </fieldset>
          <label className="user-role-field">
            {labels.role}
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AuthRole })}>
              <option value="staff">{userRoleLabel("staff")}</option>
              <option value="manager">{userRoleLabel("manager")}</option>
              <option value="planning">{userRoleLabel("planning")}</option>
              <option value="master">{userRoleLabel("master")}</option>
            </select>
          </label>
          <label>
            {labels.notes}
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? labels.saving : editingUid ? labels.saveEmployee : labels.addEmployee}
          </button>
          {editingUid ? <button type="button" onClick={cancelEdit}>{labels.cancelEdit}</button> : null}
        </form>

        <section className="user-admin-list">
          <div className="user-admin-list-header">
            <div>
              <h2>{labels.list}</h2>
              <p className="small">{loading ? labels.loading : `${filteredUsers.length}\u4ef6\u8868\u793a`}</p>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.searchPlaceholder} aria-label={labels.searchLabel} />
          </div>
          {message ? <p className="send-status success">{message}</p> : null}
          {error ? <p className="send-status error">{error}</p> : null}
          {resetTarget ? (
            <form className="password-reset-panel" onSubmit={submitPasswordReset}>
              <h3>{labels.resetInitialPassword}</h3>
              <p className="small">{resetTarget.name} さんの初期パスワードを再発行します。パスワードはFirestoreへ保存されません。</p>
              <div className="two-column-fields">
                <label>
                  {labels.newInitialPassword}
                  <input type="password" value={resetPasswordValue} onChange={(event) => setResetPasswordValue(event.target.value)} autoComplete="new-password" />
                </label>
                <label>
                  {labels.newInitialPasswordConfirm}
                  <input type="password" value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} autoComplete="new-password" />
                </label>
              </div>
              <div className="toolbar">
                <button className="primary" type="submit" disabled={resetSaving}>{resetSaving ? labels.saving : labels.resetPasswordButton}</button>
                <button type="button" onClick={() => setResetTarget(null)}>キャンセル</button>
              </div>
            </form>
          ) : null}
          <div className="admin-table-wrap">
            <table className="admin-table compact">
              <thead>
                <tr>
                  <th>{labels.name}</th>
                  <th>{labels.email}</th>
                  <th>{labels.affiliation}</th>
                  <th>{labels.role}</th>
                  <th>{labels.status}</th>
                  <th>{labels.createdAt}</th>
                  <th>{labels.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length ? (
                  filteredUsers.map((user) => (
                    <tr key={user.uid}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{branchNameText(branchIdsFromValue(user)) || user.department || "-"}</td>
                      <td>{userRoleLabel(user.role)}</td>
                      <td>
                        <span className="status-chip">{statusLabel(user.status)}</span>
                        {user.mustChangePassword ? <span className="status-chip warning">初回変更待ち</span> : null}
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="table-actions compact-actions">
                          <button type="button" onClick={() => startEdit(user)}>{labels.edit}</button>
                          <button type="button" onClick={() => openPasswordReset(user)}>{labels.reset}</button>
                          <button type="button" className={user.status === "active" ? "danger-button" : ""} onClick={() => changeStatus(user)}>
                            {user.status === "active" ? labels.disable : labels.enable}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-state">
                    <td colSpan={7}>{labels.noUsers}</td>
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
