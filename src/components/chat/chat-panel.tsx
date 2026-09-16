"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useState, useCallback } from "react";
import { StreamingChart } from "@/components/chart/streaming-chart";
import { ToolTrace } from "@/components/chat/tool-trace";
import type { ChartSpec, CsvSchema } from "@/types";

interface Props {
  sessionId: string;
  csvSchema: CsvSchema | null;
}

// 类型谓词：过滤并收窄 tool- 开头的 part
function isToolPart(
  p: UIMessage["parts"][number]
): p is Extract<UIMessage["parts"][number], { type: `tool-${string}` }> {
  return p.type.startsWith("tool-");
}
/**
 * 对话面板 + 图表区双栏布局。
 * 左栏对话流（含工具调用轨迹），右栏图表渐进出现。
 * 圈选图表 → 注入提问 → agent 续答。
 */
export function ChatPanel({ sessionId, csvSchema }: Props) {
  const [charts, setCharts] = useState<ChartSpec[]>([]);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    const specs: ChartSpec[] = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !m.parts) continue;
      for (const part of m.parts) {
        if (part.type === "tool-make_chart" && part.state === "output-available" && part.output) {
          specs.push(part.output as ChartSpec);
        }
      }
    }
    setCharts(specs);
  }, [messages]);

  const onSelectRange = useCallback((range: { xKey: string; values: string[] }) => {
    setInput(`请重点分析 ${range.xKey} 为 ${range.values.join("、")} 的数据，解释原因`);
  }, []);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {/* 对话区 */}
      <div className="flex w-1/2 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-2">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              问点什么开始分析吧，例如「分析各区域销售占比」
            </div>
          )}
          {messages.map(m => {
            const textParts = m.parts
              ?.filter(p => p.type === "text")
              .map(p => p.text)
              .join("");

            const toolParts = m.parts?.filter(isToolPart) ?? [];

            return (
              <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-brand-600 text-white"
                      : "border border-gray-200 bg-white"
                  }`}
                >
                  {textParts}
                </div>
                {m.role === "assistant" && toolParts.length > 0 && <ToolTrace parts={toolParts} />}
              </div>
            );
          })}
        </div>
        <form onSubmit={handleFormSubmit} className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="问点什么…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {isLoading ? "分析中…" : "发送"}
          </button>
        </form>
      </div>

      {/* 图表区 */}
      <div className="w-1/2 space-y-3 overflow-y-auto">
        {charts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            图表区：AI 生成的图表会在这里出现，可点击柱子圈选续问
          </div>
        ) : (
          charts.map((spec, i) => (
            <StreamingChart key={i} finalSpec={spec} onSelectRange={onSelectRange} />
          ))
        )}
      </div>
    </div>
  );
}
