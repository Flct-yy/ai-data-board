"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useState, useCallback, useRef } from "react";
import { StreamingChart } from "@/components/chart/streaming-chart";
import { ToolTrace } from "@/components/chat/tool-trace";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { shouldShowTypingIndicator } from "@/lib/chat/typing";
import type { ChartSpec, CsvSchema } from "@/types";
import { Markdown } from "@/components/chat/markdown";

interface Props {
  sessionId: string;
  csvSchema: CsvSchema | null;
  initialMessages?: UIMessage[];
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
export function ChatPanel({ sessionId, csvSchema, initialMessages }: Props) {
  const [charts, setCharts] = useState<ChartSpec[]>([]);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
    }),
    messages: initialMessages,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const showTyping = shouldShowTypingIndicator({
    status,
    messages,
    hasError: Boolean(error),
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTyping) return;
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [showTyping]);

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

  // 当前正在流式输入的 tool part（取最新一条即可）
  const streamingChunk = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant" || !m.parts) continue;
      for (const part of m.parts) {
        if (part.type === "tool-make_chart" && part.state === "input-streaming") {
          // 字段名以你的 AI SDK 版本为准：inputText / argsText / input
          return (part as any).inputText ?? (part as any).argsText ?? "";
        }
      }
    }
    return null;
  })();

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
    <div className="flex flex-1 flex-col gap-4 overflow-hidden md:flex-row">
      {/* 对话区 */}
      <div className="flex w-full flex-col md:w-1/2">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1 md:pr-2">
          {messages.length === 0 && (
            <div className="empty-state h-full min-h-50">
              <svg
                className="mb-3 size-8 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p>问点什么开始分析吧</p>
              <p className="mt-1 text-xs text-gray-400">例如「分析各区域销售占比」</p>
            </div>
          )}
          {messages.map((m, index) => {
            const textParts = m.parts
              ?.filter(p => p.type === "text")
              .map(p => p.text)
              .join("");

            const toolParts = m.parts?.filter(isToolPart) ?? [];

            return (
              <div key={m.id + index} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="bubble-user">{textParts.trim()}</div>
                ) : (
                  <div className="bubble-ai">
                    <Markdown>{textParts}</Markdown>
                  </div>
                )}
                {m.role === "assistant" && toolParts.length > 0 && <ToolTrace parts={toolParts} />}
              </div>
            );
          })}
          {showTyping && <TypingIndicator />}
          {error && (
            <div className="alert-error">
              <span className="font-medium">请求失败</span>
              <span className="ml-1 opacity-80">：{error.message}</span>
            </div>
          )}
        </div>
        <form onSubmit={handleFormSubmit} className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="问点什么… 例如「分析各品类的销售趋势」"
            className="input flex-1"
          />
          <button type="submit" disabled={isLoading} className="btn-primary shrink-0">
            {isLoading ? "分析中…" : "发送"}
          </button>
        </form>
      </div>

      {/* 图表区 */}
      <div className="w-full space-y-3 overflow-y-auto md:w-1/2">
        {streamingChunk != null && (
          <StreamingChart streamingJsonChunk={streamingChunk} onSelectRange={onSelectRange} />
        )}

        {charts.length === 0 && streamingChunk == null ? (
          <div className="empty-state h-full min-h-70">
            <svg
              className="mb-3 size-8 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <p>AI 生成的图表会在这里出现</p>
            <p className="mt-1 text-xs text-gray-400">可点击柱子圈选后注入上下文续问</p>
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
