import { describe, expect, it } from "vitest";
import { sortHistoryRows, toUIMessages, type HistoryRow } from "@/lib/chat/history";

const created_at = "2026-11-03T10:00:00.000Z";

const rows: HistoryRow[] = [
  {
    id: "tool-1",
    role: "tool",
    content: JSON.stringify({ toolName: "make_chart", input: {}, output: { type: "bar" } }),
    tool_call_id: "call-1",
    seq: 3,
    created_at,
  },
  { id: "user-1", role: "user", content: "画个图", seq: 1, created_at },
  { id: "assistant-1", role: "assistant", content: "好的", seq: 2, created_at },
];

describe("sortHistoryRows", () => {
  it("created_at 并列时按 seq 排序", () => {
    expect(sortHistoryRows(rows).map(r => r.id)).toEqual(["user-1", "assistant-1", "tool-1"]);
  });

  it("缺少 seq 时保持输入顺序", () => {
    const noSeq = [
      { id: "a", role: "user" as const, content: "" },
      { id: "b", role: "assistant" as const, content: "" },
      { id: "c", role: "tool" as const, content: "" },
    ];
    expect(sortHistoryRows(noSeq).map(r => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("toUIMessages", () => {
  it("并列 created_at 时仍把 tool part 挂到正确的 assistant", () => {
    const messages = toUIMessages(rows);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].parts).toHaveLength(2);
    expect(messages[1].parts[1]).toMatchObject({
      type: "tool-make_chart",
      toolCallId: "call-1",
      state: "output-available",
    });
  });
});
