import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  // 已登录用户直接跳回首页
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">登录</h1>
        <p className="mt-1 text-sm text-gray-500">登录后即可上传 CSV 并使用 AI 分析</p>
      </header>

      <LoginForm />
    </main>
  );
}
