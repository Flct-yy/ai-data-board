"use client";

import { useRef, useState } from "react";
import type { WorkerMessage } from "@/lib/csv/parser.worker";
import type { CsvSchema } from "@/types";

interface Props {
  loading: boolean;
  setLoading: (v: boolean) => void;
  onUploaded: (sessionId: string) => void;
}

/**
 * CSV 上传组件：用 Web Worker 流式解析（PapaParse），主线程不卡。
 * 解析完把 schema + rows POST 到 /api/sessions 创建会话。
 */
export function CsvUploader({ loading, setLoading, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    setLoading(true);
    setProgress(0);

    const worker = new Worker(new URL("@/lib/csv/parser.worker.ts", import.meta.url));

    try {
      const { schema, rows }: { schema: CsvSchema; rows: Record<string, unknown>[] } =
        await new Promise((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === "progress") setProgress(msg.rowCount);
            else if (msg.type === "done") resolve({ schema: msg.schema, rows: msg.rows });
            else if (msg.type === "error") reject(new Error(msg.error));
          };
          worker.postMessage(file);
        });

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ csvSchema: schema, rows }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onUploaded(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
      setLoading(false);
    } finally {
      worker.terminate();
    }
  }

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) void handleFile(file);
      }}
      className="group hover:border-brand-400 hover:bg-brand-50/30 hover:shadow-card flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-300 bg-white/50 px-6 py-10 text-center transition-all"
    >
      <div className="bg-brand-50 text-brand-500 group-hover:bg-brand-100 mb-4 flex size-14 items-center justify-center rounded-xl transition-colors">
        <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      </div>

      <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary mb-2">
        选择 CSV 文件
      </button>
      <p className="text-xs text-gray-400">或拖拽到此处</p>

      {progress > 0 && <p className="mt-3 text-xs text-gray-500">已解析 {progress} 行…</p>}
      {loading && <p className="text-brand-600 mt-2 text-xs font-medium">正在创建会话…</p>}
      {error && <p className="alert-error mt-3 py-2 text-xs">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
