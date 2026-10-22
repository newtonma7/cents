import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/listings/page.tsx", "src/app/listings/*/page.tsx"],
    // Document navigation lets beforeunload protect dirty drafts, including browser Back.
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([".next/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
]);
