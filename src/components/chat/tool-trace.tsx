'use client';

import type { ToolInvocation } from 'ai';

/**
 * 工具调用中间态可视化：把 ReAct 每步的 tool name + 参数 + 结果实时展示。
 * 让 agent 不是黑盒，用户能看到 think-act-observe 的过程。
 */
export function ToolTrace({ invocations }: { invocations: ToolInvocation[] }) {
  return (
    <div className="mt-2 space-y-1 border-l-2 border-brand-200 pl-2">
      {invocations.map((ti, i) => (
        <div key={i} className="text-xs text-gray-500">
          <span
            className={`inline-block rounded px-1.5 py-0.5 font-mono ${
              ti.state === 'result'
                ? 'bg-green-50 text-green-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {ti.toolName}
          </span>
          <span className="ml-1">
            {ti.state === 'result' ? '✓ 完成' : '⏳ 执行中'}
          </span>
          {ti.state === 'result' && ti.result != null && (
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[10px]">
              {typeof ti.result === 'string'
                ? ti.result.slice(0, 300)
                : JSON.stringify(ti.result, null, 2).slice(0, 300)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
