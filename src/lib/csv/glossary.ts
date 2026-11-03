import type { ColumnGlossary, ColumnGlossaryMap, CsvColumn } from "@/types";

export const MAX_GLOSSARY_COLUMNS = 12;

/** 列名推断单位，只作为 UI 默认值，用户可以改 */
export function guessUnit(name: string): string | undefined {
  const lower = name.toLowerCase();

  if (/(率|比例|占比|百分比|percent|pct|ratio|rate)/.test(lower)) return "%";
  if (/(金额|销售额|价格|单价|费用|成本|amt|amount|price|revenue|gmv|cost|fee)/.test(lower)) {
    return "元";
  }
  if (/(数量|件数|个数|count|qty|quantity|num)/.test(lower)) return "个";

  return undefined;
}

function normalizeEntry(entry: ColumnGlossary | undefined): ColumnGlossary {
  const next: ColumnGlossary = {};

  for (const key of ["label", "unit", "note"] as const) {
    const value = entry?.[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) next[key] = trimmed;
    }
  }

  return next;
}

/**
 * 把用户提交的口径合并进已有 glossary。
 * 只更新提交里出现的列，不覆盖其它列；空字符串等价于删除该项。
 */
export function mergeGlossary(
  current: ColumnGlossaryMap | undefined,
  updates: ColumnGlossaryMap | undefined
): ColumnGlossaryMap {
  const result: ColumnGlossaryMap = { ...(current ?? {}) };

  for (const [name, entry] of Object.entries(updates ?? {})) {
    const next = { ...result[name], ...normalizeEntry(entry) };

    // 本次提交里显式留空要能删掉旧值
    for (const key of ["label", "unit", "note"] as const) {
      if (entry?.[key] !== undefined && !normalizeEntry(entry)[key]) delete next[key];
    }

    if (next.label || next.unit || next.note) result[name] = next;
    else delete result[name];
  }

  return result;
}

/** 展示用字段名：优先显示名，再带单位 */
export function displayColumnName(name: string, glossary?: ColumnGlossaryMap): string {
  const entry = glossary?.[name];
  const label = entry?.label?.trim() || name;
  const unit = entry?.unit?.trim();
  return unit ? `${label}（${unit}）` : label;
}

export interface GlossaryDescription {
  lines: string[];
  truncated: boolean;
}

/** 只输出有口径的列，按数据列顺序，最多 12 个 */
export function describeGlossary(
  glossary: ColumnGlossaryMap | undefined,
  columns: Array<Pick<CsvColumn, "name">>,
  maxColumns = MAX_GLOSSARY_COLUMNS
): GlossaryDescription {
  const eligible = columns.filter(column => {
    const entry = glossary?.[column.name];
    return Boolean(entry && (entry.label || entry.unit || entry.note));
  });

  const lines = eligible.slice(0, maxColumns).map(column => {
    const entry = glossary![column.name];
    const name = entry.label?.trim() || column.name;
    const unit = entry.unit?.trim() ? `（${entry.unit.trim()}）` : "";
    const note = entry.note?.trim() ? `：${entry.note.trim()}` : "";
    return `- ${name}${unit}${note}（字段：${column.name}）`;
  });

  return {
    lines,
    truncated: eligible.length > maxColumns,
  };
}
