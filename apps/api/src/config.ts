import { z } from "zod";

const originSchema = z.url().transform((value, ctx) => {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    ctx.addIssue({ code: "custom", message: "Expected an HTTP origin." });
    return z.NEVER;
  }
  return url.origin;
});
const configurationSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: originSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});
export function readConfig(env: NodeJS.ProcessEnv) {
  const parsed = configurationSchema.safeParse(env);
  if (!parsed.success) throw new Error("Invalid API configuration. Check required environment variables.");
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    webOrigin: parsed.data.NEXT_PUBLIC_SITE_URL,
    port: parsed.data.PORT,
  };
}
export type ApiConfig = ReturnType<typeof readConfig>;
