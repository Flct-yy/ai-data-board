import { ChatPanel } from "@/components/chat/chat-panel";
import type { Session } from "@/types";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
export const dynamic = "force-dynamic";

export default async function AnalyzePage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single<Session>();

  if (!session) notFound();
  return (
    <main className="mx-auto flex h-screen max-w-7xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{"数据分析"}</h1>
          <p className="text-xs text-gray-500">5 行</p>
        </div>
        <a href="/history" className="text-sm text-brand-600 hover:underline">
          历史报告
        </a>
      </header>
      <ChatPanel sessionId={sessionId} csvSchema={session.csv_schema} />
    </main>
  );
}
