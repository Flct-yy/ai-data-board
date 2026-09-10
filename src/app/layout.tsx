import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 数据分析看板',
  description: '上传 CSV，自然语言提问，AI 流式出分析 + 可交互图表',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
