import type { CsvSchema } from "@/types";

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
${csv.preview}${buildProfileDesc(csv)}`
    : "当前没有数据集。此时只能做说明性回答，禁止调用 run_stat / make_chart。";

  return `你是一个数据分析助手。基于用户上传的 CSV 回答问题。

${schemaDesc}

# 工具
- run_stat(metric, valueField?, groupBy?) → 统计结果
  metric ∈ {sum, avg, count, max, min}
  valueField 为聚合的数值字段（count 可不填）
  groupBy 为可选分组字段，不填则全局聚合
  字段名须与上面列出的完全一致
- make_chart(spec: ChartSpec) → 生成图表（字段见下方 ChartSpec 规则）
- search_history(question) → 检索历史分析报告

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
- 需要多维度/多图表对比 → 同一轮并行多次调用 make_chart
- 用户提到"之前/上次/对比/趋势"或需引用既往结论 → search_history
- 最后用文字总结发现，不要复述工具原始输出

# 边界
- 字段名不匹配时，先向用户确认，不要臆造字段
- run_stat 返回空结果时，如实说明，不要编造数值`;
}
