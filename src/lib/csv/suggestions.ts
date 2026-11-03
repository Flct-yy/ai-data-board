import type { ColumnProfile, CsvSchema } from "@/types";
import { displayColumnName } from "@/lib/csv/glossary";

function fallbackColumns(csv: CsvSchema): ColumnProfile[] {
  if (csv.profile) return csv.profile.columns;

  // 老会话没有 profile 时，只保留能确定的信息（列名 + 类型）
  return csv.columns.map(column => ({
    name: column.name,
    type: column.type,
    missingRate: 0,
  }));
}

/**
 * 根据数据体检生成可执行的提问建议。
 * 只使用 profile 里能确认的类型 / Top 值 / 缺失率，避免建议里出现数据中不存在的字段。
 */
export function suggestQuestions(csv: CsvSchema): string[] {
  const columns = fallbackColumns(csv);
  if (columns.length === 0) {
    return ["这份数据有多少行、哪些字段？", "这份数据最值得关注的结论是什么？"];
  }

  const label = (name: string) => displayColumnName(name, csv.glossary);
  const dateColumns = columns.filter(column => column.type === "date");
  const numberColumns = columns.filter(column => column.type === "number");
  const categoryColumns = columns.filter(column => {
    if (column.type !== "string" && column.type !== "boolean") return false;
    if (column.highCardinality) return false;
    const count = column.topValues?.length ?? 0;
    return count >= 2 && count <= 12;
  });

  const questions: string[] = [];
  const date = dateColumns[0];
  const number = numberColumns[0];
  const category = categoryColumns[0];

  if (date && number) {
    questions.push(`「${label(number.name)}」随时间的趋势如何？`);
  }

  if (category && number) {
    questions.push(`各${label(category.name)}的${label(number.name)}对比如何？`);
    questions.push(`各${label(category.name)}的${label(number.name)}占比是多少？`);
  }

  const outlier = columns.find(column => (column.outlierCount ?? 0) > 0);
  if (outlier) {
    questions.push(
      `「${label(outlier.name)}」有 ${outlier.outlierCount} 个疑似异常值，可能是什么原因？`
    );
  }

  const missing = columns
    .filter(column => column.missingRate > 0.2)
    .sort((a, b) => b.missingRate - a.missingRate)[0];
  if (missing) {
    questions.push(
      `「${label(missing.name)}」缺失 ${(missing.missingRate * 100).toFixed(0)}%，对结论有什么影响？`
    );
  }

  if (questions.length === 0 && number) {
    questions.push(`「${label(number.name)}」的最大值、最小值和平均值分别是多少？`);
  }

  if (questions.length === 0 && category) {
    questions.push(`「${label(category.name)}」各类别分别有多少条记录？`);
  }

  if (questions.length === 0) {
    questions.push("这份数据有多少行、哪些字段？", "这份数据最值得关注的结论是什么？");
  }

  return Array.from(new Set(questions)).slice(0, 4);
}
