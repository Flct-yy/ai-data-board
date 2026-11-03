import { describe, expect, it } from "vitest";
import { describeGlossary, guessUnit, mergeGlossary } from "@/lib/csv/glossary";

describe("guessUnit", () => {
  it("按列名给出默认单位", () => {
    expect(guessUnit("退货率")).toBe("%");
    expect(guessUnit("销售额")).toBe("元");
    expect(guessUnit("amount")).toBe("元");
    expect(guessUnit("数量")).toBe("个");
    expect(guessUnit("qty")).toBe("个");
    expect(guessUnit("客户名称")).toBeUndefined();
  });
});

describe("mergeGlossary", () => {
  it("只更新提交的列，保留其它列", () => {
    const merged = mergeGlossary(
      {
        sales: { unit: "元", note: "含税" },
        region: { label: "区域" },
      },
      { sales: { unit: "万元" } }
    );

    expect(merged.sales).toEqual({ unit: "万元", note: "含税" });
    expect(merged.region).toEqual({ label: "区域" });
  });

  it("显式留空会删除对应项，全部留空时删除整列", () => {
    const merged = mergeGlossary(
      { sales: { unit: "元", note: "含税" }, region: { note: "华东" } },
      { sales: { unit: "  ", note: "" }, region: { note: "" } }
    );

    expect(merged.sales).toBeUndefined();
    expect(merged.region).toBeUndefined();
  });
});

describe("describeGlossary", () => {
  it("只输出有口径的列，并带上字段名", () => {
    const { lines, truncated } = describeGlossary(
      { sales: { label: "销售额", unit: "万元", note: "含税收入" } },
      [{ name: "sales" }, { name: "region" }]
    );

    expect(lines).toEqual(["- 销售额（万元）：含税收入（字段：sales）"]);
    expect(truncated).toBe(false);
  });

  it("超过 12 个有口径的列时截断并标记", () => {
    const glossary = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`c${i}`, { unit: "个" }])
    );
    const columns = Array.from({ length: 15 }, (_, i) => ({ name: `c${i}` }));

    const { lines, truncated } = describeGlossary(glossary, columns);
    expect(lines).toHaveLength(12);
    expect(truncated).toBe(true);
  });

  it("没有口径时返回空数组", () => {
    const { lines, truncated } = describeGlossary(undefined, [{ name: "sales" }]);
    expect(lines).toEqual([]);
    expect(truncated).toBe(false);
  });
});
