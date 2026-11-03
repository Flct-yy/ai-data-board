import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { prepareMessagesForModel } from "@/lib/ai/context";

function user(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(id: string, text: string, extraParts: UIMessage["parts"] = []): UIMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }, ...extraParts] };
}

const chartPart = {
  type: "tool-make_chart",
  toolCallId: "call-1",
  state: "output-available",
  input: {
    type: "bar",
    title: "渠道销售",
    data: [{ channel: "A", sales: 1 }],
    xKey: "channel",
    yKey: "sales",
  },
  output: {
    type: "bar",
    title: "渠道销售",
    data: [{ channel: "A", sales: 1 }],
    xKey: "channel",
    yKey: "sales",
  },
} as unknown as UIMessage["parts"][number];

describe("prepareMessagesForModel", () => {
  it("保留最近 N 轮，更早对话压成 system 摘要", () => {
    const messages: UIMessage[] = [];
    for (let i = 1; i <= 8; i++) {
      messages.push(user(`u${i}`, `问题${i}`));
      messages.push(assistant(`a${i}`, `回答${i}`));
    }

    const prepared = prepareMessagesForModel(messages, { recentRounds: 2 });

    expect(prepared[0].role).toBe("system");
    expect(prepared).toHaveLength(5);
    expect(prepared[1].id).toBe("u7");
    expect(prepared[4].id).toBe("a8");

    const summary = prepared[0].parts[0];
    expect(summary.type).toBe("text");
    if (summary.type === "text") {
      expect(summary.text).toContain("问题1");
      expect(summary.text).not.toContain("问题8");
    }
  });

  it("图表 data 不进入上下文，但保留 toolCallId 配对", () => {
    const prepared = prepareMessagesForModel(
      [user("u1", "画个渠道图"), assistant("a1", "好的", [chartPart])],
      { recentRounds: 1 }
    );

    expect(prepared).toHaveLength(2);
    const toolPart = prepared[1].parts.find(part => part.type === "tool-make_chart");
    expect(toolPart).toMatchObject({ toolCallId: "call-1", state: "output-available" });

    const record = toolPart as unknown as Record<string, unknown>;
    expect(record.output).toMatchObject({ dataRowCount: 1, title: "渠道销售", data: [] });
    expect(record.input).toMatchObject({ dataRowCount: 1, data: [] });
  });

  it("非图表工具的超长输出会被截断", () => {
    const bigOutput = { rows: Array.from({ length: 100 }, (_, i) => ({ i, value: i })) };
    const toolPart = {
      type: "tool-run_stat",
      toolCallId: "call-2",
      state: "output-available",
      input: { metric: "sum" },
      output: bigOutput,
    } as unknown as UIMessage["parts"][number];

    const prepared = prepareMessagesForModel(
      [user("u1", "统计"), assistant("a1", "结果", [toolPart])],
      { recentRounds: 1 }
    );

    const output = (prepared[1].parts[1] as unknown as Record<string, unknown>).output;
    expect(typeof output).toBe("string");
    expect(String(output)).toContain("已截断");
  });
});
