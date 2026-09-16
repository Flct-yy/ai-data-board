import type { CsvColumn, CsvSchema } from "@/types";

/** 推断单列类型：number / date / boolean / string */
export function inferColumnType(values: unknown[]): CsvColumn["type"] {
  const nonNull = values.filter(v => v !== null && v !== "" && v !== undefined);
  if (nonNull.length === 0) return "string";

  const sample = nonNull.slice(0, 50);
  const allNum = sample.every(
    v => typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)))
  );
  if (allNum) return "number";

  const allDate = sample.every(v => typeof v === "string" && !isNaN(Date.parse(v)));
  if (allDate) return "date";

  const boolSet = new Set(["true", "false", "0", "1", "yes", "no"]);
  const allBool = sample.every(v => boolSet.has(String(v).toLowerCase()));
  if (allBool) return "boolean";

  return "string";
}

/** 从解析结果构建 CsvSchema，含字段类型推断和预览文本 */
export function buildCsvSchema(
  fileName: string,
  headers: string[],
  rows: Record<string, unknown>[]
): CsvSchema {
  const columns: CsvColumn[] = headers.map(h => {
    const colValues = rows.map(r => r[h]);
    return {
      name: h,
      type: inferColumnType(colValues),
      sample: colValues.slice(0, 5),
    };
  });

  const preview = rows
    .slice(0, 3)
    .map(r => headers.map(h => r[h]).join(","))
    .join("\n");

  return { fileName, rowCount: rows.length, columns, headers, preview };
}
