import { expect, test } from "@playwright/test";
import { ESLint } from "eslint";

test("standard lint rejects former backend imports and Server Actions in web", async () => {
  const eslint = new ESLint();
  for (const code of [
    'import { createServerClient } from "@supabase/ssr";',
    'import { cookies } from "next/headers";',
    'import "server-only";',
    'import { getDraft } from "@/lib/listings/server";',
    'import type { ApiConfig } from "../../../../api/src/config";',
    '"use server"; export async function oldAction() {}',
    'export async function oldAction() { "use server"; return 1; }',
  ]) {
    const [result] = await eslint.lintText(code, { filePath: "apps/web/src/lib/old-backend.ts" });
    expect(result.messages.some(({ ruleId }) => ruleId === "no-restricted-imports" || ruleId === "no-restricted-syntax"), code).toBe(true);
  }
  const [pure] = await eslint.lintText('import { emptyDraftInput } from "@cents/contracts"; export { emptyDraftInput };', {
    filePath: "apps/web/src/lib/pure-contract.ts",
  });
  expect(pure.errorCount).toBe(0);
});
