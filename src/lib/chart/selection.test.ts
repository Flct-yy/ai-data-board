import { describe, expect, it } from "vitest";
import type { ChartSpec } from "@/types";
import type { ChartRow, ResolvedAxes } from "@/lib/chart/axes";
import {
  activeKeys,
  clearSelection,
  createSelection,
  describeSelection,
  formatSelectionValue,
  itemAt,
  selectableItems,
  selectionSignature,
  toggleSelection,
} from "@/lib/chart/selection";

const axes: ResolvedAxes = {
  x: { key: "月份", label: "月份", scale: "category", rotateTicks: false },
  y: {
    key: "销售额",
    label: "销售额",
    scale: "number",
    domain: [0, 500],
    tickCount: 5,
    rotateTicks: false,
  },
  ready: true,
};

const rows: ChartRow[] = [
  { 月份: "2024-01", 销售额: 100 },
  { 月份: "2024-02", 销售额: 200 },
  { 月份: "2024-03", 销售额: 300 },
];

const barSpec: ChartSpec = { type: "bar", title: "月度销售", data: [] };

describe("selectionSignature", () => {
  it("类型或字段变化时签名变化", () => {
    const base = selectionSignature(barSpec, axes, rows);
    expect(selectionSignature({ ...barSpec, type: "line" }, axes, rows)).not.toBe(base);
    expect(selectionSignature(barSpec, { ...axes, x: { ...axes.x, key: "品类" } }, rows)).not.toBe(
      base
    );
  });

  it("数据行数或值变化时签名变化", () => {
    const base = selectionSignature(barSpec, axes, rows);
    expect(selectionSignature(barSpec, axes, rows.slice(0, 2))).not.toBe(base);
    expect(
      selectionSignature(barSpec, axes, [{ 月份: "2024-01", 销售额: 999 }, ...rows.slice(1)])
    ).not.toBe(base);
  });
});

describe("toggleSelection / activeKeys / clearSelection", () => {
  it("再次点击同一 key 取消选中", () => {
    const sig = selectionSignature(barSpec, axes, rows);
    let state = toggleSelection(createSelection(), sig, "0");
    expect(activeKeys(state, sig).has("0")).toBe(true);

    state = toggleSelection(state, sig, "0");
    expect(activeKeys(state, sig).size).toBe(0);
  });

  it("支持多选且计数正确", () => {
    const sig = selectionSignature(barSpec, axes, rows);
    let state = toggleSelection(createSelection(), sig, "0");
    state = toggleSelection(state, sig, "2");
    expect(activeKeys(state, sig).size).toBe(2);
  });

  it("签名变化后旧选择自动失效", () => {
    const sig = selectionSignature(barSpec, axes, rows);
    const state = toggleSelection(createSelection(), sig, "1");
    const nextSig = selectionSignature(barSpec, axes, rows.slice(0, 2));
    expect(activeKeys(state, nextSig).size).toBe(0);
  });

  it("签名变化后再次点击从空集开始，不会复活旧选择", () => {
    const sig = selectionSignature(barSpec, axes, rows);
    const state = toggleSelection(createSelection(), sig, "0");
    const nextSig = selectionSignature(barSpec, axes, rows.slice(0, 2));
    const toggled = toggleSelection(state, nextSig, "1");
    expect(Array.from(activeKeys(toggled, nextSig))).toEqual(["1"]);
  });

  it("clearSelection 清空全部", () => {
    const sig = selectionSignature(barSpec, axes, rows);
    let state = toggleSelection(createSelection(), sig, "0");
    state = toggleSelection(state, sig, "2");
    const cleared = clearSelection(sig);
    expect(activeKeys(cleared, sig).size).toBe(0);
    expect(state.keys.size).toBe(2);
  });
});

describe("itemAt / selectableItems", () => {
  it("按行下标生成稳定 key，并读取类别与数值", () => {
    expect(itemAt(rows[1], 1, axes)).toEqual({ key: "1", label: "2024-02", value: 200 });
  });

  it("缺少 x / y 字段时返回 null", () => {
    const broken: ResolvedAxes = {
      ...axes,
      x: { ...axes.x, key: "" },
    };
    expect(itemAt(rows[0], 0, broken)).toBeNull();
    expect(selectableItems(rows, broken)).toEqual([]);
  });

  it("列出全部可选项", () => {
    expect(selectableItems(rows, axes).map(item => item.key)).toEqual(["0", "1", "2"]);
  });
});

describe("formatSelectionValue", () => {
  it("整数原样、小数去尾零、空值返回空串", () => {
    expect(formatSelectionValue(123)).toBe("123");
    expect(formatSelectionValue(12.5)).toBe("12.5");
    expect(formatSelectionValue(12.3456)).toBe("12.3456");
    expect(formatSelectionValue(null)).toBe("");
  });
});

describe("describeSelection", () => {
  it("柱状/折线：拼成「字段 类别 为 值」", () => {
    const result = describeSelection(barSpec, axes, rows, new Set(["2"]));
    expect(result).not.toBeNull();
    expect(result?.xKey).toBe("月份");
    expect(result?.values).toEqual(["2024-03"]);
    expect(result?.text).toBe("销售额 2024-03 为 300");
  });

  it("多选时用分号连接，计数与顺序保持", () => {
    const result = describeSelection(barSpec, axes, rows, new Set(["0", "2"]));
    expect(result?.text).toBe("销售额 2024-01 为 100；销售额 2024-03 为 300");
    expect(result?.values).toEqual(["2024-01", "2024-03"]);
  });

  it("饼图沿用同一套字段描述", () => {
    const pieAxes: ResolvedAxes = {
      x: { key: "区域", label: "区域", scale: "category", rotateTicks: false },
      y: {
        key: "占比",
        label: "占比",
        scale: "number",
        domain: [0, 100],
        tickCount: 5,
        rotateTicks: false,
      },
      ready: true,
    };
    const pieRows: ChartRow[] = [
      { 区域: "华东", 占比: 40 },
      { 区域: "华南", 占比: 60 },
    ];
    const result = describeSelection(
      { type: "pie", title: "区域占比", data: [] },
      pieAxes,
      pieRows,
      new Set(["0"])
    );
    expect(result?.text).toBe("占比 华东 为 40");
  });

  it("散点：同时描述 x 与 y", () => {
    const scatterAxes: ResolvedAxes = {
      x: {
        key: "价格",
        label: "价格",
        scale: "number",
        domain: [0, 100],
        tickCount: 5,
        rotateTicks: false,
      },
      y: {
        key: "销量",
        label: "销量",
        scale: "number",
        domain: [0, 100],
        tickCount: 5,
        rotateTicks: false,
      },
      ready: true,
    };
    const scatterRows: ChartRow[] = [{ 价格: 12, 销量: 34 }];
    const result = describeSelection(
      { type: "scatter", title: "价格-销量", data: [] },
      scatterAxes,
      scatterRows,
      new Set(["0"])
    );
    expect(result?.text).toBe("价格=12，销量=34");
    expect(result?.values).toEqual(["12"]);
  });

  it("没有选中时返回 null", () => {
    expect(describeSelection(barSpec, axes, rows, new Set())).toBeNull();
  });
});
