import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { next: { rootDir: "apps/web/" } } },
  {
    files: ["apps/api/**/*.ts"],
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] },
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["server-only", "next/headers", "next/server"],
        patterns: ["@supabase/*", "@cents/api", "@cents/api/*", "**/apps/api/**", "**/api/src/**", "**/supabase/**", "@/lib/listings/server"],
      }],
      "no-restricted-syntax": ["error", {
        selector: "ExpressionStatement[directive='use server']",
        message: "Server Actions belong in the Express API, not the frontend.",
      }],
    },
  },
  {
    files: ["packages/contracts/src/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: ["@supabase/*", "@cents/api", "@cents/api/*", "next", "next/*", "react", "node:*", "**/apps/**"] }] },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  globalIgnores(["**/.next/**", "**/dist/**", "playwright-report/**", "test-results/**", "**/next-env.d.ts"]),
]);
