import { InteractiveChart } from "@/components/chart/interactive-chart";
import { Markdown } from "@/components/chat/markdown";
import { PrintButton } from "@/components/report/print-button";
import type { AnalysisReport } from "@/types";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 与 history/analyze 一致：getSession 判断是否登录，getUser 失败不误判
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn("[report] getUser failed, proceeding with session cookie:", userError.message);
  }

  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single<AnalysisReport>();

  if (error?.code === "PGRST116") notFound();
  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="alert-error">
          <span className="font-medium">加载报告失败</span>
          <span className="ml-1 opacity-80">：{error.message}</span>
        </div>
        <Link href="/history" className="text-brand-600 mt-4 inline-block text-sm hover:underline">
          ← 返回历史报告
        </Link>
      </main>
    );
  }
  if (!report) notFound();

  const chartSpecs = report.chart_specs ?? [];

  return (
    <main className="report-page mx-auto max-w-4xl px-4 py-10 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href="/history" className="text-brand-600 text-sm hover:underline">
          ← 历史报告
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/analyze/${report.session_id}`} className="btn-small-secondary">
            回到会话
          </Link>
          <PrintButton />
        </div>
      </div>

      <article>
        <header className="mb-6">
          <p className="text-xs text-gray-400">
            分析报告 · {new Date(report.created_at).toLocaleString("zh-CN")}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {report.question}
          </h1>
        </header>

        <section className="card p-5">
          <Markdown>{report.answer}</Markdown>
        </section>

        {chartSpecs.length > 0 && (
          <section className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">图表（{chartSpecs.length}）</h2>
            {chartSpecs.map((spec, index) => (
              <InteractiveChart key={index} spec={spec} />
            ))}
          </section>
        )}
      </article>
    </main>
  );
}
