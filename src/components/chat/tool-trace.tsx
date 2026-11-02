"use client";

import { useState } from "react";
import type { ToolUIPart } from "ai";

/**
 * 工具调用中间态可视化：把 ReAct 每步的 tool name + 参数 + 结果实时展示。
 * 让 agent 不是黑盒，用户能看到 think-act-observe 的过程。
 *
 * AI SDK v7：工具名在 part.type（格式 "tool-${name}"），
 * 结果在 invocation.output，状态用 "output-available" 判断完成。
 */
export function ToolTrace({ parts }: { parts: ToolUIPart<any>[] }) {
  const [open, setOpen] = useState(false);

  if (!parts.length) return null;

  return (
    <div className="mt-2 ml-1 border-l-2 border-brand-200 pl-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:text-brand-600"
      >
        <span
          className={`inline-block transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="font-medium">工具调用</span>
        <span className="text-gray-400">（{parts.length}）</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {parts.map((part, i) => {
            // 工具名：type 形如 "tool-make_chart"，去掉 "tool-" 前缀
            const toolName = part.type.replace(/^tool-/, "");
            const state = part.state;
            const isComplete = state === "output-available";
            const isError = state === "output-error";

            return (
              <div key={i} className="text-xs text-gray-500">
                <span
                  className={`inline-block rounded-md px-2 py-0.5 font-mono text-[11px] transition-colors ${
                    isComplete
                      ? "bg-green-50 text-green-700"
                      : isError
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {toolName}
                </span>
                <span className="ml-1.5 text-gray-400">
                  {isComplete ? "✓ 完成" : isError ? "✗ 出错" : "⏳ 执行中"}
                </span>

                {isComplete && part.output != null && (
                  <pre className="mt-1.5 max-h-32 overflow-auto rounded-md border border-gray-100 bg-gray-50 p-2 text-[10px] leading-relaxed">
                    {typeof part.output === "string"
                      ? part.output.slice(0, 300)
                      : JSON.stringify(part.output, null, 2).slice(0, 300)}
                  </pre>
                )}

                {isError && part.errorText && (
                  <pre className="mt-1.5 max-h-32 overflow-auto rounded-md border border-red-100 bg-red-50 p-2 text-[10px] leading-relaxed text-red-700">
                    {part.errorText.slice(0, 300)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
