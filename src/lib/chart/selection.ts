import type { ChartSpec } from "@/types";
import { type ChartRow, type ResolvedAxes, readNumeric } from "@/lib/chart/axes";

/** 一条可被选中的数据项（对应图上的柱子 / 点 / 扇区） */
export interface SelectableItem {
  /** 稳定 key：用数据行下标，避免重复类别值互相干扰 */
  key: string;
  /** 维度值（x 轴类别 / 饼图扇区名 / 散点 x 值） */
  label: string;
  /** 数值（y 轴值 / 饼图值 / 散点 y 值），无法解析时为 null */
  value: number | null;
}

/** 选中状态：记录产生选择时的数据签名，签名变化即自动失效 */
export interface SelectionState {
  signature: string;
  keys: Set<string>;
}

/** 传给 chat-panel 的选中描述 */
export interface SelectionRange {
  xKey: string;
  values: string[];
  /** 拼好的自然语言描述，例如「销售额 2024-03 为 123」 */
  text: string;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export function createSelection(): SelectionState {
  return { signature: "", keys: new Set() };
}

/**
 * 数据签名：类型、轴字段与全部行值变化时改变。
 * 用于在流式更新 / spec 变化后自动作废旧选择，避免残留脏状态。
 */
export function selectionSignature(spec: ChartSpec, axes: ResolvedAxes, rows: ChartRow[]): string {
  const body = rows.map(row => Object.values(row).join("\u0001")).join("\u0002");
  return [spec.type, axes.x.key, axes.y.key, String(rows.length), body].join("\u0003");
}

/** 只有签名匹配时才认可选择，否则视为空 */
export function activeKeys(state: SelectionState, signature: string): ReadonlySet<string> {
  return state.signature === signature ? state.keys : EMPTY_SELECTION;
}

/** 再次点击同一 key 取消选中；签名不匹配时从空集开始 */
export function toggleSelection(
  state: SelectionState,
  signature: string,
  key: string
): SelectionState {
  const base = state.signature === signature ? state.keys : EMPTY_SELECTION;
  const keys = new Set(base);
  if (keys.has(key)) keys.delete(key);
  else keys.add(key);
  return { signature, keys };
}

/** 清空全部选中，同时记录当前签名 */
export function clearSelection(signature: string): SelectionState {
  return { signature, keys: new Set() };
}

/** 把一行数据转成可选中项；缺少 x / y 字段时返回 null */
export function itemAt(row: ChartRow, index: number, axes: ResolvedAxes): SelectableItem | null {
  const { x, y } = axes;
  if (!x.key || !y.key) return null;

  const raw = row[x.key];
  if (raw === undefined || raw === null) return null;

  return {
    key: String(index),
    label: String(raw),
    value: readNumeric(row[y.key]),
  };
}

/** 图表里全部可选中项，供键盘可达的按钮列表使用 */
export function selectableItems(rows: ChartRow[], axes: ResolvedAxes): SelectableItem[] {
  return rows
    .map((row, index) => itemAt(row, index, axes))
    .filter((item): item is SelectableItem => item !== null);
}

/** 数值转描述文本：整数原样，小数最多保留 4 位且去掉尾零 */
export function formatSelectionValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4)));
}

function describeItem(item: SelectableItem, spec: ChartSpec, axes: ResolvedAxes): string {
  const xLabel = axes.x.label || axes.x.key;
  const yLabel = axes.y.label || axes.y.key;
  const value = formatSelectionValue(item.value);

  if (spec.type === "scatter") {
    return value ? `${xLabel}=${item.label}，${yLabel}=${value}` : `${xLabel}=${item.label}`;
  }

  return value ? `${yLabel} ${item.label} 为 ${value}` : `${yLabel} ${item.label}`;
}

/**
 * 把选中集合拼成给模型看的描述。
 * 柱状 / 折线 / 面积 / 饼图：`销售额 2024-03 为 123`；
 * 散点：`价格=12，销量=34`。
 */
export function describeSelection(
  spec: ChartSpec,
  axes: ResolvedAxes,
  rows: ChartRow[],
  keys: ReadonlySet<string>
): SelectionRange | null {
  if (keys.size === 0) return null;

  const items: SelectableItem[] = [];
  rows.forEach((row, index) => {
    const key = String(index);
    if (!keys.has(key)) return;
    const item = itemAt(row, index, axes);
    if (item) items.push(item);
  });

  if (items.length === 0) return null;

  return {
    xKey: axes.x.key,
    values: Array.from(new Set(items.map(item => item.label))),
    text: items.map(item => describeItem(item, spec, axes)).join("；"),
  };
}
