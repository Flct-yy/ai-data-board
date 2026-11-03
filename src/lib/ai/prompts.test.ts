import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import {
  findAnomaliesInputSchema,
  makeChartInputSchema,
  runStatInputSchema,
  searchHistoryInputSchema,
} from "@/lib/ai/tools";
import type { CsvSchema } from "@/types";

/** prompt 里提到的每个工具参数名都必须能在对应 Zod schema 找到，防止两处手写漂移 */
describe("buildSystemPrompt 工具契约", () => {
  const prompt = buildSystemPrompt(null);

  const cases = [
    { tool: "run_stat", schema: runStatInputSchema },
    { tool: "find_anomalies", schema: findAnomaliesInputSchema },
    { tool: "make_chart", schema: makeChartInputSchema },
    { tool: "search_history", schema: searchHistoryInputSchema },
  ] as const;

  for (const { tool, schema } of cases) {
    it(`${tool} 的每个入参都出现在 prompt`, () => {
      for (const key of Object.keys(schema.shape)) {
        expect(prompt).toContain(key);
      }
    });
  }

  it("prompt 不再包含已废弃的字段名/签名", () => {
    expect(prompt).not.toMatch(/nameKey|valueKey/);
    expect(prompt).not.toContain("run_stat(column, op");
    expect(prompt).not.toContain("groupby");
    expect(prompt).not.toContain("search_history(query)");
  });
});

describe("buildSystemPrompt 列口径", () => {
  const csv: CsvSchema = {
    fileName: "sales.csv",
    rowCount: 2,
    headers: ["sales", "region"],
    columns: [
      { name: "sales", type: "number", sample: [] },
      { name: "region", type: "string", sample: [] },
    ],
    preview: "sales,region\\n100,华东",
    glossary: { sales: { label: "销售额", unit: "万元", note: "含税收入" } },
  };

  it("只注入已填写的列，并保留单位与说明", () => {
    const prompt = buildSystemPrompt(csv);
    const section = prompt.split("字段口径（用户填写")[1]?.split("# 工具")[0] ?? "";

    expect(section).toContain("销售额（万元）：含税收入（字段：sales）");
    expect(section).not.toContain("region");
  });

  it("没有 glossary 时不出现口径段", () => {
    expect(buildSystemPrompt({ ...csv, glossary: undefined })).not.toContain("字段口径");
  });
});
