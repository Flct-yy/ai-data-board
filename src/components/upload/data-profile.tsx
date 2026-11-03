import type { DataProfile } from "@/types";

interface Props {
  profile?: DataProfile;
}

/** 上传后的紧凑数据体检，默认折叠，避免占用聊天区高度 */
export function DataProfilePanel({ profile }: Props) {
  if (!profile) return null;

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
          </div>
        ))}
      </div>

      {profile.truncated && <p className="mt-2 text-xs text-gray-400">字段过多，仅展示前 24 列</p>}
    </details>
  );
}
