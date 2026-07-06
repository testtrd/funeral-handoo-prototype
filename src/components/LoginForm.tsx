"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCurrentUser, getSafePathForUser, login } from "@/lib/authService";

export default function LoginForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) return;
    const params = new URLSearchParams(window.location.search);
    window.location.replace(getSafePathForUser(current, params.get("next")));
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const session = login(userId.trim(), password);
    if (!session) {
      setError("ユーザーIDまたはパスワードが正しくありません。");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    window.location.href = getSafePathForUser(session, params.get("next"));
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">業務引継書</p>
        <h1>ログイン</h1>
        <form onSubmit={submit} className="login-form">
          <label>
            ユーザーID
            <input value={userId} onChange={(event) => setUserId(event.target.value)} autoComplete="username" />
          </label>
          <label>
            パスワード
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit">ログイン</button>
        </form>
        <div className="login-hint">
          <strong>プロトタイプ用</strong>
          <span>admin / admin-pass</span>
          <span>driver01 / driver-pass</span>
          <span>office01 / office-pass</span>
        </div>
      </section>
    </main>
  );
}
