"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
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
import {
  type ChartRow,
  type EmptyReason,
  type ResolvedAxis,
  type ResolvedAxes,
  formatAxisNumber,
  formatAxisTitle,
  normalizeChartRows,
  readNumeric,
  resolveChartAxes,
  truncateAxisLabel,
} from "@/lib/chart/axes";
import {
  activeKeys,
  clearSelection,
  createSelection,
  describeSelection,
  formatSelectionValue,
  selectableItems,
  selectionSignature,
  toggleSelection,
  type SelectionRange,
} from "@/lib/chart/selection";
import {
  EXPORT_BACKGROUND,
  EXPORT_FONT_FAMILY,
  buildExportFileName,
  computeRasterSize,
  type ExportFormat,
} from "@/lib/chart/export";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

/** 选中描边：中性深灰，对任意 COLORS 填充和浅色背景都有对比度 */
const SELECTED_STROKE = "#111827";
/** hover 描边：浅灰，与选中态区分 */
const HOVER_STROKE = "#9ca3af";
/** 有选中时未选中项的透明度 */
const DIM_OPACITY = 0.28;

const CHART_MARGIN = { top: 8, right: 16, bottom: 32, left: 4 };

const EMPTY_TEXT: Record<EmptyReason, string> = {
  "no-data": "暂无数据",
  "no-numeric-field": "暂无数值字段，无法绘制坐标轴",
  "scatter-needs-number": "散点图需要数值型 X / Y 字段",
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** 只复制影响视觉的样式；字体统一回退系统 sans-serif，避免外部字体缺失 */
const SVG_STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "visibility",
] as const;

function cloneSvgForExport(svg: SVGSVGElement, width: number, height: number): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.fontFamily = EXPORT_FONT_FAMILY;

  const originals = svg.querySelectorAll<SVGElement>("*");
  const clones = clone.querySelectorAll<SVGElement>("*");
  originals.forEach((element, index) => {
    const target = clones[index];
    if (!target) return;
    const computed = window.getComputedStyle(element);
    for (const prop of SVG_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) target.style.setProperty(prop, value);
    }
  });

  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", EXPORT_BACKGROUND);
  clone.insertBefore(background, clone.firstChild);

  return clone;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadSvgImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("SVG 转图片失败"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 生成失败"));
    }, "image/png");
  });
}

type XAxisProps = ComponentProps<typeof XAxis>;
type YAxisProps = ComponentProps<typeof YAxis>;

interface Props {
  spec: ChartSpec;
  streaming?: boolean;
  /** 选中回调：把选中项的结构化描述注入上下文让 agent 续问 */
  onSelectRange?: (range: SelectionRange) => void;
}

/** Recharts 自定义 dot / shape 的入参，只声明用到的字段 */
interface MarkRenderProps {
  cx?: number;
  cy?: number;
  payload?: unknown;
  index?: number;
}

function buildXAxisProps(x: ResolvedAxis): XAxisProps {
  const numeric = x.scale === "number";

  return {
    dataKey: x.key || undefined,
    type: x.scale,
    name: x.label,
    domain: x.domain,
    tickCount: x.tickCount,
    tick: { fontSize: 11, fill: "#6b7280" },
    axisLine: { stroke: "#d1d5db" },
    tickLine: { stroke: "#d1d5db" },
    tickMargin: 6,
    minTickGap: 8,
    interval: numeric ? "preserveEnd" : "preserveStartEnd",
    allowDataOverflow: false,
    angle: x.rotateTicks ? -30 : 0,
    textAnchor: x.rotateTicks ? "end" : "middle",
    height: x.rotateTicks ? 62 : 36,
    tickFormatter: numeric
      ? (value: unknown) => formatAxisNumber(value)
      : (value: unknown) => truncateAxisLabel(value, x.rotateTicks ? 24 : 18),
    label: {
      value: truncateAxisLabel(formatAxisTitle(x.label, x.unit), 22),
      position: "insideBottom",
      offset: -28,
      style: { fontSize: 11, fill: "#6b7280" },
    },
  };
}

function buildYAxisProps(y: ResolvedAxis): YAxisProps {
  return {
    dataKey: y.key || undefined,
    type: "number",
    name: y.label,
    domain: y.domain,
    tickCount: y.tickCount,
    tick: { fontSize: 11, fill: "#6b7280" },
    axisLine: { stroke: "#d1d5db" },
    tickLine: { stroke: "#d1d5db" },
    tickMargin: 6,
    width: 64,
    allowDataOverflow: false,
    tickFormatter: (value: unknown) => formatAxisNumber(value),
    label: {
      value: truncateAxisLabel(formatAxisTitle(y.label, y.unit), 24),
      angle: -90,
      position: "insideLeft",
      style: { fontSize: 11, fill: "#6b7280" },
    },
  };
}

/** 返回元素数组，保证 Recharts 仍能直接识别 XAxis / YAxis 子组件 */
function renderCartesianAxes(axes: ResolvedAxes) {
  return [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#e5e7eb" />,
    <XAxis key="x" {...buildXAxisProps(axes.x)} />,
    <YAxis key="y" {...buildYAxisProps(axes.y)} />,
    <Tooltip key="tooltip" />,
  ];
}

function ChartEmpty({ reason, streaming }: { reason: EmptyReason; streaming?: boolean }) {
  const text = streaming && reason === "no-data" ? "数据接收中…" : EMPTY_TEXT[reason];

  return <div className="empty-state h-70">{text}</div>;
}

/**
 * 可交互图表：柱子 / 折线点 / 面积点 / 饼图扇区 / 散点均可点击选中，
 * 选中后注入上下文续问。从"看图"升级为"用图操控 agent"。
 */
export function InteractiveChart({ spec, streaming, onSelectRange }: Props) {
  const rows = useMemo(() => normalizeChartRows(spec.data), [spec.data]);
  const axes = useMemo(() => resolveChartAxes(spec, rows), [spec, rows]);

  /** 数值字段统一转 number，避免 Recharts 对数字字符串定位失败 */
  const chartData = useMemo<ChartRow[]>(() => {
    const keys = axes.x.scale === "number" ? [axes.x.key, axes.y.key] : [axes.y.key];
    const unique = Array.from(new Set(keys.filter(key => key !== "")));
    if (unique.length === 0) return rows;

    return rows.map(row => {
      const next: ChartRow = { ...row };
      for (const key of unique) {
        const numeric = readNumeric(row[key]);
        if (numeric !== null) next[key] = numeric;
      }
      return next;
    });
  }, [rows, axes.x.key, axes.x.scale, axes.y.key]);

  // 选中态：签名随数据/字段变化，签名一变旧选择自动失效
  const [selection, setSelection] = useState(createSelection);
  const signature = useMemo(() => selectionSignature(spec, axes, rows), [spec, axes, rows]);
  const selectedKeys = activeKeys(selection, signature);
  const hasSelection = selectedKeys.size > 0;

  const indexByRow = useMemo(() => {
    const map = new Map<ChartRow, number>();
    chartData.forEach((row, index) => map.set(row, index));
    return map;
  }, [chartData]);

  /** Recharts 各图形回调给到的 index 可能缺失，用原始行引用兜底 */
  const resolveIndex = (payload: unknown, index?: number): number => {
    if (typeof index === "number" && Number.isInteger(index) && index >= 0) return index;
    return indexByRow.get(payload as ChartRow) ?? -1;
  };

  const toggleAt = (index: number) => {
    if (!onSelectRange || index < 0) return;
    setSelection(prev => toggleSelection(prev, signature, String(index)));
  };

  const clearAll = () => setSelection(clearSelection(signature));

  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canExport = axes.ready && !streaming && !exporting;

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const handleExport = async (format: ExportFormat) => {
    setMenuOpen(false);
    setExportError(null);

    const svg = cardRef.current?.querySelector<SVGSVGElement>("svg");
    if (!svg) {
      setExportError("未找到图表内容，请稍后重试");
      return;
    }

    setExporting(true);
    try {
      const rect = svg.getBoundingClientRect();
      const size = computeRasterSize(rect.width, rect.height);
      const markup = new XMLSerializer().serializeToString(
        cloneSvgForExport(svg, size.width, size.height)
      );

      if (format === "svg") {
        downloadBlob(
          new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
          buildExportFileName(spec.title, "svg")
        );
        return;
      }

      const image = await loadSvgImage(markup);
      const canvas = document.createElement("canvas");
      canvas.width = size.pixelWidth;
      canvas.height = size.pixelHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器不支持 Canvas 导出");

      context.fillStyle = EXPORT_BACKGROUND;
      context.fillRect(0, 0, size.pixelWidth, size.pixelHeight);
      context.drawImage(image, 0, 0, size.pixelWidth, size.pixelHeight);

      const blob = await canvasToPngBlob(canvas);
      downloadBlob(blob, buildExportFileName(spec.title, "png"));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出失败，请重试");
    } finally {
      setExporting(false);
    }
  };

  const confirmSelect = () => {
    if (!onSelectRange || selectedKeys.size === 0) return;
    const range = describeSelection(spec, axes, rows, selectedKeys);
    if (!range) return;
    onSelectRange(range);
    setSelection(clearSelection(signature));
  };

  /** 折线 / 面积图的数据点：选中放大 + 深灰描边，未选中降透明度 */
  const renderDot = (props: MarkRenderProps) => {
    const index = resolveIndex(props.payload, props.index);
    if (index < 0) return <g />;

    const isSelected = selectedKeys.has(String(index));
    const dimmed = hasSelection && !isSelected;

    return (
      <circle
        cx={props.cx}
        cy={props.cy}
        r={isSelected ? 6.5 : 4}
        fill={isSelected ? COLORS[0] : "#ffffff"}
        fillOpacity={dimmed ? DIM_OPACITY : 1}
        stroke={isSelected ? SELECTED_STROKE : COLORS[0]}
        strokeOpacity={dimmed ? DIM_OPACITY : 1}
        strokeWidth={isSelected ? 2.5 : 2}
        className={onSelectRange ? "cursor-pointer" : undefined}
        onClick={() => toggleAt(index)}
      />
    );
  };

  /** 散点：同上，但默认填充为系列色 */
  const renderScatterShape = (props: MarkRenderProps) => {
    const index = resolveIndex(props.payload, props.index);
    if (index < 0) return <g />;

    const isSelected = selectedKeys.has(String(index));
    const dimmed = hasSelection && !isSelected;

    return (
      <circle
        cx={props.cx}
        cy={props.cy}
        r={isSelected ? 7 : 5}
        fill={COLORS[0]}
        fillOpacity={dimmed ? DIM_OPACITY : 1}
        stroke={isSelected ? SELECTED_STROKE : "#ffffff"}
        strokeOpacity={dimmed ? DIM_OPACITY : 1}
        strokeWidth={isSelected ? 2.5 : 1.5}
        className={onSelectRange ? "cursor-pointer" : undefined}
        onClick={() => toggleAt(index)}
      />
    );
  };

  const selectable = axes.ready && onSelectRange ? selectableItems(rows, axes) : [];

  return (
    <div
      ref={cardRef}
      className={`card p-4 transition-shadow ${
        streaming ? "chart-streaming" : "hover:shadow-card-hover"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
          {spec.title}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {hasSelection && (
            <>
              <button type="button" onClick={confirmSelect} className="btn-small-primary">
                基于选中({selectedKeys.size})追问 →
              </button>
              <button type="button" onClick={clearAll} className="btn-small-secondary">
                清空
              </button>
            </>
          )}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="下载图表"
              title="下载图表（PNG / SVG）"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={!canExport}
              onClick={() => setMenuOpen(open => !open)}
              className="btn-small-secondary"
            >
              {exporting ? "导出中…" : "下载"}
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="图表导出格式"
                className="shadow-dropdown absolute right-0 z-10 mt-1.5 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white py-1"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleExport("png")}
                  className="block w-full px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  导出 PNG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleExport("svg")}
                  className="block w-full px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  导出 SVG
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {exportError && (
        <p className="mb-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
          {exportError}
        </p>
      )}
      {!axes.ready ? (
        <ChartEmpty reason={axes.emptyReason ?? "no-data"} streaming={streaming} />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          {spec.type === "bar" ? (
            <BarChart data={chartData} margin={CHART_MARGIN}>
              {renderCartesianAxes(axes)}
              <Bar
                dataKey={axes.y.key}
                fill={COLORS[0]}
                onClick={(data: unknown, index: number) => toggleAt(resolveIndex(data, index))}
                cursor={onSelectRange ? "pointer" : "default"}
              >
                {chartData.map((_, i) => {
                  const isSelected = selectedKeys.has(String(i));
                  const dimmed = hasSelection && !isSelected;
                  return (
                    <Cell
                      key={i}
                      fill={COLORS[0]}
                      fillOpacity={dimmed ? DIM_OPACITY : 1}
                      stroke={isSelected ? SELECTED_STROKE : undefined}
                      strokeWidth={isSelected ? 2 : undefined}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          ) : spec.type === "line" ? (
            <LineChart data={chartData} margin={CHART_MARGIN}>
              {renderCartesianAxes(axes)}
              <Line
                dataKey={axes.y.key}
                stroke={COLORS[0]}
                strokeOpacity={hasSelection ? 0.45 : 1}
                type="monotone"
                dot={renderDot}
                activeDot={{
                  r: 5,
                  stroke: HOVER_STROKE,
                  strokeWidth: 2,
                  fill: "#ffffff",
                }}
              />
            </LineChart>
          ) : spec.type === "area" ? (
            <AreaChart data={chartData} margin={CHART_MARGIN}>
              {renderCartesianAxes(axes)}
              <Area
                dataKey={axes.y.key}
                fill={COLORS[0]}
                fillOpacity={hasSelection ? 0.15 : 0.3}
                stroke={COLORS[0]}
                strokeOpacity={hasSelection ? 0.45 : 1}
                type="monotone"
                dot={renderDot}
                activeDot={{
                  r: 5,
                  stroke: HOVER_STROKE,
                  strokeWidth: 2,
                  fill: "#ffffff",
                }}
              />
            </AreaChart>
          ) : spec.type === "pie" ? (
            <PieChart>
              <Pie
                data={chartData}
                dataKey={axes.y.key}
                nameKey={axes.x.key}
                cx="50%"
                cy="50%"
                outerRadius={100}
                onClick={(data: unknown, index: number) => toggleAt(resolveIndex(data, index))}
                cursor={onSelectRange ? "pointer" : "default"}
              >
                {chartData.map((_, i) => {
                  const isSelected = selectedKeys.has(String(i));
                  const dimmed = hasSelection && !isSelected;
                  return (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                      fillOpacity={dimmed ? DIM_OPACITY : 1}
                      stroke={isSelected ? SELECTED_STROKE : "#ffffff"}
                      strokeWidth={isSelected ? 3 : 1}
                    />
                  );
                })}
              </Pie>
              <Tooltip />
            </PieChart>
          ) : (
            <ScatterChart margin={CHART_MARGIN}>
              {renderCartesianAxes(axes)}
              <Scatter data={chartData} fill={COLORS[0]} shape={renderScatterShape} />
            </ScatterChart>
          )}
        </ResponsiveContainer>
      )}
      {selectable.length > 0 && (
        <details className="mt-3 border-t border-gray-100 pt-2">
          <summary className="cursor-pointer text-xs text-gray-400 transition-colors select-none hover:text-gray-600">
            键盘选择数据（{selectable.length} 项）
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectable.map(item => {
              const isSelected = selectedKeys.has(item.key);
              const value = formatSelectionValue(item.value);
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleAt(Number(item.key))}
                  className={
                    isSelected
                      ? "border-brand-500 bg-brand-50 text-brand-700 focus-visible:ring-brand-500 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      : "focus-visible:ring-brand-500 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:outline-none"
                  }
                >
                  {value ? `${item.label} · ${value}` : item.label}
                </button>
              );
            })}
          </div>
        </details>
      )}
      {spec.description && (
        <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500">
          {spec.description}
        </p>
      )}
    </div>
  );
}
