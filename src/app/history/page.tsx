import { ReportDeleteButton } from "@/components/report/report-delete-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { AnalysisReport } from "@/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const keyword = (q ?? "").trim().slice(0, 80);

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

  let query = supabase.from("reports").select("*");

  if (keyword) {
    const safe = keyword.replace(/[%_,()*]/g, " ").trim();
    if (safe) {
      query = query.or(`question.ilike.%${safe}%,answer.ilike.%${safe}%`);
    }
  }

  const { data: reports, error } = await query
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<AnalysisReport[]>();

  const isEmpty = !reports || reports.length === 0;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">历史分析报告</h1>
          <p className="mt-1 text-sm text-gray-500">查看过往的分析记录与结论</p>
        </div>
        <Link
          href="/sessions"
          className="text-brand-600 hover:text-brand-700 text-sm hover:underline"
        >
          我的数据集 →
        </Link>
      </header>

      <form method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={keyword}
          placeholder="搜索问题或答案关键词…"
          className="input flex-1"
          aria-label="搜索报告"
        />
        <button type="submit" className="btn-secondary shrink-0">
          搜索
        </button>
      </form>

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
          <p className="text-gray-500">{keyword ? "没有匹配的报告" : "还没有分析报告"}</p>
          <Link
            href={keyword ? "/history" : "/"}
            className="text-brand-600 hover:text-brand-700 mt-2 text-sm underline underline-offset-2"
          >
            {keyword ? "查看全部报告" : "上传 CSV 开始第一次分析 →"}
          </Link>
        </div>
      )}

      {!isEmpty && (
        <ul className="space-y-3">
          {reports.map(report => (
            <li key={report.id}>
              <div className="card hover:border-brand-300 hover:shadow-card-hover p-4 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/reports/${report.id}`} className="block min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{report.question}</p>
                    <p className="mt-1.5 line-clamp-2 text-sm text-gray-500">{report.answer}</p>
                    <div className="mt-2.5 flex items-center justify-between text-xs text-gray-400">
                      <time>{new Date(report.created_at).toLocaleString("zh-CN")}</time>
                      {report.chart_specs?.length > 0 && (
                        <span>{report.chart_specs.length} 张图表</span>
                      )}
                    </div>
                  </Link>
                  <ReportDeleteButton reportId={report.id} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
