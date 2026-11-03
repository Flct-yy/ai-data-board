import { ChatPanel } from "@/components/chat/chat-panel";
import { DataProfilePanel } from "@/components/upload/data-profile";
import { toUIMessages, type HistoryRow } from "@/lib/chat/history";
import type { Session } from "@/types";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
export const dynamic = "force-dynamic";

export default async function AnalyzePage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. getSession 只读本地 cookie（不发网络请求）—— 唯一可靠的"是否登录"判断
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  if (!authSession) redirect("/login");

  // 2. getUser 需要网络请求；失败时不跳转
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn("[analyze] getUser failed, proceeding with session cookie:", userError.message);
  }

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single<Session>();

  if (sessionErr || !session) {
    notFound();
  }

  // 加载历史消息，传给前端恢复对话
  const { data: historyRows, error: historyErr } = await supabase
    .from("messages")
    .select("id,role,content,tool_call_id,seq,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("seq", { ascending: true });

  if (historyErr) {
    // 历史消息加载失败不阻断，前端至少能正常开始新对话
    console.error("[analyze] history load error:", historyErr.message);
  }

  return (
    <main className="mx-auto flex h-screen max-w-7xl flex-col p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{session.title ?? "数据分析"}</h1>
          <p className="text-xs text-gray-500">
            {session.csv_schema?.fileName} · {session.csv_schema?.rowCount} 行
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sessions" className="text-brand-600 text-sm hover:underline">
            我的数据集
          </Link>
          <Link href="/history" className="text-brand-600 text-sm hover:underline">
            历史报告
          </Link>
        </div>
      </header>
      <DataProfilePanel
        profile={session.csv_schema?.profile}
        sessionId={sessionId}
        glossary={session.csv_schema?.glossary}
      />
      <ChatPanel
        sessionId={sessionId}
        csvSchema={session.csv_schema}
        initialMessages={toUIMessages((historyRows ?? []) as HistoryRow[])}
      />
    </main>
  );
}
