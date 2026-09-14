export interface CsvColumn {
  name: string;
  type: 'number' | 'string' | 'date' | 'boolean';
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
