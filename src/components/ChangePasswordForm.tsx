"use client";

import { FormEvent, useEffect, useState } from "react";
import { logout, markPasswordChangeCompleted, refreshCurrentUserProfile } from "@/lib/authService";
import { updateCurrentFirebasePassword } from "@/lib/firebaseClient";

function passwordErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code || "") : "";
  if (code === "auth/requires-recent-login") {
    return "安全のため、もう一度初期パスワードでログインしてから設定してください。";
  }
  if (code === "auth/weak-password") {
    return "パスワードは8文字以上で入力してください。";
  }
  return error instanceof Error ? error.message : "パスワードの変更に失敗しました。もう一度お試しください。";
}

export default function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkUser() {
      const current = await refreshCurrentUserProfile();
      if (cancelled) return;
      if (!current) {
        window.location.replace("/login?next=%2Fchange-password");
        return;
      }
      if (!current.mustChangePassword) {
        window.location.replace("/dashboard");
      }
    }
    void checkUser();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!password.trim()) {
      setError("パスワードを入力してください。");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }
    if (password !== confirmPassword) {
      setError("確認用パスワードが一致しません。");
      return;
    }

    setSaving(true);
    try {
      await updateCurrentFirebasePassword(password);
      await markPasswordChangeCompleted();
      setMessage("パスワードを設定しました。");
      window.setTimeout(() => {
        window.location.href = "/dashboard";
      }, 700);
    } catch (error) {
      console.error("[ChangePassword] Password update failed.", error);
      setError(passwordErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function logoutAndGoLogin() {
    await logout().catch(() => undefined);
    window.location.href = "/login";
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">初回設定</p>
        <h1>初回パスワード設定</h1>
        <p className="small">初期パスワードから、ご自身で使用する新しいパスワードへ変更してください。</p>
        <form className="login-form" onSubmit={submit}>
          <label>
            新しいパスワード
            <span className="password-input-row">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? "非表示" : "表示"}
              </button>
            </span>
          </label>
          <label>
            新しいパスワード確認
            <span className="password-input-row">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowConfirmPassword((current) => !current)}>
                {showConfirmPassword ? "非表示" : "表示"}
              </button>
            </span>
          </label>
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="send-status success">{message}</p> : null}
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "設定中..." : "パスワードを設定する"}
          </button>
        </form>
        <button className="link-button" type="button" onClick={logoutAndGoLogin}>
          ログアウト
        </button>
      </section>
    </main>
  );
}
