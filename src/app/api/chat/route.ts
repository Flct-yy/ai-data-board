import {
  streamText,
  isStepCount,
  convertToModelMessages,
  toUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { deepSeek } from "@ai-sdk/deepseek";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { indexReport } from "@/lib/rag/retrieve";
import type { CsvSchema, Session, ChartSpec } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Agent 核心：streamText + tools + stopWhen(isStepCount) 跑 ReAct。
 * 流程：取历史消息 + CSV 行 → 组装 system prompt → 多步工具调用 →
 *       用 toUIMessageStream 转成 UI-message 协议流式返回（前端零改动）。
 * 完成后：持久化消息 + 提取 chart spec 存报告 + 写入向量表供 RAG。
 */
export async function POST(req: Request) {
  // 从请求体中提取消息和会话 ID
  const { messages, sessionId } = await req.json();
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 从数据库中获取当前会话信息
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single<Session>();

  // 从数据库中获取历史消息最近 20 条消息
  const { data: historyRows } = await supabase
    .from("messages")
    .select("role,content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  // 从数据库中获取 CSV 数据
  const { data: csvData } = await supabase
    .from("csv_data")
    .select("rows")
    .eq("session_id", sessionId)
    .single<{ rows: Record<string, unknown>[] }>();

  const rows = csvData?.rows ?? [];
  const csv = (session?.csv_schema as CsvSchema | null) ?? null;
  const tools = createTools(rows);

  // convertToModelMessages 返回 Promise，需要 await
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: deepSeek("deepseek-flash"),
    // instructions 给模型看的 system prompt
    // 包含历史消息 + CSV 行数据 + 工具描述
    instructions: buildSystemPrompt(csv),
    messages: [
      ...(historyRows ?? []).map(m => ({
        role: m.role as "user" | "assistant" | "tool",
        content: m.content,
      })),
      ...modelMessages,
    ],
    tools,
    stopWhen: isStepCount(5), // ReAct 最多 5 轮 think-act-observe
    // 完成后：持久化消息 + 提取 chart spec 存报告 + 写入向量表供 RAG
    onEnd: async ({ text, toolResults }) => {
      try {
        // 从消息中提取用户问题
        // 假设用户问题在消息列表的最后一条
        const lastUser = messages[messages.length - 1];
        const question = typeof lastUser?.content === "string" ? lastUser.content : "";

        // 持久化消息到数据库
        // 包含用户问题和模型回复
        await supabase.from("messages").insert([
          { session_id: sessionId, role: "user", content: question },
          { session_id: sessionId, role: "assistant", content: text },
        ]);

        // 提取 chart spec 到数据库
        // 从所有 toolResults 里提取 make_chart 的 output
        const chartSpecs: ChartSpec[] = [];
        for (const tr of toolResults) {
          if (tr.toolName === "make_chart") {
            const output = tr.output as unknown as ChartSpec | undefined;
            if (output && typeof output === "object" && "type" in output) {
              chartSpecs.push(output);
            }
          }
        }

        // 存储报告到数据库
        // 包含用户问题、模型回复、chart spec
        if (question && (chartSpecs.length > 0 || text)) {
          const { data: report } = await supabase
            .from("reports")
            .insert({
              session_id: sessionId,
              question,
              answer: text,
              chart_specs: chartSpecs,
            })
            .select("id")
            .single();

          // 写入向量表供 RAG
          if (report) {
            await indexReport(report.id, sessionId, `${question}\n\n${text}`);
          }
        }
      } catch (err) {
        console.error("[agent] persist error:", err);
      }
    },
  });

  // 把 streamText 的底层流转成 UI-message 协议流式返回（前端零改动）
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
}
