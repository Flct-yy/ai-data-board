import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next.js 14 内置支持 new Worker(new URL('./x.worker.ts', import.meta.url))
  // 无需额外 webpack 配置
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default nextConfig;
