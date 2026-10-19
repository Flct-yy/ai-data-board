import { tool } from "ai";
import { z } from "zod";
import { searchHistory } from "@/lib/rag/retrieve";
import type { ChartSpec } from "@/types";

type Metric = "sum" | "avg" | "count" | "max" | "min";

function aggregate(vals: number[], metric: Metric): number {
  switch (metric) {
    case "sum":
      return vals.reduce((a, b) => a + b, 0);
    case "avg":
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    case "count":
      return vals.length;
    case "max":
      return vals.length ? Math.max(...vals) : 0;
    case "min":
      return vals.length ? Math.min(...vals) : 0;
    default:
      return 0;
  }
}

/**
 * 定义 agent 可调用的工具集。每个工具是原子函数，LLM 按 ReAct 自行选择。
 * - run_stat: 对 CSV 行数据跑统计（内存计算，无需外部服务）
 * - make_chart: 生成图表规格（返回结构化 ChartSpec）
 * - search_history: RAG 检索历史分析报告
 */
export function createTools(rows: Record<string, unknown>[]) {
  return {
    run_stat: tool({
      description: "对数据跑统计（sum/avg/count/max/min）。可按某字段分组聚合。返回数值结果。",
      inputSchema: z.object({
        metric: z.enum(["sum", "avg", "count", "max", "min"]).describe("要计算的指标"),
        groupBy: z.string().optional().describe("分组字段名，不填则全局聚合"),
        valueField: z.string().optional().describe("聚合的数值字段"),
      }),
      execute: async ({ metric, groupBy, valueField }) => {
        if (!groupBy) {
          const vals = valueField
            ? rows.map(r => Number(r[valueField])).filter(v => !isNaN(v))
            : [];
          return { metric, valueField, result: aggregate(vals, metric) };
        }
        const groups = new Map<string, number[]>();
        for (const r of rows) {
          const key = String(r[groupBy]);
          const val = valueField ? Number(r[valueField]) : 1;
          if (!groups.has(key)) groups.set(key, []);
          if (!isNaN(val)) groups.get(key)!.push(val);
        }
        const agg = Array.from(groups.entries()).map(([key, vals]) => ({
          [groupBy]: key,
          [valueField ?? "value"]: aggregate(vals, metric),
        }));
        return { metric, groupBy, valueField, result: agg };
      },
    }),

    make_chart: tool({
      description:
        "生成图表规格。必须返回结构化 ChartSpec：type(bar/line/pie/scatter/area)、title、data(可直接渲染的数组)、xKey、yKey。一次可调用多次生成多张图。",
      inputSchema: z.object({
        type: z.enum(["bar", "line", "pie", "scatter", "area"]),
        title: z.string(),
        data: z
          .array(z.record(z.string(), z.union([z.string(), z.number()])))
          .describe("可直接喂给图表的最终数组"),
        xKey: z.string(),
        yKey: z.string(),
        description: z.string().optional(),
      }),
      execute: async spec => spec as ChartSpec,
    }),

    search_history: tool({
      description: "检索历史分析报告，找相似问题的过往分析结果。涉及对比/趋势时使用。",
      inputSchema: z.object({
        question: z.string().describe("要检索的问题"),
      }),
      execute: async ({ question }) => {
        const context = await searchHistory(question, 5);
        return context || "没有找到相关的历史分析。";
      },
    }),
  };
}
