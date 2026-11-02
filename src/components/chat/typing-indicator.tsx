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
      className="shadow-card inline-flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-500"
    >
      <span className="text-gray-600">{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1 motion-reduce:hidden">
        <span className="animate-bounce-high bg-brand-500 size-1.5 rounded-full [animation-delay:-0.3s]" />
        <span className="animate-bounce-high bg-brand-500 size-1.5 rounded-full [animation-delay:-0.15s]" />
        <span className="animate-bounce-high bg-brand-500 size-1.5 rounded-full" />
      </span>
      <span aria-hidden="true" className="hidden motion-reduce:inline">
        …
      </span>
    </div>
  );
}
