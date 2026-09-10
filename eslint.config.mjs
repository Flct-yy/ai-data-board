import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tailwind from "eslint-plugin-tailwindcss";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  tailwind.configs.recommended,
  {
    rules: {
      "next/no-html-link-for-pages": "off",
    },
    settings: {
      tailwindcss: {
        cssConfigPath: "./src/app/globals.css",
      },
    },
  },
  globalIgnores([".next/**", "out/**", "node_modules/**", "dist/**"]),
]);
