/**
 * run_stat / find_anomalies 的纯函数实现。
 * tools.ts 只做 Zod 校验和薄封装，这里不依赖 AI SDK，便于单测。
 */

export type Row = Record<string, unknown>;
export type Metric = "sum" | "avg" | "count" | "max" | "min";
export type FilterOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
export type TimeBucket = "day" | "week" | "month" | "quarter" | "year";
export type AnomalyMethod = "zscore" | "iqr";

export interface StatFilter {
  field: string;
  op: FilterOp;
  value: string | number | boolean | Array<string | number>;
}

export interface RunStatInput {
  metric: Metric;
  groupBy?: string;
  valueField?: string;
  filters?: StatFilter[];
  timeField?: string;
  timeBucket?: TimeBucket;
  distinct?: boolean;
  topN?: number;
}

export interface StatResult {
  metric: Metric;
  valueField?: string;
  groupBy?: string;
  timeField?: string;
  timeBucket?: TimeBucket;
  distinct?: boolean;
  /** 过滤后的行数（时间字段解析失败的行不计入分组） */
  totalRows: number;
  /** 时间字段无法解析、被跳过的行数 */
  skippedRows: number;
  result: number | Array<Record<string, string | number>>;
  truncated: boolean;
}

export interface AnomalyInput {
  field: string;
  groupBy?: string;
  method?: AnomalyMethod;
  threshold?: number;
}

export interface AnomalyItem {
  /** 原始行下标，便于模型/用户定位 */
  index: number;
  group?: string;
  value: number;
  /** 偏离程度，越大越异常 */
  score: number;
  direction: "high" | "low";
}

export interface AnomalyResult {
  field: string;
  method: AnomalyMethod;
  threshold: number;
  result: AnomalyItem[];
  totalRows: number;
  truncated: boolean;
}

export const MAX_GROUPS = 50;
export const MAX_TOP_N = 50;
export const MAX_ANOMALIES = 20;
export const DEFAULT_ZSCORE_THRESHOLD = 2.5;
export const DEFAULT_IQR_THRESHOLD = 1.5;

function isNumeric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 字符串数值也按数字比较，避免 "10" 与 10 不等 */
function numericValue(value: unknown): number | null {
  if (isNumeric(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

function compareValues(a: unknown, b: unknown): number {
  const an = numericValue(a);
  const bn = numericValue(b);
  if (an !== null && bn !== null) return an - bn;
  return String(a).localeCompare(String(b));
}

function looseEqual(a: unknown, b: unknown): boolean {
  const an = numericValue(a);
  const bn = numericValue(b);
  if (an !== null && bn !== null) return an === bn;
  return String(a).trim() === String(b).trim();
}

export function matchFilter(raw: unknown, filter: StatFilter): boolean {
  if (raw === null || raw === undefined || raw === "") return false;

  const { op, value } = filter;

  switch (op) {
    case "eq":
      return looseEqual(raw, value);
    case "ne":
      return !looseEqual(raw, value);
    case "gt":
      return compareValues(raw, value) > 0;
    case "gte":
      return compareValues(raw, value) >= 0;
    case "lt":
      return compareValues(raw, value) < 0;
    case "lte":
      return compareValues(raw, value) <= 0;
    case "contains":
      return String(raw).toLowerCase().includes(String(value).toLowerCase());
    case "in":
      return Array.isArray(value) && value.some(item => looseEqual(raw, item));
    default:
      return false;
  }
}

export function applyFilters(rows: Row[], filters: StatFilter[] = []): Row[] {
  if (filters.length === 0) return rows;
  return rows.filter(row => filters.every(filter => matchFilter(row[filter.field], filter)));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO 周编号；跨年那周归入包含周四的年份 */
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** 把日期字符串/Date 归一到桶标签；无法解析返回 null */
export function bucketDate(raw: unknown, bucket: TimeBucket): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  switch (bucket) {
    case "day":
      return `${year}-${pad(month)}-${pad(day)}`;
    case "week": {
      const iso = isoWeek(date);
      return `${iso.year}-W${pad(iso.week)}`;
    }
    case "month":
      return `${year}-${pad(month)}`;
    case "quarter":
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    case "year":
      return String(year);
    default:
      return null;
  }
}

function aggregateValues(values: number[], metric: Metric): number {
  switch (metric) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    case "count":
      return values.length;
    case "max":
      return values.length ? Math.max(...values) : 0;
    case "min":
      return values.length ? Math.min(...values) : 0;
    default:
      return 0;
  }
}

function distinctCount(rows: Row[], target: string): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row[target];
    if (raw === null || raw === undefined || raw === "") continue;
    seen.add(String(raw));
  }
  return seen.size;
}

/** 维度值：时间字段优先，其次 groupBy */
function dimensionOf(row: Row, input: RunStatInput): string | null {
  if (input.timeField) {
    const bucket = input.timeBucket ?? "month";
    return bucketDate(row[input.timeField], bucket);
  }
  if (input.groupBy) {
    const raw = row[input.groupBy];
    if (raw === null || raw === undefined || raw === "") return null;
    return String(raw);
  }
  return "";
}

export function runStat(rows: Row[], input: RunStatInput): StatResult {
  const filtered = applyFilters(rows, input.filters);
  const timeBucket = input.timeField ? (input.timeBucket ?? "month") : undefined;

  const base: StatResult = {
    metric: input.metric,
    valueField: input.valueField,
    groupBy: input.groupBy,
    timeField: input.timeField,
    timeBucket,
    distinct: input.distinct,
    totalRows: filtered.length,
    skippedRows: 0,
    result: 0,
    truncated: false,
  };

  // 无维度：直接聚合整批行
  if (!input.groupBy && !input.timeField) {
    if (input.distinct) {
      const target = input.valueField;
      base.result = target ? distinctCount(filtered, target) : filtered.length;
      return base;
    }

    if (input.metric === "count" && !input.valueField) {
      base.result = filtered.length;
      return base;
    }

    const values = filtered
      .map(row => numericValue(input.valueField ? row[input.valueField] : null))
      .filter((value): value is number => value !== null);
    base.result = aggregateValues(values, input.metric);
    return base;
  }

  const dimensionKey = input.timeField ?? input.groupBy!;
  const groups = new Map<string, Row[]>();

  for (const row of filtered) {
    const key = dimensionOf(row, input);
    if (key === null) {
      base.skippedRows++;
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  let entries = Array.from(groups.entries()).map(([key, groupRows]) => {
    const valueKey = input.valueField ?? "value";
    let value: number;

    if (input.distinct) {
      const target = input.valueField ?? dimensionKey;
      value = distinctCount(groupRows, target);
    } else if (input.metric === "count" && !input.valueField) {
      value = groupRows.length;
    } else {
      const values = groupRows
        .map(row => numericValue(input.valueField ? row[input.valueField] : null))
        .filter((v): v is number => v !== null);
      value = aggregateValues(values, input.metric);
    }

    return { [dimensionKey]: key, [valueKey]: value } as Record<string, string | number>;
  });

  if (input.timeField) {
    // 时间序列按时间升序，topN 不参与（避免只留最早的几个桶）
    entries.sort((a, b) => String(a[dimensionKey]).localeCompare(String(b[dimensionKey])));
  } else {
    const valueKey = input.valueField ?? "value";
    entries.sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
  }

  const limit = Math.min(input.topN ?? MAX_GROUPS, MAX_TOP_N);
  if (entries.length > limit) {
    entries = entries.slice(0, limit);
    base.truncated = true;
  }

  base.result = entries;
  return base;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

interface NumericPoint {
  index: number;
  value: number;
}

function groupPoints(rows: Row[], input: AnomalyInput): Map<string, NumericPoint[]> {
  const groups = new Map<string, NumericPoint[]>();

  rows.forEach((row, index) => {
    const value = numericValue(row[input.field]);
    if (value === null) return;

    const rawGroup = input.groupBy ? row[input.groupBy] : "";
    const group = rawGroup === null || rawGroup === undefined ? "" : String(rawGroup);
    const bucket = groups.get(group);
    if (bucket) bucket.push({ index, value });
    else groups.set(group, [{ index, value }]);
  });

  return groups;
}

export function findAnomalies(rows: Row[], input: AnomalyInput): AnomalyResult {
  const method = input.method ?? "zscore";
  const threshold =
    input.threshold ?? (method === "zscore" ? DEFAULT_ZSCORE_THRESHOLD : DEFAULT_IQR_THRESHOLD);

  const result: AnomalyItem[] = [];
  const groups = groupPoints(rows, input);

  for (const [group, points] of groups.entries()) {
    const minCount = method === "zscore" ? 3 : 4;
    if (points.length < minCount) continue;

    if (method === "zscore") {
      const values = points.map(point => point.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = Math.max(
        0,
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      );
      const sd = Math.sqrt(variance);

      // 全同值：标准差为 0，没有可判定的异常，直接跳过，避免除零
      if (sd === 0) continue;

      for (const point of points) {
        const score = Math.abs(point.value - mean) / sd;
        if (score < threshold) continue;
        result.push({
          index: point.index,
          group: input.groupBy ? group : undefined,
          value: point.value,
          score: Number(score.toFixed(3)),
          direction: point.value >= mean ? "high" : "low",
        });
      }
      continue;
    }

    const sorted = points.map(point => point.value).sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;

    // IQR 为 0 时无法定义围栏（全同值或高度集中），跳过
    if (iqr === 0) continue;

    const lowFence = q1 - threshold * iqr;
    const highFence = q3 + threshold * iqr;

    for (const point of points) {
      if (point.value < lowFence) {
        result.push({
          index: point.index,
          group: input.groupBy ? group : undefined,
          value: point.value,
          score: Number(((lowFence - point.value) / iqr).toFixed(3)),
          direction: "low",
        });
      } else if (point.value > highFence) {
        result.push({
          index: point.index,
          group: input.groupBy ? group : undefined,
          value: point.value,
          score: Number(((point.value - highFence) / iqr).toFixed(3)),
          direction: "high",
        });
      }
    }
  }

  result.sort((a, b) => b.score - a.score);
  const truncated = result.length > MAX_ANOMALIES;

  return {
    field: input.field,
    method,
    threshold,
    result: result.slice(0, MAX_ANOMALIES),
    totalRows: rows.length,
    truncated,
  };
}
