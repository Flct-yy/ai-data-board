import { z } from "zod";
import type { ChartSpec } from "@/types";

export const chartSpecSchema = z.object({
  type: z.enum(["bar", "line", "pie", "scatter", "area"]),
  title: z.string().min(1),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  xKey: z.string().optional(),
  yKey: z.string().optional(),
  series: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export type ChartSpecZod = z.infer<typeof chartSpecSchema>;

// 从 schema 派生，避免两处维护
const VALID_TYPES = chartSpecSchema.shape.type.options;

/** 合法类型 / 合法类型的前缀，都先按该类型渲染，避免 "l"→"li"→"line" 闪烁 */
function resolveType(t: unknown): ChartSpecZod["type"] {
  if (typeof t !== "string" || t.length === 0) return "bar";
  if ((VALID_TYPES as readonly string[]).includes(t)) {
    return t as ChartSpecZod["type"];
  }
  const prefix = VALID_TYPES.find(v => v.startsWith(t));
  return (prefix as ChartSpecZod["type"]) ?? "bar";
}

/** 逐行清洗 data：只保留 value 全是 string|number 的记录 */
function sanitizeData(rows: unknown): Record<string, string | number>[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is Record<string, string | number> =>
      !!row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      Object.values(row).every(v => typeof v === "string" || typeof v === "number")
  );
}

export function mergePartialSpec(prev: ChartSpec | null, partial: unknown): ChartSpec | null {
  // 显式排除数组 / null / 非对象
  const patch =
    partial && typeof partial === "object" && !Array.isArray(partial)
      ? (partial as Record<string, unknown>)
      : {};

  const base = (prev ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base, ...patch };

  // type：非法/前缀都归一
  merged.type = resolveType(merged.type);

  // title：严格判断，不吞空串语义
  if (typeof merged.title !== "string" || merged.title.length === 0) {
    merged.title = "生成中…";
  }

  // data：清洗 + 单调不回退
  const nextData = sanitizeData(merged.data);
  const prevData = sanitizeData(base.data);
  merged.data = nextData.length >= prevData.length ? nextData : prevData;

  // series：同样做单调保护（流式里只会变长）
  const nextSeries = Array.isArray(merged.series)
    ? merged.series.filter((v): v is string => typeof v === "string")
    : [];
  const prevSeries = Array.isArray(base.series) ? (base.series as string[]) : [];
  merged.series = nextSeries.length >= prevSeries.length ? nextSeries : prevSeries;

  const parsed = chartSpecSchema.safeParse(merged);
  if (parsed.success) return parsed.data as ChartSpec;

  // 失败时回退 prev，绝不让上一帧好好的图表消失
  if (prev) {
    const prevParsed = chartSpecSchema.safeParse(prev);
    if (prevParsed.success) return prevParsed.data as ChartSpec;
  }
  return null;
}
