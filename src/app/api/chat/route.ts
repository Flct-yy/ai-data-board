import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { CsvSchema, ChartSpec } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// ===== 模拟数据 =====
const MOCK_ROWS: Record<string, unknown>[] = [
  { month: "1月", sales: 120 },
  { month: "2月", sales: 200 },
  { month: "3月", sales: 150 },
  { month: "4月", sales: 180 },
  { month: "5月", sales: 260 },
  { month: "6月", sales: 220 },
];

const MOCK_CSV_SCHEMA: CsvSchema = {
  columns: [
    { name: "month", type: "string" },
    { name: "sales", type: "number" },
  ],
} as CsvSchema;

// 图表配置（工具输出）
const MOCK_CHART_SPEC: ChartSpec = {
  type: "bar",
  title: "月度销量",
  xKey: "month",
  yKey: "sales",
  data: MOCK_ROWS as ChartSpec["data"],
};

// 延时工具，制造"工具调用等待"效果
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// ====================

export async function POST(req: Request) {
  const body = await req.json();
  console.log("[mock] body keys:", Object.keys(body));

  const sessionId = body.sessionId ?? "mock-session";
  console.log("[mock] sessionId:", sessionId);

  const assistantMessageId = "mock-assistant-1";
  const textId = "text-1";
  const toolCallId = "mock-tool-1";

  const stream = createUIMessageStream({
    originalMessages: [],
    execute: async ({ writer }) => {
      // ===== AI 消息开始 =====
      writer.write({ type: "start", messageId: assistantMessageId });
      writer.write({ type: "start-step" });

      // ----- 文本部分（流式）-----
      writer.write({ type: "text-start", id: textId });
      for (const chunk of ["好的", "，我来", "帮你生成", "月度销量", "柱状图", "。"]) {
        writer.write({ type: "text-delta", id: textId, delta: chunk });
        await sleep(80); // 模拟打字机
      }
      writer.write({ type: "text-end", id: textId });

      // ----- 工具调用：参数开始生成（等待中）-----
      writer.write({
        type: "tool-input-start",
        toolCallId,
        toolName: "make_chart",
      });
      await sleep(300);

      // ----- 工具调用：参数完整，准备执行（仍在等待）-----
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: "make_chart",
        input: { chartType: "bar", title: "月度销量" },
      });

      // ----- 工具执行中（前端可显示 loading）-----
      await sleep(800);

      // ----- 工具执行完成，输出可用 -----
      writer.write({
        type: "tool-output-available",
        toolCallId,
        output: MOCK_CHART_SPEC,
      });

      // ===== AI 消息结束 =====
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
