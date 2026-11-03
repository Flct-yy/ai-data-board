import type { ColumnProfile, CsvColumn, CsvSchema, DataProfile } from "@/types";

const PROFILE_MAX_COLUMNS = 24;
const PROFILE_MAX_TOP_VALUES = 5;
const PROFILE_MAX_UNIQUE_TRACK = 500;
const PROFILE_MIN_OUTLIER_SAMPLE = 20;
const PROFILE_VALUE_MAX_LENGTH = 40;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

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

/**
 * 生成紧凑数据体检：缺失率、分类 Top 5、数值 min/max/mean、疑似异常值。
 * 在 Worker 内执行，列数和 Top 值都有上限，避免把大结果写进会话 JSONB。
 */
export function buildCsvProfile(
  rows: Record<string, unknown>[],
  columns: CsvColumn[]
): DataProfile {
  const profiledColumns: ColumnProfile[] = columns.slice(0, PROFILE_MAX_COLUMNS).map(col => {
    let missing = 0;
    let numericCount = 0;
    let sum = 0;
    let sumSq = 0;
    let min = Infinity;
    let max = -Infinity;
    let highCardinality = false;
    const counts = new Map<string, number>();

    for (const row of rows) {
      const raw = row[col.name];
      if (raw === null || raw === undefined || raw === "") {
        missing++;
        continue;
      }

      if (!highCardinality) {
        const key = String(raw).slice(0, PROFILE_VALUE_MAX_LENGTH);
        if (counts.size < PROFILE_MAX_UNIQUE_TRACK || counts.has(key)) {
          counts.set(key, (counts.get(key) ?? 0) + 1);
        } else {
          highCardinality = true;
        }
      }

      if (col.type === "number") {
        const num = Number(raw);
        if (!Number.isNaN(num)) {
          numericCount++;
          sum += num;
          sumSq += num * num;
          if (num < min) min = num;
          if (num > max) max = num;
        }
      }
    }

    const profile: ColumnProfile = {
      name: col.name,
      type: col.type,
      missingRate: rows.length ? round(missing / rows.length, 3) : 0,
    };

    if (highCardinality) {
      profile.highCardinality = true;
    } else if (counts.size > 0) {
      profile.topValues = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, PROFILE_MAX_TOP_VALUES)
        .map(([value, count]) => ({ value, count }));
    }

    if (col.type === "number" && numericCount > 0) {
      const mean = sum / numericCount;
      const variance = Math.max(0, sumSq / numericCount - mean * mean);
      const sd = Math.sqrt(variance);
      profile.min = round(min, 2);
      profile.max = round(max, 2);
      profile.mean = round(mean, 2);

      // 样本太小时标准差不可靠，只对 >= 20 个数值统计疑似异常值
      if (numericCount >= PROFILE_MIN_OUTLIER_SAMPLE && sd > 0) {
        let outliers = 0;
        for (const row of rows) {
          const num = Number(row[col.name]);
          if (!Number.isNaN(num) && Math.abs(num - mean) > 2 * sd) outliers++;
        }
        profile.outlierCount = outliers;
      }
    }

    return profile;
  });

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    columns: profiledColumns,
    truncated: columns.length > PROFILE_MAX_COLUMNS,
  };
}

/** 从解析结果构建 CsvSchema，含字段类型推断、预览文本和数据体检 */
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

  return {
    fileName,
    rowCount: rows.length,
    columns,
    headers,
    preview,
    profile: buildCsvProfile(rows, columns),
  };
}
