import { SessionActions } from "@/components/sessions/session-actions";
import type { Session } from "@/types";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const keyword = (q ?? "").trim().slice(0, 80);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  if (!authSession) redirect("/login");

  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn("[sessions] getUser failed, keeping session cookie:", userError.message);
  }

  let query = supabase.from("sessions").select("id,title,csv_schema,created_at");

  if (keyword) {
    const safe = keyword.replace(/[%_,()*]/g, " ").trim();
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,csv_schema->>fileName.ilike.%${safe}%`);
    }
  }

  const { data: sessions, error } = await query
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Session[]>();

  const rows = sessions ?? [];

  // Supabase JS 没有 group by，用一次轻量查询统计每个会话的报告数
  const reportCounts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: reportRows, error: countError } = await supabase
      .from("reports")
      .select("session_id")
      .in(
        "session_id",
        rows.map(row => row.id)
      );

    if (countError) {
      console.error("[sessions] report count error:", countError.message);
    } else {
      for (const row of reportRows ?? []) {
        const sessionId = (row as { session_id: string }).session_id;
        reportCounts.set(sessionId, (reportCounts.get(sessionId) ?? 0) + 1);
      }
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">我的数据集</h1>
          <p className="mt-1 text-sm text-gray-500">管理已上传的 CSV 与对应会话</p>
        </div>
        <Link
          href="/history"
          className="text-brand-600 hover:text-brand-700 text-sm hover:underline"
        >
          历史报告 →
        </Link>
      </header>

      <form method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={keyword}
          placeholder="搜索数据集名称或文件名…"
          className="input flex-1"
          aria-label="搜索数据集"
        />
        <button type="submit" className="btn-secondary shrink-0">
          搜索
        </button>
      </form>

      {error && (
        <div className="alert-error mb-6">
          <span className="font-medium">加载数据集失败</span>
          <span className="ml-1 opacity-80">：{error.message}</span>
        </div>
      )}

      {!error && rows.length === 0 && (
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
              d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm0 0h16M8 12h8"
            />
          </svg>
          <p className="text-gray-500">{keyword ? "没有匹配的数据集" : "还没有上传数据集"}</p>
          <Link
            href={keyword ? "/sessions" : "/"}
            className="text-brand-600 hover:text-brand-700 mt-2 text-sm underline underline-offset-2"
          >
            {keyword ? "查看全部数据集" : "上传 CSV 开始第一次分析 →"}
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map(session => (
            <li key={session.id}>
              <div className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/analyze/${session.id}`} className="block">
                      <p className="hover:text-brand-700 truncate font-medium text-gray-900">
                        {session.title || "未命名数据集"}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {session.csv_schema?.fileName ?? "未知文件"} ·{" "}
                        {session.csv_schema?.rowCount ?? 0} 行 · {reportCounts.get(session.id) ?? 0}{" "}
                        份报告
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        <time>{new Date(session.created_at).toLocaleString("zh-CN")}</time>
                      </p>
                    </Link>
                  </div>
                  <SessionActions sessionId={session.id} title={session.title || "未命名数据集"} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
