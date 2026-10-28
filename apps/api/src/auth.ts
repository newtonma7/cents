import { createServerClient } from "@supabase/ssr";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { parse, serialize } from "cookie";
import type { Request, Response } from "express";
import { sellerSchema } from "@cents/contracts";
import type { ApiConfig } from "./config.js";
import { HttpError } from "./errors.js";
import { providerFetch } from "./provider-fetch.js";

export function requestClient(req: Request, res: Response, config: ApiConfig) {
  const cookies = parse(req.headers.cookie ?? "");
  return createServerClient(config.supabaseUrl, config.supabaseKey, {
    global: { fetch: providerFetch },
    cookieOptions: {
      httpOnly: true, secure: new URL(config.webOrigin).protocol === "https:",
      sameSite: "lax", path: "/",
    },
    cookies: {
      getAll: () => Object.entries(cookies).flatMap(([name, value]) =>
        value === undefined ? [] : [{ name, value }]),
      setAll: (updates) => {
        for (const { name, value, options } of updates) {
          cookies[name] = value;
          res.append("Set-Cookie", serialize(name, value, {
            ...options, domain: undefined, httpOnly: true,
            secure: new URL(config.webOrigin).protocol === "https:",
            sameSite: "lax", path: "/",
          }));
        }
      },
    },
  });
}
export type SessionClient = ReturnType<typeof requestClient>;

export async function requireSession(req: Request, res: Response, config: ApiConfig) {
  const client = requestClient(req, res, config);
  return { client, seller: await authenticate(client) };
}

export async function authenticate(client: SessionClient) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error) {
    if (isAuthSessionMissingError(error) || [400, 401, 403].includes(error.status ?? 0)) {
      throw new HttpError(401, "Sign in to save a draft.");
    }
    throw new HttpError(503, "Sign-in is temporarily unavailable. Try again.");
  }
  if (!user) throw new HttpError(401, "Sign in to save a draft.");
  return sellerSchema.parse({ id: user.id, email: user.email });
}
