import type { ChartSpec } from "@/types";

export type ChartRow = Record<string, number | string>;
export type AxisScale = "category" | "number";
export type EmptyReason = "no-data" | "no-numeric-field" | "scatter-needs-number";

export interface NumericScale {
  domain: [number, number];
  tickCount: number;
}

export interface ResolvedAxis {
  key: string;
  label: string;
  unit?: string;
  scale: AxisScale;
  domain?: [number, number];
  tickCount?: number;
  /** 分类轴标签过长时旋转显示 */
  rotateTicks: boolean;
}

export interface ResolvedAxes {
  x: ResolvedAxis;
  y: ResolvedAxis;
  ready: boolean;
  emptyReason?: EmptyReason;
}

/** 直接来自 LLM / 流式 JSON，运行时仍需校验行数据 */
export function normalizeChartRows(data: unknown): ChartRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is ChartRow => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    return Object.values(row).every(v => typeof v === "string" || typeof v === "number");
  });
}

export function readNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

/** 千 / 万 / 亿紧凑刻度，避免长数字挤占 Y 轴宽度 */
export function formatAxisNumber(value: unknown): string {
  const num = readNumeric(value);
  if (num === null) return "-";
  if (num === 0) return "0";

  const abs = Math.abs(num);
  if (abs >= 1e8) return `${trimFixed(num / 1e8, 2)}亿`;
  if (abs >= 1e4) return `${trimFixed(num / 1e4, 2)}万`;
  if (abs >= 1000) return trimFixed(num, 1);
  if (abs >= 0.01) return trimFixed(num, 2);
  return String(Number(num.toPrecision(2)));
}

export function formatAxisTitle(label: string, unit?: string): string {
  const title = label.trim();
  const suffix = unit?.trim();
  if (!title) return suffix ?? "";
  return suffix ? `${title} (${suffix})` : title;
}

const WIDE_CHAR =
  /[\u1100-\u115f\u2e80-\u4dcf\u4e00-\u9fff\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/;

export function labelWidth(value: unknown): number {
  const text = value == null ? "" : String(value);
  let width = 0;
  for (const char of text) width += WIDE_CHAR.test(char) ? 2 : 1;
  return width;
}

export function truncateAxisLabel(value: unknown, maxWidth = 18): string {
  const text = value == null ? "" : String(value);
  if (labelWidth(text) <= maxWidth) return text;

  let result = "";
  for (const char of text) {
    if (labelWidth(result) + labelWidth(char) > maxWidth - 2) break;
    result += char;
  }
  return `${result}…`;
}

export function maxLabelWidth(values: Array<string | number>): number {
  return values.reduce<number>((max, value) => Math.max(max, labelWidth(value)), 0);
}

/** 生成对齐到 1/2/5 数量级的刻度步长 */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const fraction = raw / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

/** 数值轴范围自适应：空数组 / 全零 / 单点均安全 */
export function computeNumericScale(
  values: number[],
  options: { includeZero?: boolean; tickTarget?: number } = {}
): NumericScale | undefined {
  const finite = values.filter(value => Number.isFinite(value));
  if (finite.length === 0) return undefined;

  let lower = Math.min(...finite);
  let upper = Math.max(...finite);

  if (options.includeZero) {
    lower = Math.min(0, lower);
    upper = Math.max(0, upper);
  }

  if (lower === upper) {
    if (lower === 0) return { domain: [0, 1], tickCount: 6 };
    const padding = Math.abs(lower) * 0.1 || 1;
    lower -= padding;
    upper += padding;
  }

  const target = Math.max(2, options.tickTarget ?? 5);
  const step = niceStep((upper - lower) / target);
  const domain: [number, number] = [
    roundToStep(lower, step, Math.floor),
    roundToStep(upper, step, Math.ceil),
  ];

  if (domain[0] === domain[1]) domain[1] = domain[0] + step;
  const tickCount = clamp(Math.round((domain[1] - domain[0]) / step) + 1, 2, 12);

  return { domain, tickCount };
}

export function resolveChartAxes(spec: ChartSpec, rows: ChartRow[]): ResolvedAxes {
  const keys = collectKeys(rows);
  const requestedX = cleanKey(spec.xKey);
  const requestedY = cleanKey(spec.yKey);

  let xKey = pickRequestedKey(requestedX, rows, keys);
  let yKey = pickRequestedKey(requestedY, rows, keys);

  if (!yKey && keys.length > 0) {
    yKey =
      keys.find(key => key !== xKey && isNumericField(rows, key)) ?? firstNumericField(rows, keys);
  }
  if (!xKey && keys.length > 0) {
    xKey = keys.find(key => key !== yKey) ?? keys[0] ?? "";
  }

  let yValues = numericValues(rows, yKey);
  if (rows.length > 0 && yValues.length === 0) {
    const fallback =
      keys.find(key => key !== xKey && isNumericField(rows, key)) ?? firstNumericField(rows, keys);
    if (fallback) {
      yKey = fallback;
      yValues = numericValues(rows, yKey);
    }
  }

  if (spec.type === "scatter" && rows.length > 0 && xKey !== yKey) {
    if (numericValues(rows, xKey).length === 0) {
      xKey = keys.find(key => key !== yKey && isNumericField(rows, key)) ?? xKey;
    }
  }

  const yScale = computeNumericScale(yValues, { includeZero: spec.type === "bar" });
  const xIsNumeric = spec.type === "scatter";
  const xValues = columnValues(rows, xKey);
  const xScale = xIsNumeric ? computeNumericScale(numericValues(rows, xKey)) : undefined;
  const rotateTicks = !xIsNumeric && maxLabelWidth(xValues) > 12;

  const x: ResolvedAxis = {
    key: xKey,
    label: cleanKey(spec.xLabel) || xKey || "X",
    unit: cleanKey(spec.xUnit) || undefined,
    scale: xIsNumeric ? "number" : "category",
    domain: xScale?.domain,
    tickCount: xScale?.tickCount,
    rotateTicks,
  };

  const y: ResolvedAxis = {
    key: yKey,
    label: cleanKey(spec.yLabel) || yKey || "Y",
    unit: cleanKey(spec.yUnit) || undefined,
    scale: "number",
    domain: yScale?.domain,
    tickCount: yScale?.tickCount,
    rotateTicks: false,
  };

  let emptyReason: EmptyReason | undefined;
  if (rows.length === 0) emptyReason = "no-data";
  else if (yValues.length === 0) emptyReason = "no-numeric-field";
  else if (xIsNumeric && numericValues(rows, xKey).length === 0)
    emptyReason = "scatter-needs-number";

  return {
    x,
    y,
    ready: emptyReason === undefined,
    emptyReason,
  };
}

function trimFixed(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function roundToStep(value: number, step: number, mode: (n: number) => number): number {
  const decimals = Math.min(20, Math.max(0, -Math.floor(Math.log10(step))));
  const rounded = Number((mode(value / step) * step).toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanKey(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function collectKeys(rows: ChartRow[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

function hasKey(rows: ChartRow[], key: string): boolean {
  return rows.some(row => Object.prototype.hasOwnProperty.call(row, key));
}

function pickRequestedKey(requested: string, rows: ChartRow[], keys: string[]): string {
  if (!requested) return "";
  // 流式阶段 data 可能先于 key 到达，此时保留 LLM 给出的字段名
  if (rows.length === 0 || hasKey(rows, requested)) return requested;
  return keys.find(key => key === requested) ?? "";
}

function columnValues(rows: ChartRow[], key: string): Array<string | number> {
  if (!key) return [];
  return rows.flatMap(row => (Object.prototype.hasOwnProperty.call(row, key) ? [row[key]] : []));
}

function numericValues(rows: ChartRow[], key: string): number[] {
  return columnValues(rows, key)
    .map(readNumeric)
    .filter((value): value is number => value !== null);
}

function isNumericField(rows: ChartRow[], key: string): boolean {
  const values = columnValues(rows, key);
  return values.length > 0 && values.every(value => readNumeric(value) !== null);
}

function firstNumericField(rows: ChartRow[], keys: string[]): string {
  return keys.find(key => isNumericField(rows, key)) ?? "";
}
