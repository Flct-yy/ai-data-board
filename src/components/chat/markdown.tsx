import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * AI 输出的 Markdown 渲染。
 * 用 react-markdown + remark-gfm 把模型返回的 md 文本渲染成结构化内容
 * （标题 / 列表 / 表格 / 代码块 / 加粗 等），替代原先的纯文本 div。
 *
 * 这里不引 @tailwindcss/typography 的 prose 类（省一个依赖），
 * 改用 components 映射为常用元素加上基础样式，聊天气泡里足够。
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-2 mb-3 text-lg font-semibold text-gray-900">{children}</h1>
  ),
  h2: ({ children }) => <h2 className="my-2 text-base font-semibold text-gray-900">{children}</h2>,
  h3: ({ children }) => <h3 className="my-1.5 text-sm font-semibold text-gray-900">{children}</h3>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="text-gray-700 italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-brand-300 bg-brand-50/40 my-2 border-l-3 py-1 pl-3 text-gray-600 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-gray-100 px-3 py-1.5 text-gray-600">{children}</td>
  ),
  hr: () => <hr className="my-4 border-gray-200" />,
};

/**
 * AI 输出文本的 Markdown 渲染组件。
 * @param children markdown 源文本
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed wrap-break-word text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
