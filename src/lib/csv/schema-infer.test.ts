import { describe, expect, it } from "vitest";
import { buildCsvProfile, buildCsvSchema } from "@/lib/csv/schema-infer";

const rows: Record<string, unknown>[] = [
  { city: "A", sales: 10 },
  { city: "A", sales: 20 },
  { city: "B", sales: 30 },
  { city: "", sales: null },
];

describe("buildCsvProfile", () => {
  it("统计缺失率、Top 类别与数值范围", () => {
    const schema = buildCsvSchema("demo.csv", ["city", "sales"], rows);
    const profile = schema.profile;

    expect(profile?.rowCount).toBe(4);
    expect(profile?.columnCount).toBe(2);

    const city = profile?.columns.find(c => c.name === "city");
    expect(city?.missingRate).toBe(0.25);
    expect(city?.topValues).toEqual([
      { value: "A", count: 2 },
      { value: "B", count: 1 },
    ]);

    const sales = profile?.columns.find(c => c.name === "sales");
    expect(sales?.missingRate).toBe(0.25);
    expect(sales?.min).toBe(10);
    expect(sales?.max).toBe(30);
    expect(sales?.mean).toBe(20);
  });

  it("列数超过上限时标记 truncated", () => {
    const headers = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const wideRows = [Object.fromEntries(headers.map(h => [h, 1]))];
    const profile = buildCsvProfile(
      wideRows,
      headers.map(h => ({ name: h, type: "number", sample: [] }))
    );

    expect(profile.columns).toHaveLength(24);
    expect(profile.truncated).toBe(true);
  });
});
