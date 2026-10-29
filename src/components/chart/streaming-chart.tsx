"use client";

import { useMemo } from "react";
import { mergePartialSpec } from "@/lib/ai/chart-spec-schema";
import { InteractiveChart } from "./interactive-chart";
import type { ChartSpec } from "@/types";
import { useRef } from "react";

interface Props {
  /** 流式到达的 partial JSON 字符串，逐步合并渲染 */
  streamingJsonChunk?: string;
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
export function StreamingChart({ streamingJsonChunk, finalSpec, onSelectRange }: Props) {
  const prevSpecRef = useRef<ChartSpec | null>(null);

  const spec = useMemo<ChartSpec | null>(() => {
    if (finalSpec) {
      prevSpecRef.current = null;
      return finalSpec;
    }
    if (!streamingJsonChunk) return null;

    const partial = safePartialParse(streamingJsonChunk);
    const newSpec = mergePartialSpec(prevSpecRef.current, partial);
    console.log("newSpec", newSpec);
    prevSpecRef.current = newSpec;
    return newSpec;
  }, [streamingJsonChunk, finalSpec]);

  if (!spec) {
    return null;
  }

  return <InteractiveChart spec={spec} streaming={!finalSpec} onSelectRange={onSelectRange} />;
}

/**
 * 宽松解析不完整 JSON：补全缺失的闭合括号。
 * partial JSON 可能截断在任意位置，需容错。
 */
export function safePartialParse(s: string): unknown {
  const fixed = s.trim();
  if (fixed.length < 2) return null;

  const stack: string[] = []; // 记录未闭合的 { 或 [
  let inString = false;
  let escape = false;
  let lastChar = "";

  for (const c of fixed) {
    if (escape) {
      escape = false;
      lastChar = c;
      continue;
    }
    if (c === "\\") {
      escape = true;
      lastChar = c;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      lastChar = c;
      continue;
    }
    if (inString) {
      lastChar = c;
      continue;
    }

    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") {
      // 只在匹配时弹栈，避免多余闭合污染栈
      if (stack[stack.length - 1] === c) stack.pop();
    }
    lastChar = c;
  }

  let patched = fixed;

  // 1) 字符串没闭合，先补引号（注意：结尾若是孤立反斜杠要去掉）
  if (inString) {
    if (escape) patched = patched.slice(0, -1); // 去掉尾部孤立 \
    patched += '"';
  }

  // 2) 逆序补全所有未闭合的括号
  while (stack.length) patched += stack.pop();

  try {
    return JSON.parse(patched);
  } catch {
    return null;
  }
}
