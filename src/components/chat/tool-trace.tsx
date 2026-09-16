"use client";

import type { ToolUIPart } from "ai";

/**
 * 工具调用中间态可视化：把 ReAct 每步的 tool name + 参数 + 结果实时展示。
 * 让 agent 不是黑盒，用户能看到 think-act-observe 的过程。
 *
 * AI SDK v7：工具名在 part.type（格式 "tool-${name}"），
 * 结果在 invocation.output，状态用 "output-available" 判断完成。
 */
export function ToolTrace({ parts }: { parts: ToolUIPart<any>[] }) {
  return (
    <div className="mt-2 space-y-1 border-l-2 border-brand-200 pl-2">
      {parts.map((part, i) => {
        // 工具名：type 形如 "tool-make_chart"，去掉 "tool-" 前缀
        const toolName = part.type.replace(/^tool-/, "");

        // invocation 挂在 part 上，状态和输出都在这里
        const invocation = part;
        const state = invocation.state;
        const isComplete = state === "output-available";
        const isError = state === "output-error";

        return (
          <div key={i} className="text-xs text-gray-500">
            <span
              className={`inline-block rounded px-1.5 py-0.5 font-mono ${
                isComplete
                  ? "bg-green-50 text-green-700"
                  : isError
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {toolName}
            </span>

            <span className="ml-1">{isComplete ? "✓ 完成" : isError ? "✗ 出错" : "⏳ 执行中"}</span>

            {isComplete && invocation.output != null && (
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[10px]">
                {typeof invocation.output === "string"
                  ? invocation.output.slice(0, 300)
                  : JSON.stringify(invocation.output, null, 2).slice(0, 300)}
              </pre>
            )}

            {isError && invocation.errorText && (
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-red-50 p-2 text-[10px] text-red-700">
                {invocation.errorText.slice(0, 300)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
