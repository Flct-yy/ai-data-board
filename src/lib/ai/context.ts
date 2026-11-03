import type { UIMessage } from "ai";

const DEFAULT_RECENT_ROUNDS = 6;
const MAX_SUMMARY_CHARS = 1200;
const MAX_SUMMARY_LINE_CHARS = 180;
const MAX_TOOL_OUTPUT_CHARS = 600;

type AnyPart = UIMessage["parts"][number];

export interface PrepareOptions {
  /** 保留最近多少轮 user 消息，默认 6 轮 */
  recentRounds?: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map(part => part.text)
    .join("")
    .trim();
}

/** 规则压缩更早的对话：只保留文本问答，不保留工具结果 */
function summarizeOlder(messages: UIMessage[]): string {
  const lines: string[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = textOf(message);
    if (!text) continue;
    lines.push(
      `${message.role === "user" ? "问" : "答"}：${truncate(text, MAX_SUMMARY_LINE_CHARS)}`
    );
  }

  let summary = lines.join("\n");
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = `…${summary.slice(-MAX_SUMMARY_CHARS)}`;
  }
  return summary ? `此前对话摘要（规则压缩，仅保留文本）：\n${summary}` : "";
}

/** 图表 payload 不进入模型上下文，只保留元信息和行数 */
function sanitizeChartPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const record = { ...(value as Record<string, unknown>) };
  if (Array.isArray(record.data)) {
    record.dataRowCount = record.data.length;
    // 保留空数组而不是删除字段，避免 tool schema 校验时因缺 data 报错
    record.data = [];
  }
  return record;
}

/** 非图表工具输出截断成短字符串，避免 run_stat 大结果占满上下文 */
function sanitizeToolOutput(output: unknown): unknown {
  if (output === undefined) return output;
  const json = JSON.stringify(output);
  if (json === undefined || json.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  return `${json.slice(0, MAX_TOOL_OUTPUT_CHARS)}…（已截断）`;
}

function sanitizePart(part: AnyPart): AnyPart {
  if (!part.type.startsWith("tool-")) return part;

  const record = { ...part } as Record<string, unknown>;

  if (part.type === "tool-make_chart") {
    if ("input" in record) record.input = sanitizeChartPayload(record.input);
    if ("output" in record) record.output = sanitizeChartPayload(record.output);
  } else if ("output" in record) {
    record.output = sanitizeToolOutput(record.output);
  }

  return record as unknown as AnyPart;
}

/**
 * 控制发送给模型的上下文：
 * - 保留最近 N 轮完整消息（只在 user 边界切分，保证 tool call / result 配对）。
 * - 更早的消息压成一条 system 摘要，不含 tool part。
 * - 图表 data 与非图表工具输出做裁剪，避免 token 随轮次无限增长。
 */
export function prepareMessagesForModel(
  messages: UIMessage[],
  options: PrepareOptions = {}
): UIMessage[] {
  const recentRounds = options.recentRounds ?? DEFAULT_RECENT_ROUNDS;
  const userIndexes = messages.flatMap((message, index) =>
    message.role === "user" ? [index] : []
  );

  const keepStart =
    userIndexes.length > recentRounds ? userIndexes[userIndexes.length - recentRounds] : 0;

  const older = messages.slice(0, keepStart);
  const recent = messages.slice(keepStart).map(message => ({
    ...message,
    parts: message.parts.map(sanitizePart),
  }));

  if (older.length === 0) return recent;

  const summary = summarizeOlder(older);
  if (!summary) return recent;

  return [
    {
      id: "context-summary",
      role: "system",
      parts: [{ type: "text", text: summary }],
    },
    ...recent,
  ];
}
