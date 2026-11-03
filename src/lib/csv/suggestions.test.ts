import { describe, expect, it } from "vitest";
import { suggestQuestions } from "@/lib/csv/suggestions";
import type { ColumnProfile, CsvSchema } from "@/types";

function makeCsv(columns: ColumnProfile[], glossary?: CsvSchema["glossary"]): CsvSchema {
  return {
    fileName: "data.csv",
    rowCount: 100,
    headers: columns.map(column => column.name),
    columns: columns.map(column => ({ name: column.name, type: column.type, sample: [] })),
    preview: "",
    profile: { rowCount: 100, columnCount: columns.length, columns, truncated: false },
    glossary,
  };
}

describe("suggestQuestions", () => {
  it("只有数值列时给出可执行的统计问题", () => {
    const questions = suggestQuestions(
      makeCsv([{ name: "sales", type: "number", missingRate: 0 }])
    );

    expect(questions.some(q => q.includes("最大值"))).toBe(true);
  });

  it("只有分类列时给出分组计数问题", () => {
    const questions = suggestQuestions(
      makeCsv([
        {
          name: "region",
          type: "string",
          missingRate: 0,
          topValues: [
            { value: "华东", count: 30 },
            { value: "华北", count: 20 },
          ],
        },
      ])
    );

    expect(questions.some(q => q.includes("各类别分别有多少条记录"))).toBe(true);
  });

  it("有异常值时优先给出异常解释问题", () => {
    const questions = suggestQuestions(
      makeCsv([{ name: "sales", type: "number", missingRate: 0, outlierCount: 3 }])
    );

    expect(questions.some(q => q.includes("3 个疑似异常值"))).toBe(true);
  });

  it("高缺失率时给出缺失影响问题", () => {
    const questions = suggestQuestions(
      makeCsv([{ name: "region", type: "string", missingRate: 0.3 }])
    );

    expect(questions.some(q => q.includes("缺失 30%"))).toBe(true);
  });

  it("完全空 schema 时给出通用兜底问题", () => {
    const questions = suggestQuestions({
      fileName: "empty.csv",
      rowCount: 0,
      headers: [],
      columns: [],
      preview: "",
    });

    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0]).toContain("多少行");
  });

  it("文案会带上 glossary 的单位", () => {
    const questions = suggestQuestions(
      makeCsv(
        [
          { name: "date", type: "date", missingRate: 0 },
          { name: "sales", type: "number", missingRate: 0 },
        ],
        { sales: { label: "销售额", unit: "万元" } }
      )
    );

    expect(questions[0]).toContain("销售额（万元）");
  });

  it("高基数字段不生成分类对比建议", () => {
    const questions = suggestQuestions(
      makeCsv([
        { name: "id", type: "string", missingRate: 0, highCardinality: true, topValues: [] },
        { name: "sales", type: "number", missingRate: 0 },
      ])
    );

    expect(questions.some(q => q.includes("各id"))).toBe(false);
  });
});
