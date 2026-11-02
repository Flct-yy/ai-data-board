"use client";

interface Props {
  label?: string;
}

/** AI 尚未输出内容时的等待气泡；reduced-motion 下退化为静态省略号 */
export function TypingIndicator({ label = "AI 正在思考" }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-500 shadow-card"
    >
      <span className="text-gray-600">{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1 motion-reduce:hidden">
        <span className="h-1.5 w-1.5 animate-bounce-high rounded-full bg-brand-500 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce-high rounded-full bg-brand-500 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce-high rounded-full bg-brand-500" />
      </span>
      <span aria-hidden="true" className="hidden motion-reduce:inline">
        …
      </span>
    </div>
  );
}
