export interface CsvColumn {
  name: string;
  type: "number" | "string" | "date" | "boolean";
  sample: unknown[];
}

export interface ColumnProfile {
  name: string;
  type: CsvColumn["type"];
  /** 缺失率，0-1 */
  missingRate: number;
  /** 高基数字段超过统计上限时，Top 值不完整 */
  highCardinality?: boolean;
  topValues?: Array<{ value: string; count: number }>;
  min?: number;
  max?: number;
  mean?: number;
  /** 偏离均值超过 2 个标准差的数值个数（样本量 >= 20 时才计算） */
  outlierCount?: number;
}

export interface DataProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  /** 列数超过展示上限时截断 */
  truncated: boolean;
}

/** 用户维护的列口径：显示名 / 单位 / 业务说明，保存在 sessions.csv_schema.glossary */
export interface ColumnGlossary {
  label?: string;
  unit?: string;
  note?: string;
}

export type ColumnGlossaryMap = Record<string, ColumnGlossary>;

export interface CsvSchema {
  fileName: string;
  rowCount: number;
  columns: CsvColumn[];
  headers: string[];
  /** 存到 Supabase 后用 report 表做 RAG 检索的预览文本 */
  preview: string;
  /** 上传时在 Worker 里算好的紧凑数据体检，老数据可能没有 */
  profile?: DataProfile;
  /** 列口径，老会话没有该字段时按空对象处理 */
  glossary?: ColumnGlossaryMap;
}

export interface Session {
  id: string;
  title: string;
  csv_schema: CsvSchema | null;
  created_at: string;
}

export type ChartType = "bar" | "line" | "pie" | "scatter" | "area";

/** LLM 输出的图表规格，经 Zod 校验后喂给 Recharts */
export interface ChartSpec {
  type: ChartType;
  title: string;
  data: Array<Record<string, number | string>>;
  /** 流式 partial spec 可能尚未到达，渲染时需做字段回退 */
  xKey?: string;
  yKey?: string;
  series?: string[];
  description?: string;
  /** 轴标题，缺省回退到字段名 */
  xLabel?: string;
  yLabel?: string;
  /** 轴单位，仅用于轴标题展示，如 元 / % / 人 */
  xUnit?: string;
  yUnit?: string;
}

/** 单步工具调用轨迹，用于 tool-trace 可视化 */
export interface ToolStep {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

export interface AnalysisReport {
  id: string;
  session_id: string;
  question: string;
  answer: string;
  chart_specs: ChartSpec[];
  created_at: string;
}
