import type { UIMessage } from "ai";

/** messages 表的一行（服务端加载历史用） */
export interface HistoryRow {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  /** tool 行必填：OpenAI 兼容的 tool_call_id，用于回放与去重 */
  tool_call_id?: string | null;
  /** 同一轮写入的 created_at 相同，seq 提供稳定顺序 */
  seq?: number | null;
  created_at?: string | null;
}

/**
 * 按 (created_at, seq) 排序；seq 缺失时保持输入顺序。
 * 旧数据没有 seq 时仍可回放，只是同一时间戳内的顺序依赖数据库返回顺序。
 */
export function sortHistoryRows(rows: HistoryRow[]): HistoryRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const at = a.row.created_at ?? "";
      const bt = b.row.created_at ?? "";
      if (at !== bt) return at < bt ? -1 : 1;

      const as = a.row.seq ?? Number.MAX_SAFE_INTEGER;
      const bs = b.row.seq ?? Number.MAX_SAFE_INTEGER;
      if (as !== bs) return as - bs;

      return a.index - b.index;
    })
    .map(item => item.row);
}

/** onEnd 里序列化到 tool 行 content 的 JSON 结构 */
interface PersistedTool {
  toolName?: string;
  input?: unknown;
  output?: unknown;
}

/**
 * 把 messages 表的行转成 AI SDK 的 UIMessage[]，
 * 供 useChat 的 messages 选项恢复历史对话。
 *
 * - user/assistant 行 → 文本 part。
 * - tool 行（content 为 {toolName,input,output} 的 JSON）→ 还原为
 *   `tool-${toolName}` part 并挂到前一条 assistant 消息上，前端 ToolTrace 才能渲染。
 *   tool 行没有前驱 assistant 时丢弃，避免悬空。
 */
export function toUIMessages(rows: HistoryRow[]): UIMessage[] {
  const result: UIMessage[] = [];

  for (const row of sortHistoryRows(rows)) {
    if (row.role === "user" || row.role === "assistant") {
      result.push({
        id: row.id,
        role: row.role,
        parts: [{ type: "text", text: row.content }],
      });
      continue;
    }

    // role === "tool"：还原 tool part，挂到前一条 assistant 消息
    const host = result[result.length - 1];
    if (!host || host.role !== "assistant") continue;

    let parsed: PersistedTool;
    try {
      parsed = JSON.parse(row.content) as PersistedTool;
    } catch {
      parsed = {};
    }
    const toolName = parsed.toolName;
    if (typeof toolName !== "string") continue;

    host.parts.push({
      type: `tool-${toolName}`,
      toolCallId: row.tool_call_id ?? `tool-${row.id}`,
      state: "output-available",
      input: parsed.input,
      output: parsed.output,
    } as UIMessage["parts"][number]);
  }

  return result;
}
