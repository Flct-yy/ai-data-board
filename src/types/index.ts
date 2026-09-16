export interface CsvColumn {
  name: string;
  type: "number" | "string" | "date" | "boolean";
  sample: unknown[];
}

export interface CsvSchema {
  fileName: string;
  rowCount: number;
  columns: CsvColumn[];
  headers: string[];
  /** 存到 Supabase 后用 report 表做 RAG 检索的预览文本 */
  preview: string;
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
  xKey: string;
  yKey: string;
  series?: string[];
  description?: string;
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
