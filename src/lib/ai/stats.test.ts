import { describe, expect, it } from "vitest";
import { applyFilters, bucketDate, findAnomalies, runStat, type Row } from "@/lib/ai/stats";

const rows: Row[] = [
  { city: "A", sales: 10, customer: "c1" },
  { city: "A", sales: 20, customer: "c2" },
  { city: "B", sales: 30, customer: "c1" },
  { city: "上海", sales: 40, customer: "c1" },
];

describe("applyFilters", () => {
  it("支持 eq / ne / gt / gte / lt / lte / contains / in", () => {
    expect(applyFilters(rows, [{ field: "city", op: "eq", value: "A" }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: "city", op: "ne", value: "A" }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: "sales", op: "gt", value: 20 }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: "sales", op: "gte", value: 20 }])).toHaveLength(3);
    expect(applyFilters(rows, [{ field: "sales", op: "lt", value: 20 }])).toHaveLength(1);
    expect(applyFilters(rows, [{ field: "sales", op: "lte", value: 10 }])).toHaveLength(1);
    expect(applyFilters(rows, [{ field: "city", op: "contains", value: "海" }])).toHaveLength(1);
    expect(applyFilters(rows, [{ field: "city", op: "in", value: ["A", "B"] }])).toHaveLength(3);
  });

  it("多个 filter 是 AND 关系", () => {
    const filtered = applyFilters(rows, [
      { field: "city", op: "eq", value: "A" },
      { field: "sales", op: "gte", value: 20 },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].sales).toBe(20);
  });

  it("空过滤结果返回空数组", () => {
    expect(applyFilters(rows, [{ field: "city", op: "eq", value: "Z" }])).toEqual([]);
  });
});

describe("bucketDate", () => {
  it("跨年周归入包含周四的年份", () => {
    expect(bucketDate("2024-12-30", "week")).toBe("2025-W01");
    expect(bucketDate("2025-01-01", "week")).toBe("2025-W01");
  });

  it("day / month / quarter / year 边界", () => {
    expect(bucketDate("2024-01-31", "day")).toBe("2024-01-31");
    expect(bucketDate("2024-01-31", "month")).toBe("2024-01");
    expect(bucketDate("2024-02-01", "month")).toBe("2024-02");
    expect(bucketDate("2024-03-31", "quarter")).toBe("2024-Q1");
    expect(bucketDate("2024-04-01", "quarter")).toBe("2024-Q2");
    expect(bucketDate("2023-12-31", "year")).toBe("2023");
    expect(bucketDate("2024-01-01", "year")).toBe("2024");
  });

  it("无法解析的日期返回 null", () => {
    expect(bucketDate("not-a-date", "month")).toBeNull();
    expect(bucketDate("", "month")).toBeNull();
  });
});

describe("runStat", () => {
  it("按时间桶聚合，并统计跳过行数", () => {
    const timeRows: Row[] = [
      { date: "2024-01-15", sales: 10 },
      { date: "2024-01-20", sales: 20 },
      { date: "2024-02-01", sales: 30 },
      { date: "bad-date", sales: 40 },
    ];

    const result = runStat(timeRows, {
      metric: "sum",
      valueField: "sales",
      timeField: "date",
      timeBucket: "month",
    });

    expect(result.totalRows).toBe(4);
    expect(result.skippedRows).toBe(1);
    expect(result.result).toEqual([
      { date: "2024-01", sales: 30 },
      { date: "2024-02", sales: 30 },
    ]);
  });

  it("distinct 统计去重数量", () => {
    const result = runStat(rows, {
      metric: "count",
      valueField: "customer",
      distinct: true,
    });
    expect(result.result).toBe(2);
  });

  it("count 不传 valueField 时统计行数", () => {
    const result = runStat(rows, { metric: "count" });
    expect(result.result).toBe(4);
  });

  it("分组结果超过 topN 时截断并标记 truncated", () => {
    const manyRows: Row[] = Array.from({ length: 60 }, (_, i) => ({
      group: `g${i}`,
      value: i,
    }));

    const result = runStat(manyRows, {
      metric: "sum",
      valueField: "value",
      groupBy: "group",
      topN: 5,
    });

    expect(result.truncated).toBe(true);
    expect(result.result).toHaveLength(5);
    expect((result.result as Array<Record<string, string | number>>)[0].value).toBe(59);
  });

  it("过滤后为空时返回空结果而不是 NaN", () => {
    const result = runStat(rows, {
      metric: "avg",
      valueField: "sales",
      filters: [{ field: "city", op: "eq", value: "Z" }],
    });
    expect(result.totalRows).toBe(0);
    expect(result.result).toBe(0);
  });
});

describe("findAnomalies", () => {
  it("zscore 能找出明显偏离值", () => {
    const values = [10, 10, 10, 10, 100];
    const anomalyRows: Row[] = values.map(value => ({ value }));
    const result = findAnomalies(anomalyRows, { field: "value", threshold: 1.5 });

    expect(result.result).toHaveLength(1);
    expect(result.result[0].value).toBe(100);
    expect(result.result[0].direction).toBe("high");
  });

  it("iqr 能找出明显偏离值", () => {
    const values = [10, 12, 14, 16, 18, 100];
    const anomalyRows: Row[] = values.map(value => ({ value }));
    const result = findAnomalies(anomalyRows, { field: "value", method: "iqr" });

    expect(result.result).toHaveLength(1);
    expect(result.result[0].value).toBe(100);
  });

  it("全同值下 zscore / iqr 都返回空且不出现 NaN", () => {
    const sameRows: Row[] = Array.from({ length: 10 }, () => ({ value: 5 }));

    for (const method of ["zscore", "iqr"] as const) {
      const result = findAnomalies(sameRows, { field: "value", method });
      expect(result.result).toEqual([]);
      expect(Number.isNaN(result.threshold)).toBe(false);
    }
  });

  it("按 group 分别计算，并限制最多 20 条", () => {
    const grouped: Row[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ g: "A", value: i === 4 ? 100 : 10 })),
      ...Array.from({ length: 5 }, (_, i) => ({ g: "B", value: i === 4 ? 100 : 10 })),
    ];
    const result = findAnomalies(grouped, { field: "value", groupBy: "g", threshold: 1.5 });
    expect(result.result).toHaveLength(2);
    expect(result.result[0].group).toBeDefined();
  });
});
