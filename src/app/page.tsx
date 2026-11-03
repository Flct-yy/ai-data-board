"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CsvUploader } from "@/components/upload/csv-uploader";
import { UserMenu } from "@/components/auth/user-menu";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false);

  const onUploaded = (sessionId: string) => {
    router.push(`/analyze/${sessionId}`);
  };

  const questions = [
    "这份数据最值得关注的结论是什么？",
    "帮我检查缺失值、异常值和数据质量问题",
    "先做一份整体数据概览",
    "有哪些值得进一步分析的维度？",
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <div className="mb-6 flex justify-end">
        <UserMenu />
      </div>

      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">AI 数据分析看板</h1>
        <p className="mt-2 text-gray-500">上传 CSV，用自然语言提问，AI 流式出分析 + 可交互图表</p>
      </header>

      <CsvUploader loading={loading} setLoading={setLoading} onUploaded={onUploaded} />

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-gray-500">试试这些问题</h2>
        <ul className="grid gap-2 text-sm text-gray-600">
          {questions.map((question, index) => (
            <li
              key={index}
              className="card hover:border-brand-200 hover:bg-brand-50/30 cursor-default p-3 text-gray-600 transition-colors"
            >
              {question}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
