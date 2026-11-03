import { tool } from "ai";
import { z } from "zod";
import { findAnomalies, runStat } from "@/lib/ai/stats";
import { searchHistory } from "@/lib/rag/retrieve";
import type { ChartSpec } from "@/types";

const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
]);

export const statFilterSchema = z.object({
  field: z.string().describe("过滤字段名，必须是数据里真实存在的列"),
  op: z
    .enum(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"])
    .describe("比较操作，in 的 value 需要是数组"),
  value: filterValueSchema.describe("比较值，枚举值必须来自数据本身"),
});

/**
 * 工具入参 schema。prompt 与测试都从这里取参数名，避免两处手写漂移。
 * 新增字段全部可选，兼容已有的 run_stat 调用。
 */
export const runStatInputSchema = z.object({
  metric: z.enum(["sum", "avg", "count", "max", "min"]).describe("要计算的指标"),
  groupBy: z.string().optional().describe("分组字段名，不填则全局聚合"),
  valueField: z.string().optional().describe("聚合的数值字段，count 可不填"),
  filters: z.array(statFilterSchema).optional().describe("过滤条件，多个条件是 AND 关系"),
  timeField: z.string().optional().describe("日期字段名；填写后按时间桶聚合"),
  timeBucket: z
    .enum(["day", "week", "month", "quarter", "year"])
    .optional()
    .describe("时间粒度，缺省 month"),
  distinct: z.boolean().optional().describe("按 valueField 去重计数"),
  topN: z.number().int().min(1).max(50).optional().describe("分组结果只取前 N 组，最大 50"),
});

export const makeChartInputSchema = z.object({
  type: z.enum(["bar", "line", "pie", "scatter", "area"]),
  title: z.string(),
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .describe("可直接喂给图表的最终数组"),
  xKey: z.string(),
  yKey: z.string(),
  xLabel: z.string().optional().describe("X 轴标题，缺省用字段名"),
  yLabel: z.string().optional().describe("Y 轴标题，缺省用字段名"),
  xUnit: z.string().optional().describe("X 轴单位，如 年 / 月 / 人"),
  yUnit: z.string().optional().describe("Y 轴单位，如 元 / % / 人"),
  description: z.string().optional().describe("图表补充说明"),
});

export const searchHistoryInputSchema = z.object({
  question: z.string().describe("要检索的问题"),
});

export const findAnomaliesInputSchema = z.object({
  field: z.string().describe("要检查的数值字段名"),
  groupBy: z.string().optional().describe("按该字段分组后分别检测异常"),
  method: z.enum(["zscore", "iqr"]).optional().describe("异常检测方法，缺省 zscore"),
  threshold: z.number().positive().optional().describe("阈值，zscore 缺省 2.5，iqr 缺省 1.5"),
});

/**
 * 定义 agent 可调用的工具集。每个工具是原子函数，LLM 按 ReAct 自行选择。
 * - run_stat: 对 CSV 行数据跑统计（内存计算，无需外部服务）
 * - find_anomalies: 按 zscore / IQR 找偏离最大的行或组
 * - make_chart: 生成图表规格（返回结构化 ChartSpec）
 * - search_history: RAG 检索历史分析报告
 */
export function createTools(rows: Record<string, unknown>[]) {
  return {
    run_stat: tool({
      description:
        "对数据跑统计：支持过滤(filter)、时间分桶(timeBucket)、分组(groupBy)、去重计数(distinct)、topN。返回数值或分组结果。",
      inputSchema: runStatInputSchema,
      execute: async ({
        metric,
        groupBy,
        valueField,
        filters,
        timeField,
        timeBucket,
        distinct,
        topN,
      }) =>
        runStat(rows, {
          metric,
          groupBy,
          valueField,
          filters,
          timeField,
          timeBucket,
          distinct,
          topN,
        }),
    }),

    find_anomalies: tool({
      description:
        "找出数值字段中偏离整体（或分组内）最大的行，返回行下标、值、偏离分数和方向。用于异常、离群点、异常波动类问题。",
      inputSchema: findAnomaliesInputSchema,
      execute: async ({ field, groupBy, method, threshold }) =>
        findAnomalies(rows, { field, groupBy, method, threshold }),
    }),

    make_chart: tool({
      description:
        "生成图表规格。必须返回结构化 ChartSpec：type(bar/line/pie/scatter/area)、title、data(可直接渲染的数组)、xKey、yKey。一次可调用多次生成多张图。",
      inputSchema: makeChartInputSchema,
      execute: async spec => spec as ChartSpec,
    }),

    search_history: tool({
      description: "检索历史分析报告，找相似问题的过往分析结果。涉及对比/趋势时使用。",
      inputSchema: searchHistoryInputSchema,
      execute: async ({ question }) => {
        const context = await searchHistory(question, 5);
        return context || "没有找到相关的历史分析。";
      },
    }),
  };
}
