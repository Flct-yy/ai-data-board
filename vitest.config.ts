import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    environmentMatchGlobs: [
      // 你的测试全在 __tests__ 下，全部切 node
      ['**/utils/__tests__/**/*.test.ts', 'node'],
      ['**/middleware.test.ts', 'node'],
      ['**/app/api/**/*.test.ts', 'node'],
    ],
  },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
});