"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  sessionId: string;
  title: string;
}

/** 会话重命名 / 删除，删除前二次确认 */
export function SessionActions({ sessionId, title }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveTitle() {
    const next = draft.trim();
    if (!next || next === title) {
      setEditing(false);
      setDraft(title);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm(
      `确定删除「${title}」吗？会一并删除该数据集的对话、报告和向量，且无法恢复。`
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
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

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          className="input py-1 text-xs"
          aria-label="会话名称"
          autoFocus
        />
        <button type="button" className="btn-small-primary" onClick={saveTitle} disabled={busy}>
          保存
        </button>
        <button
          type="button"
          className="btn-small-secondary"
          onClick={() => {
            setEditing(false);
            setDraft(title);
          }}
          disabled={busy}
        >
          取消
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn-small-secondary" onClick={() => setEditing(true)}>
        重命名
      </button>
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
