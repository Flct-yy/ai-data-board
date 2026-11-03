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
import { chartSpecSchema } from "@/lib/ai/chart-spec-schema";
import { prepareMessagesForModel } from "@/lib/ai/context";
import { shouldPersistReport } from "@/lib/chat/report";
import { indexReport } from "@/lib/rag/retrieve";
import type { CsvSchema, Session, ChartSpec } from "@/types";
import type { UIMessage } from "ai";

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
  const { messages, sessionId } = (await req.json()) as {
    messages: UIMessage[];
    sessionId: string;
  };
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 从数据库中获取当前会话信息
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single<Session>();

  // 前端 useChat 会发送完整历史消息（来自 DB 恢复 + 本次新增），
  // 服务端无需再按 DB 拉历史，直接用请求体里的 messages 作为模型上下文。

  // 从数据库中获取 CSV 数据
  const { data: csvData } = await supabase
    .from("csv_data")
    .select("rows")
    .eq("session_id", sessionId)
    .single<{ rows: Record<string, unknown>[] }>();

  const rows = csvData?.rows ?? [];
  const csv = (session?.csv_schema as CsvSchema | null) ?? null;
  const tools = createTools(rows);

  // 只保留最近几轮完整对话，更早内容压成摘要；图表 data 不进上下文
  // 在 user 边界切分，避免拆散 tool call / tool result 配对
  const modelMessages = await convertToModelMessages(prepareMessagesForModel(messages));

  const result = streamText({
    model: deepSeek("deepseek-flash"),
    // instructions 给模型看的 system prompt
    // 包含 CSV 行数据 + 工具描述
    instructions: buildSystemPrompt(csv),
    messages: modelMessages,
    tools,
    // filter → time/group → chart → 总结 至少需要 4-5 步，留出重试余量，放宽到 7
    stopWhen: isStepCount(7), // ReAct 最多 7 轮 think-act-observe
    // 完成后：持久化消息 + 提取 chart spec 存报告 + 写入向量表供 RAG
    onEnd: async ({ text, toolResults }) => {
      try {
        // 从消息中提取用户问题
        // 前端 useChat 发送的是 UIMessage[]，文本在 parts[].text 里（AI SDK v7 格式，无 .content 字段）。
        // 取最后一条 role==="user" 的消息，拼接其所有 text part 作为问题。
        const lastUser = [...messages].reverse().find(m => m.role === "user");
        const question = lastUser?.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map(p => p.text)
          .join("")
          .trim();

        // 持久化消息到数据库
        // 同一轮 insert 的 created_at 相同，用 seq 显式递增保证回放顺序
        const { data: lastSeq, error: seqError } = await supabase
          .from("messages")
          .select("seq")
          .eq("session_id", sessionId)
          .order("seq", { ascending: false })
          .limit(1)
          .maybeSingle<{ seq: number }>();
        if (seqError) {
          console.warn("[agent] seq query error:", seqError);
        }
        let nextSeq = (lastSeq?.seq ?? 0) + 1;

        const messageRows = [
          {
            session_id: sessionId,
            role: "user" as const,
            content: question || "(empty question)",
            seq: nextSeq++,
          },
          {
            session_id: sessionId,
            role: "assistant" as const,
            content: text || "",
            seq: nextSeq++,
          },
        ];
        // 工具信息也落库：每条工具调用存一条 role='tool' 行（messages 表支持 tool 角色 + tool_call_id 列）。
        // 用 JSON 序列化 input/output，便于调试与回放。
        const toolRows = toolResults.map(tr => ({
          session_id: sessionId,
          role: "tool" as const,
          content: JSON.stringify({
            toolName: tr.toolName,
            input: tr.input,
            output: tr.output,
          }),
          tool_call_id: tr.toolCallId ?? null,
          seq: nextSeq++,
        }));
        const { error: messagesError } = await supabase
          .from("messages")
          .insert([...messageRows, ...toolRows]);
        if (messagesError) {
          console.error("[agent] messages insert error:", messagesError);
        }

        // 提取 chart spec：统一过 Zod 校验，非法 spec 丢弃，避免污染 reports
        const chartSpecs: ChartSpec[] = [];
        for (const tr of toolResults) {
          if (tr.toolName !== "make_chart") continue;
          const parsed = chartSpecSchema.safeParse(tr.output);
          if (parsed.success) {
            chartSpecs.push(parsed.data as ChartSpec);
          } else {
            console.warn("[agent] invalid chart spec dropped:", parsed.error.issues);
          }
        }

        // 存储报告：有图表必写；纯文本要求有信息量且非寒暄/纯字段问答
        if (
          shouldPersistReport({
            question: question ?? "",
            answer: text ?? "",
            chartCount: chartSpecs.length,
          })
        ) {
          const { data: report, error: reportError } = await supabase
            .from("reports")
            .insert({
              session_id: sessionId,
              question,
              answer: text,
              chart_specs: chartSpecs,
            })
            .select("id")
            .single();

          if (reportError) {
            console.error("[agent] report insert error:", reportError);
          } else if (report) {
            // 写入向量表供 RAG；失败只记录，不影响本次报告
            try {
              await indexReport(report.id, sessionId, `${question}\n\n${text}`);
            } catch (indexError) {
              console.error("[agent] report index error:", indexError);
            }
          }
        }
      } catch (err) {
        console.error("[agent] persist error:", err);
      }
    },
  });

  // 把 streamText 的底层流转成 UI-message 协议流式返回（前端零改动）
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      // 默认 onError 只返回 "An error occurred."，会把真实原因吞掉
      onError: error => {
        console.error("[agent] stream error:", error);
        return error instanceof Error ? error.message : "模型调用失败";
      },
    }),
  });
}
