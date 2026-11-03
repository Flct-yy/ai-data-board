"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  reportId: string;
}

/** 删除单条报告，删除前二次确认 */
export function ReportDeleteButton({ reportId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    const confirmed = window.confirm("确定删除这条报告吗？删除后无法恢复。");
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-small-secondary hover:border-red-300 hover:text-red-600"
        onClick={remove}
        disabled={busy}
      >
        删除
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
