import type { CsvSchema } from "@/types";
import { describeGlossary } from "@/lib/csv/glossary";

function buildGlossaryDesc(csv: CsvSchema): string {
  const { lines, truncated } = describeGlossary(csv.glossary, csv.columns);
  if (lines.length === 0) return "";

  const suffix = truncated ? "\n（只展示前 12 个有口径的字段）" : "";
  return `\n字段口径（用户填写，单位/业务含义以此为准）：\n${lines.join("\n")}${suffix}`;
}

function buildProfileDesc(csv: CsvSchema): string {
  const profile = csv.profile;
  if (!profile) return "";

  const lines = profile.columns.slice(0, 12).map(c => {
    const parts = [`- ${c.name} (${c.type}) 缺失 ${(c.missingRate * 100).toFixed(1)}%`];
    if (c.min !== undefined && c.max !== undefined) {
      parts.push(`范围 ${c.min}~${c.max}${c.mean !== undefined ? `，均值 ${c.mean}` : ""}`);
    }
    if (c.topValues?.length) {
      parts.push(`Top: ${c.topValues.map(v => `${v.value}(${v.count})`).join(", ")}`);
    }
    if (c.highCardinality) parts.push("高基数");
    if (c.outlierCount) parts.push(`疑似异常值 ${c.outlierCount}`);
    return parts.join(" | ");
  });

  const truncated = profile.truncated ? "\n（字段过多，体检只展示前 24 列）" : "";
  return `\n数据体检（缺失率 / 数值范围 / Top 类别，最多展示 12 列）：\n${lines.join("\n")}${truncated}`;
}

export function buildSystemPrompt(csv: CsvSchema | null): string {
  const schemaDesc = csv
    ? `当前数据集：${csv.fileName}（${csv.rowCount} 行）
字段：
${csv.columns.map(c => `- ${c.name} (${c.type})`).join("\n")}
前 3 行预览：
${csv.preview}${buildProfileDesc(csv)}${buildGlossaryDesc(csv)}`
    : "当前没有数据集。此时只能做说明性回答，禁止调用 run_stat / make_chart。";

  return `你是一个数据分析助手。基于用户上传的 CSV 回答问题。

${schemaDesc}

# 工具
- run_stat(metric, valueField?, groupBy?, filters?, timeField?, timeBucket?, distinct?, topN?) → 统计结果
  metric ∈ {sum, avg, count, max, min}
  valueField 为聚合的数值字段（count 可不填）
  groupBy 为可选分组字段，不填则全局聚合
  filters 为数组 [{field, op, value}]，op ∈ {eq, ne, gt, gte, lt, lte, contains, in}
  value 可为标量或数组（op=in 时必须为数组）
  timeField + timeBucket ∈ {day, week, month, quarter, year} 按时间聚合；
    timeBucket 缺省 month，timeField 与 groupBy 二选一
  distinct=true 时按 valueField 去重计数（如去重客户数）
  topN 只对分组结果生效，最大 50；分组结果最多返回 50 组
- find_anomalies(field, groupBy?, method?, threshold?) → 异常行
  field 必须是数值字段；groupBy 可选，按组内分布检测
  method ∈ {zscore, iqr}，缺省 zscore
  threshold 缺省 zscore=2.5、iqr=1.5；最多返回 20 条
- make_chart(spec: ChartSpec) → 生成图表（字段见下方 ChartSpec 规则）
- search_history(question) → 检索历史分析报告

# 字段与取值约束
- filter 的 field、groupBy、valueField、timeField 只能是上面字段列表中的列名，禁止虚构
- filter 的枚举值（如区域名、品类名）只能来自数据体检里的 Top 值或预览，禁止臆造

# ChartSpec 规则
- type ∈ {bar, line, pie, scatter, area}
- title 必填；description 可选，用于补充图表说明
- bar/line/area: 必填 xKey（X 轴/类别字段）、yKey（数值字段）
- pie: 必填 xKey（扇区名称字段）、yKey（扇区数值字段）；
  若 data 项形如 { name, value }，则 xKey 填 "name"、yKey 填 "value"
- scatter: xKey 与 yKey 均须为数值列
- 可选 xLabel/yLabel 填中文轴标题（缺省用字段名），xUnit/yUnit 填单位（如 元 / % / 人）
- data 必须是最终数组（每项 { key: value }），≤ 50 项，禁止函数/占位符
- 输出纯 JSON, 不要包 markdown 代码块

# 工作方式(ReAct, 按需调用)
- 简单事实问题(行数、字段列表、字段含义)→ 直接回答，不调工具
- 需要数值 → 先 run_stat 拿结果，再据此回答或画图
- 有筛选条件 → 先用 filters 缩小范围，再做分组/时间聚合
- 需要时间趋势 → 传 timeField + timeBucket，不要自己拼接日期
- 问"异常/离群/波动" → 先用 find_anomalies，再解释可能原因
- 需要多维度/多图表对比 → 同一轮并行多次调用 make_chart
- 用户提到"之前/上次/对比/趋势"或需引用既往结论 → search_history
- 最后用文字总结发现，不要复述工具原始输出

# 边界
- 字段名不匹配时，先向用户确认，不要臆造字段
- run_stat / find_anomalies 返回空结果或 truncated=true 时，如实说明，不要编造数值`;
}
