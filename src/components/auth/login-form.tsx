"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh(); // 让 Server Component 重新读 cookie
      return;
    }

    // signup
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // 如果项目开启了邮箱确认，data.session 为 null
    if (!data.session) {
      setNotice("注册成功，请检查邮箱确认后再登录。");
      setMode("signin");
      setLoading(false);
      return;
    }

    // 未开启邮箱确认，直接登录成功
    router.push("/");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">邮箱</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="input"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">密码</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="input"
        />
      </div>

      {error && (
        <div className="alert-error">
          <span className="font-medium">登录失败</span>
          <span className="ml-1 opacity-80">：{error}</span>
        </div>
      )}
      {notice && (
        <div className="alert-success">
          <span>{notice}</span>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading
          ? mode === "signin"
            ? "登录中…"
            : "注册中…"
          : mode === "signin"
            ? "登录"
            : "注册"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError("");
          setNotice("");
        }}
        className="w-full text-center text-sm text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:text-brand-700"
      >
        {mode === "signin" ? "没有账号？注册" : "已有账号？登录"}
      </button>
    </form>
  );
}
