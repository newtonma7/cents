import { z } from "zod";

const authCodeSchema = z.object({
  code: z.string().regex(/^[a-z_]{1,64}$/).optional(),
  error_code: z.string().regex(/^[a-z_]{1,64}$/).optional(),
});

export const providerFetch: typeof fetch = async (input, init) => {
  let response: Response;
  try { response = await fetch(input, init); }
  catch { throw new Error("Provider connection failed."); }
  if (response.ok) return response;
  const parsed = authCodeSchema.safeParse(await response.json().catch(() => null));
  const headers = new Headers({ "Content-Type": "application/json" });
  const version = response.headers.get("X-Supabase-Api-Version");
  if (version) headers.set("X-Supabase-Api-Version", version);
  return new Response(JSON.stringify({
    ...(parsed.success ? parsed.data : {}),
    message: "Provider request failed.",
  }), {
    status: response.status === 429 || response.status >= 500 ? 503 : response.status,
    headers,
  });
};
