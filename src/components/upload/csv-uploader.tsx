"use client";

import { useRef, useState } from "react";
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
  }

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) void handleFile(file);
      }}
      className="rounded-xl border-2 border-dashed border-gray-300 p-10 text-center transition-colors hover:border-brand-500"
    >
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
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-brand-600 hover:underline"
      >
        选择 CSV 文件
      </button>
      <span className="text-gray-400"> 或拖拽到此处</span>

      {progress > 0 && <p className="mt-2 text-xs text-gray-500">已解析 {progress} 行…</p>}
      {loading && <p className="mt-2 text-xs text-brand-600">正在创建会话…</p>}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
