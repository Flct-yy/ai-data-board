/// <reference lib="webworker" />
import Papa from "papaparse";
import { buildCsvSchema } from "./schema-infer";
import type { CsvSchema } from "@/types";

export interface ParseProgress {
  type: "progress";
  rowCount: number;
}
export interface ParseDone {
  type: "done";
  schema: CsvSchema;
  rows: Record<string, unknown>[];
}
export interface ParseError {
  type: "error";
  error: string;
}
export type WorkerMessage = ParseProgress | ParseDone | ParseError;

/**
 * Web Worker：流式解析 CSV，主线程不卡。
 * 大文件每 5000 行回传一次进度，解析完回传 schema + 全量行。
 */
self.onmessage = (e: MessageEvent<File>) => {
  const file = e.data;
  const rows: Record<string, unknown>[] = [];

  Papa.parse<Record<string, unknown>>(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    worker: false, // 已在 Worker 内，不能再嵌 worker
    step: row => {
      if (row.data) rows.push(row.data as Record<string, unknown>);
      if (rows.length % 5000 === 0) {
        postMessage({ type: "progress", rowCount: rows.length } satisfies ParseProgress);
      }
    },
    complete: () => {
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      const schema = buildCsvSchema(file.name, headers, rows);
      postMessage({ type: "done", schema, rows } satisfies ParseDone);
    },
    error: (err: Error) => {
      postMessage({ type: "error", error: err.message } satisfies ParseError);
    },
  });
};
