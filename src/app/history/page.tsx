import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { AnalysisReport } from "@/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. getSession 只读本地 cookie（不发网络请求）—— 唯一可靠的"是否登录"判断
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  // 2. getUser 需要网络请求；失败时不跳转，只记录告警
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn("[history] getUser failed, keeping session cookie:", userError.message);
  }

  const { data: reports, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const isEmpty = !reports || reports.length === 0;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">历史分析报告</h1>
        <p className="mt-1 text-sm text-gray-500">查看过往的分析记录与结论</p>
      </header>

      {error && (
        <div className="alert-error mb-6">
          <span className="font-medium">加载报告失败</span>
          <span className="ml-1 opacity-80">：{error.message}</span>
        </div>
      )}

      {!error && isEmpty && (
        <div className="empty-state min-h-50">
          <svg
            className="mb-3 size-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-gray-500">还没有分析报告</p>
          <Link
            href="/"
            className="text-brand-600 hover:text-brand-700 mt-2 text-sm underline underline-offset-2"
          >
            上传 CSV 开始第一次分析 →
          </Link>
        </div>
      )}

      {!isEmpty && (
        <ul className="space-y-3">
          {(reports as AnalysisReport[])?.map(r => (
            <li key={r.id}>
              <Link
                href={`/reports/${r.id}`}
                className="card hover:border-brand-300 hover:shadow-card-hover block p-4 transition-all"
              >
                <p className="font-medium text-gray-900">{r.question}</p>
                <p className="mt-1.5 line-clamp-2 text-sm text-gray-500">{r.answer}</p>
                <div className="mt-2.5 flex items-center justify-between text-xs text-gray-400">
                  <time>{new Date(r.created_at).toLocaleString("zh-CN")}</time>
                  {r.chart_specs?.length > 0 && <span>{r.chart_specs.length} 张图表</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
