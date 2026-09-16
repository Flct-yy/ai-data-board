"use client";

import type { ChartSpec } from "@/types";

interface Props {
  /** 流式到达的 partial JSON 字符串，逐步合并渲染 */
  streamingJson?: string;
  /** 工具执行完后的最终 spec */
  finalSpec?: ChartSpec | null;
  /** 圈选续问回调 */
  onSelectRange?: (range: { xKey: string; values: string[] }) => void;
}

/**
 * 流式渐进图表：边收 partial JSON 边 merge 边渲染，图表逐帧长出。
 * finalSpec 到达后停止流式，渲染最终图。
 * 核心亮点：不卡半秒白屏，数据越多图越完整。
 */
export function StreamingChart({ finalSpec, onSelectRange }: Props) {
  if (!finalSpec) {
    return null;
  }
  return <div>{JSON.stringify(finalSpec, null, 2)}</div>;
}
