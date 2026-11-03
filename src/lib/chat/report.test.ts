import { describe, expect, it } from "vitest";
import { shouldPersistReport } from "@/lib/chat/report";

const LONG_ANSWER = "这是一段超过八十个字符的分析结论。".repeat(5);

describe("shouldPersistReport", () => {
  it("有图表时必定入库", () => {
    expect(shouldPersistReport({ question: "你好", answer: "", chartCount: 1 })).toBe(true);
  });

  it("寒暄不入库", () => {
    expect(shouldPersistReport({ question: "你好", answer: LONG_ANSWER, chartCount: 0 })).toBe(
      false
    );
  });

  it("纯字段/行数问答不入库", () => {
    expect(
      shouldPersistReport({
        question: "这个 CSV 有哪些字段？",
        answer: LONG_ANSWER,
        chartCount: 0,
      })
    ).toBe(false);
  });

  it("字段 + 分析意图可以入库", () => {
    expect(
      shouldPersistReport({
        question: "各字段的分布情况分析一下",
        answer: LONG_ANSWER,
        chartCount: 0,
      })
    ).toBe(true);
  });

  it("纯文本答案过短不入库", () => {
    expect(shouldPersistReport({ question: "销售额是多少", answer: "123 元", chartCount: 0 })).toBe(
      false
    );
  });

  it("有信息量的纯文本分析入库", () => {
    expect(
      shouldPersistReport({
        question: "销售额变化的原因是什么",
        answer: LONG_ANSWER,
        chartCount: 0,
      })
    ).toBe(true);
  });
});
