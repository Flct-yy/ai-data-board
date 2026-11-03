/** 导出参数与文件名的纯函数，DOM 序列化留在组件里 */

export const EXPORT_PIXEL_RATIO = 2;
export const EXPORT_BACKGROUND = "#ffffff";
export const EXPORT_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const EXPORT_DEFAULT_SIZE = { width: 640, height: 360 };

export type ExportFormat = "png" | "svg";

export interface ExportRasterSize {
  /** 逻辑宽高（CSS 像素） */
  width: number;
  height: number;
  scale: number;
  /** 实际画布宽高（设备像素） */
  pixelWidth: number;
  pixelHeight: number;
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** 去掉文件名非法字符与首尾点号，超长截断，空标题回退 fallback */
export function sanitizeExportTitle(
  title: string | undefined,
  fallback = "chart",
  maxLength = 60
): string {
  const cleaned = (title ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(ILLEGAL_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .trim();

  if (!cleaned) return fallback;
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() || fallback;
}

/** 本地时间戳 YYYYMMDD-HHmmss，用于避免重名 */
export function formatExportTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) return "00000000-000000";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** chart.png / 销售趋势-20261102-150405.png */
export function buildExportFileName(
  title: string | undefined,
  format: ExportFormat,
  date: Date = new Date()
): string {
  return `${sanitizeExportTitle(title)}-${formatExportTimestamp(date)}.${format}`;
}

/** 由 SVG 的显示尺寸推导 2x 画布尺寸；非法尺寸回退默认值，避免 canvas 为 0 */
export function computeRasterSize(
  width: number,
  height: number,
  scale: number = EXPORT_PIXEL_RATIO
): ExportRasterSize {
  const safeDimension = (value: number, fallback: number) =>
    Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : EXPORT_PIXEL_RATIO;
  const logicalWidth = safeDimension(width, EXPORT_DEFAULT_SIZE.width);
  const logicalHeight = safeDimension(height, EXPORT_DEFAULT_SIZE.height);

  return {
    width: logicalWidth,
    height: logicalHeight,
    scale: safeScale,
    pixelWidth: Math.round(logicalWidth * safeScale),
    pixelHeight: Math.round(logicalHeight * safeScale),
  };
}
