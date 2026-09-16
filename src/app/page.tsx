"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CsvUploader } from "@/components/upload/csv-uploader";
import { UserMenu } from "@/components/auth/user-menu";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>();

  const onUploaded = (sessionId: string) => {
    setSessionId(sessionId);
    router.push(`/analyze/${sessionId}`);
  };

  const questions = useMemo(
    () => [
      "分析各区域销售占比",
      "画出月度趋势并预测下季度",
      "找出异常波动的品类",
      "分析各品类销售占比",
    ],
    []
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-6 flex justify-end">
        <UserMenu />
      </div>

      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AI 数据分析看板</h1>
        <p className="mt-2 text-gray-500">上传 CSV，用自然语言提问，AI 流式出分析 + 可交互图表</p>
      </header>

      <CsvUploader loading={loading} setLoading={setLoading} onUploaded={onUploaded} />

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-gray-500">试试这些问题</h2>
        <ul className="grid gap-2 text-sm text-gray-600">
          {questions.map((question, index) => (
            <li key={index} className="rounded-lg border border-gray-200 p-3">
              {question}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
