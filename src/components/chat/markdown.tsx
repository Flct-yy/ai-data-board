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
  h1: ({ children }) => <h1 className="mb-2 mt-1 text-lg font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-1 text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-1 text-sm font-semibold">{children}</h3>,
  p: ({ children }) => <p className="my-1.5">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline">
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-gray-100 p-3 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-gray-300 pl-3 italic">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
  hr: () => <hr className="my-2 border-gray-200" />,
};

/**
 * AI 输出文本的 Markdown 渲染组件。
 * @param children markdown 源文本
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="break-words text-sm leading-relaxed text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
