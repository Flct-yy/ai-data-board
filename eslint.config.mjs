import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tailwind from "eslint-plugin-tailwindcss";
import prettier from "eslint-config-prettier";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  tailwind.configs.recommended,
  {
    plugins: {
      tailwindcss: tailwind,
    },
    rules: {
      "next/no-html-link-for-pages": "off",
      "tailwindcss/classnames-order": "error",
      "tailwindcss/no-custom-classname": "off",
    },
    settings: {
      tailwindcss: {
        config: "./tailwind.config.js",
      },
    },
  },
  prettier,
  globalIgnores([".next/**", "out/**", "node_modules/**", "dist/**"]),
]);
