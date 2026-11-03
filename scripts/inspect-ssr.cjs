/** 直接看 Supabase SSR client 怎么处理 cookie */
const fs = require("fs");

// 先找到 @supabase/ssr 的实现
const ssrPath = require.resolve("@supabase/ssr");
console.log("@supabase/ssr:", ssrPath);
const ssrDir = require("path").dirname(ssrPath);

// 找 cookie 相关代码
const { execSync } = require("child_process");
try {
  const result = execSync(`Select-String -Path "${ssrDir}\\*.js" -Pattern "cookie|access_token|session_name" -List`, { encoding: "utf8" });
  console.log(result);
} catch (e) {
  console.log("grep error:", e.message.slice(0, 100));
}

// 或者直接列出来读
const { readdirSync } = require("fs");
const files = readdirSync(ssrDir, { recursive: true }).filter(f => f.endsWith(".js"));
console.log("\nSSR files:", files);

// 读主文件
const mainFile = require("path").join(ssrDir, "index.js");
if (fs.existsSync(mainFile)) {
  const content = fs.readFileSync(mainFile, "utf-8");
  const cookieLines = content.split("\n").filter(l => l.includes("cookie") || l.includes("Cookie") || l.includes("persistSession") || l.includes("setSession"));
  console.log("\nCookie related lines in index.js:");
  cookieLines.forEach(l => console.log("  ", l.trim().slice(0, 120)));
}
