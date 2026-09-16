"use client";

import type { CsvSchema } from "@/types";
interface Props {
  sessionId: string;
  csvSchema: CsvSchema | null;
}

/**
 * 对话面板 + 图表区双栏布局。
 * 左栏对话流（含工具调用轨迹），右栏图表渐进出现。
 * 圈选图表 → 注入提问 → agent 续答。
 */
export function ChatPanel({ sessionId, csvSchema }: Props) {
  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {/* 对话区 */}
      <div className="flex w-1/2 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-2">
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            问点什么开始分析吧，例如「分析各区域销售占比」
          </div>
        </div>
        <form className="mt-3 flex gap-2">
          <input
            placeholder="问点什么…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {"发送"}
          </button>
        </form>
      </div>

      {/* 图表区 */}
      <div className="w-1/2 space-y-3 overflow-y-auto">
        <div className="flex h-full items-center justify-center text-sm text-gray-400">
          图表区：AI 生成的图表会在这里出现，可点击柱子圈选续问
        </div>
      </div>
    </div>
  );
}
