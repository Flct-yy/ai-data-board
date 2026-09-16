"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ChartSpec } from "@/types";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

interface Props {
  spec: ChartSpec;
  streaming?: boolean;
  /** 圈选回调：把选中维度注入上下文让 agent 续问 */
  onSelectRange?: (range: { xKey: string; values: string[] }) => void;
}

/**
 * 可交互图表：支持点击柱子/点选中，圈选后注入上下文续问。
 * 从"看图"升级为"用图操控 agent"。
 */
export function InteractiveChart({ spec, streaming, onSelectRange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleBarClick = (data: Record<string, unknown>) => {
    if (!onSelectRange || !spec.xKey) return;
    const val = String(data?.[spec.xKey] ?? "");
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  const confirmSelect = () => {
    if (!onSelectRange || !spec.xKey || selected.size === 0) return;
    onSelectRange({ xKey: spec.xKey, values: Array.from(selected) });
    setSelected(new Set());
  };

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip />
    </>
  );

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 ${
        streaming ? "chart-streaming" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{spec.title}</h3>
        {selected.size > 0 && (
          <button
            onClick={confirmSelect}
            className="rounded bg-brand-600 px-2 py-1 text-xs text-white hover:bg-brand-700"
          >
            基于选中({selected.size})追问 →
          </button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        {spec.type === "bar" ? (
          <BarChart data={spec.data}>
            {axes}
            <Bar
              dataKey={spec.yKey}
              fill={COLORS[0]}
              onClick={handleBarClick}
              cursor={onSelectRange ? "pointer" : "default"}
            />
          </BarChart>
        ) : spec.type === "line" ? (
          <LineChart data={spec.data}>
            {axes}
            <Line dataKey={spec.yKey} stroke={COLORS[0]} type="monotone" />
          </LineChart>
        ) : spec.type === "area" ? (
          <AreaChart data={spec.data}>
            {axes}
            <Area
              dataKey={spec.yKey}
              fill={COLORS[0]}
              fillOpacity={0.3}
              stroke={COLORS[0]}
              type="monotone"
            />
          </AreaChart>
        ) : spec.type === "pie" ? (
          <PieChart>
            <Pie
              data={spec.data}
              dataKey={spec.yKey}
              nameKey={spec.xKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
            >
              {spec.data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : (
          <ScatterChart>
            {axes}
            <Scatter data={spec.data} fill={COLORS[0]} />
          </ScatterChart>
        )}
      </ResponsiveContainer>
      {spec.description && <p className="mt-2 text-xs text-gray-500">{spec.description}</p>}
    </div>
  );
}
