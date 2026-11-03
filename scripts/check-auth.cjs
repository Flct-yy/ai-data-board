/** 直接看 getItemAsync 返回什么，以及为什么 _isValidSession 没过 */
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const { createServerClient } = require("@supabase/ssr");
const BAD_URL = "http://127.0.0.1:1";
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const urlObj = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const projectRef = urlObj.hostname.split(".")[0];
const STORAGE_KEY = `sb-${projectRef}-auth-token`;

// 完全匹配 auth-js createSession 返回的格式
const fakePayload = {
  sub: "fake-user-id",
  email: "fake@test.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  aud: "authenticated",
  role: "authenticated",
};
const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const p = Buffer.from(JSON.stringify(fakePayload)).toString("base64url");
const fakeAccess = `${h}.${p}.fake-sig`;
const sessionJson = JSON.stringify({
  access_token: fakeAccess,
  refresh_token: "fake-refresh-token-xyz",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "fake-user-id", email: "fake@test.com", role: "authenticated", aud: "authenticated" },
});

// 加 chunk 编码模拟（cookie 值可能很长，SSR wrapper 会分块）
function createChunks(key, value, maxSize = 4096) {
  if (value.length <= maxSize) return [{ name: key, value }];
  const chunks = [];
  for (let i = 0; i < value.length; i += maxSize) {
    chunks.push({ name: `${key}.${i / maxSize}`, value: value.slice(i, i + maxSize) });
  }
  return chunks;
}

// 方案 A：纯 JSON cookie（auth-js 原生 persistSession 格式）
const cookieJarA = new Map();
cookieJarA.set(STORAGE_KEY, { name: STORAGE_KEY, value: sessionJson });

// 方案 B：base64url 编码（SSR wrapper 默认）
const cookieJarB = new Map();
cookieJarB.set(STORAGE_KEY, { name: STORAGE_KEY, value: "base64-" + Buffer.from(sessionJson).toString("base64url") });

(async () => {
  for (const [label, cookieJar] of [["A: 纯 JSON", cookieJarA], ["B: base64url 编码", cookieJarB]]) {
    console.log(`\n== 方案 ${label} ==`);
    const supabase = createServerClient(BAD_URL, anon, {
      cookies: { getAll: async () => [...cookieJar.values()], setAll: async () => {} },
    });

    // SSR client 的 storage 是一个闭包变量，我们只能通过 auth-js 间接调用
    // 但可以打 monkey patch
    const storageRef = Object.getOwnPropertySymbols(supabase.auth).find(s => s.description?.includes("storage"));
    console.log("  storage symbol:", storageRef?.description);

    try {
      await supabase.auth.initialize();

      // 直接用 storage.getItem 看返回
      // storage 是 auth-js 内部的，我们试试 auth-js 模块内导出的 helpers
      const { getItemAsync } = require("@supabase/auth-js/dist/main/lib/helpers.js");
      const raw = await getItemAsync(supabase.auth._storage || supabase.auth.storage, STORAGE_KEY);
      console.log("  storage.getItem(STORAGE_KEY):", typeof raw, raw ? String(raw).slice(0, 80) : null);

      // 但 _storage 可能不存在，让我们直接调 auth-js 自己的 storage
      // auth-js v2 的 storage 是 _storage 或 __internalStorage
      const authAny = supabase.auth;
      console.log("  auth keys:", Object.keys(authAny).join(", "));

      // 让我们手动触发 __loadSession
      if (authAny.__loadSession) {
        const result = await authAny.__loadSession();
        console.log("  __loadSession result:", result?.data?.session ? "present" : null, "error:", result?.error);
      }

      const { data, error } = await supabase.auth.getSession();
      console.log("  getSession: session=", data.session ? "present" : null, "error:", error?.message);
    } catch (e) {
      console.log("  error:", e.message?.slice(0, 200));
    }
  }
})();
