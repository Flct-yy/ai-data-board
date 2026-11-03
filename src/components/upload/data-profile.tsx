"use client";

import { useState } from "react";
import type { ColumnGlossaryMap, DataProfile } from "@/types";
import { guessUnit } from "@/lib/csv/glossary";

interface Props {
  profile?: DataProfile;
  sessionId?: string;
  glossary?: ColumnGlossaryMap;
}

interface DraftEntry {
  unit: string;
  note: string;
}

function buildDraft(profile: DataProfile | undefined, glossary?: ColumnGlossaryMap) {
  const draft: Record<string, DraftEntry> = {};

  for (const col of profile?.columns ?? []) {
    draft[col.name] = {
      unit: glossary?.[col.name]?.unit ?? guessUnit(col.name) ?? "",
      note: glossary?.[col.name]?.note ?? "",
    };
  }

  return draft;
}

/** 上传后的紧凑数据体检，默认折叠；同时可编辑列口径（单位 / 业务说明） */
export function DataProfilePanel({ profile, sessionId, glossary }: Props) {
  const [draft, setDraft] = useState<Record<string, DraftEntry>>(() =>
    buildDraft(profile, glossary)
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  if (!profile) return null;

  function update(name: string, key: keyof DraftEntry, value: string) {
    setDraft(current => ({
      ...current,
      [name]: { ...current[name], [key]: value },
    }));
    setStatus("idle");
  }

  async function save() {
    if (!sessionId || !profile) return;

    setStatus("saving");
    setError("");

    const updates: ColumnGlossaryMap = {};
    for (const col of profile.columns) {
      updates[col.name] = {
        label: glossary?.[col.name]?.label,
        unit: draft[col.name]?.unit ?? "",
        note: draft[col.name]?.note ?? "",
      };
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ glossary: updates }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <details className="card mb-3 px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-gray-700">
        数据体检
        <span className="ml-2 text-xs font-normal text-gray-400">
          {profile.rowCount} 行 · {profile.columnCount} 列
        </span>
      </summary>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {profile.columns.map(col => (
          <div
            key={col.name}
            className="rounded-lg border border-gray-100 bg-gray-50/50 p-2 text-xs text-gray-600"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium break-all text-gray-700">{col.name}</span>
              <span className="shrink-0 text-gray-400">{col.type}</span>
            </div>
            <div className="mt-1">缺失 {(col.missingRate * 100).toFixed(1)}%</div>
            {col.min !== undefined && col.max !== undefined && (
              <div>
                范围 {col.min} ~ {col.max}
                {col.mean !== undefined && ` · 均值 ${col.mean}`}
              </div>
            )}
            {col.topValues && col.topValues.length > 0 && (
              <div className="mt-1 break-all text-gray-500">
                Top: {col.topValues.map(v => `${v.value}(${v.count})`).join(", ")}
              </div>
            )}
            {col.highCardinality && <div className="mt-1 text-gray-400">高基数字段</div>}
            {col.outlierCount !== undefined && col.outlierCount > 0 && (
              <div className="mt-1 text-amber-600">疑似异常值 {col.outlierCount} 个</div>
            )}

            <div className="mt-2 grid gap-1.5">
              <input
                value={draft[col.name]?.unit ?? ""}
                onChange={event => update(col.name, "unit", event.target.value)}
                placeholder={
                  guessUnit(col.name) ? `单位（如 ${guessUnit(col.name)}）` : "单位（可选）"
                }
                aria-label={`${col.name} 单位`}
                className="focus:border-brand-500 focus:ring-brand-500/30 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:ring-1 focus:outline-none"
              />
              <input
                value={draft[col.name]?.note ?? ""}
                onChange={event => update(col.name, "note", event.target.value)}
                placeholder="业务说明（可选）"
                aria-label={`${col.name} 业务说明`}
                className="focus:border-brand-500 focus:ring-brand-500/30 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:ring-1 focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      {profile.truncated && <p className="mt-2 text-xs text-gray-400">字段过多，仅展示前 24 列</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-small-primary"
          onClick={save}
          disabled={!sessionId || status === "saving"}
        >
          {status === "saving" ? "保存中…" : "保存口径"}
        </button>
        <p className="text-xs text-gray-400">单位与说明会随字段一起注入 AI 上下文</p>
        {status === "saved" && <span className="text-xs text-green-600">已保存</span>}
        {status === "error" && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </details>
  );
}
