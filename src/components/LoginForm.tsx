"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCurrentUser, getSafePathForUser, login, sendPasswordReset } from "@/lib/authService";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) return;
    const params = new URLSearchParams(window.location.search);
    window.location.replace(getSafePathForUser(current, params.get("next")));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.session) {
      setError(result.error || "メールアドレスまたはパスワードが違います。");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    window.location.href = getSafePathForUser(result.session, params.get("next"));
  }

  async function resetPassword() {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("パスワード再設定にはLINE WORKSメールアドレスを入力してください。");
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordReset(email);
      setMessage("パスワード再設定メールを送信しました。LINE WORKSのメールをご確認ください。");
    } catch (error) {
      console.error("[Auth] Password reset failed.", error);
      setError("パスワード再設定メールを送信できませんでした。メールアドレスをご確認ください。");
    } finally {
      setResetSending(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">業務引継書</p>
        <h1>ログイン</h1>
        <form onSubmit={submit} className="login-form">
          <label>
            LINE WORKSメールアドレス
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              inputMode="email"
            />
          </label>
          <label>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="send-status success">{message}</p> : null}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
        <button className="link-button" type="button" onClick={resetPassword} disabled={resetSending}>
          {resetSending ? "送信中..." : "パスワードを忘れた場合"}
        </button>
      </section>
    </main>
  );
}
