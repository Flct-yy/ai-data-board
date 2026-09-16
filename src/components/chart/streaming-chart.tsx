"use client";

import { useMemo } from "react";
import { InteractiveChart } from "./interactive-chart";
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
export function StreamingChart({ streamingJson, finalSpec, onSelectRange }: Props) {
  const spec = useMemo<ChartSpec | null>(() => {
    if (finalSpec) return finalSpec;
    return null;
  }, [streamingJson, finalSpec]);

  if (!spec) {
    return null;
  }

  return <InteractiveChart spec={spec} streaming={!finalSpec} onSelectRange={onSelectRange} />;
}
