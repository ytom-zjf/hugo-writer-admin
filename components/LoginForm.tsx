"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "登录失败");
        return;
      }

      router.replace("/posts");
      router.refresh();
    });
  }

  return (
    <form className="stacked-form spacer-top" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="password">管理员密码</label>
        <input
          autoComplete="current-password"
          id="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="输入 ADMIN_PASSWORD"
          type="password"
          value={password}
        />
      </div>

      {error ? <p className="status-text error-text">{error}</p> : null}

      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "登录中..." : "登录"}
      </button>
    </form>
  );
}
