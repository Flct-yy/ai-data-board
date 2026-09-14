export const dynamic = 'force-dynamic';

export default async function AnalyzePage({
  params,
}: {
  params: { sessionId: string };
}) {
  return (
    <main className="mx-auto flex h-screen max-w-7xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            {'数据分析'}
          </h1>
          <p className="text-xs text-gray-500">
            5 行
          </p>
        </div>
        <a href="/history" className="text-sm text-brand-600 hover:underline">
          历史报告
        </a>
      </header>
    </main>
  );
}
