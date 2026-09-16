import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import type { AnalysisReport } from "@/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">历史分析报告</h1>
      <ul className="space-y-3">
        {(reports as AnalysisReport[] | null)?.map(r => (
          <li key={r.id} className="rounded-lg border border-gray-200 p-4">
            <p className="font-medium">{r.question}</p>
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{r.answer}</p>
            <time className="mt-2 block text-xs text-gray-400">
              {new Date(r.created_at).toLocaleString("zh-CN")}
            </time>
          </li>
        ))}
        {(!reports || reports.length === 0) && (
          <li className="text-sm text-gray-400">还没有分析报告</li>
        )}
      </ul>
    </main>
  );
}
