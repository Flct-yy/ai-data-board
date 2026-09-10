"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AI 数据分析看板</h1>
        <p className="mt-2 text-gray-500">
          上传 CSV，用自然语言提问，AI 流式出分析 + 可交互图表
        </p>
      </header>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-gray-500">试试这些问题</h2>
        <ul className="grid gap-2 text-sm text-gray-600">
          <li className="rounded-lg border border-gray-200 p-3">
            分析各区域销售占比
          </li>
          <li className="rounded-lg border border-gray-200 p-3">
            画出月度趋势并预测下季度
          </li>
          <li className="rounded-lg border border-gray-200 p-3">
            找出异常波动的品类
          </li>
        </ul>
      </section>
    </main>
  );
}
