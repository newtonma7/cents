import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { magicLinkSchema } from "@cents/contracts";
import { authenticate, requestClient } from "./auth.js";
import type { ApiConfig } from "./config.js";
import { HttpError } from "./errors.js";
import { listingRoutes } from "./listing-routes.js";

export function createApp(config: ApiConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) => { res.json({ ok: true }); });
  app.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
    next();
  });
  app.use((req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("origin") !== config.webOrigin) throw new HttpError(403, "Request origin is not allowed.");
      if (!req.is("application/json")) throw new HttpError(415, "Use application/json.");
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.post("/api/auth/magic-link", async (req, res) => {
    const parsed = magicLinkSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, "Enter a valid email address.");
    const client = requestClient(req, res, config);
    const { error } = await client.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: config.webOrigin + "/auth/confirm", shouldCreateUser: true },
    });
    if (error) throw new HttpError(503, "We could not send that link. Try again.");
    res.json({ kind: "sent" });
  });
  app.get("/auth/confirm", async (req, res) => {
    const { token_hash: hash, type } = req.query;
    if (typeof hash === "string" && hash.length > 0 && hash.length <= 2048 && type === "email") {
      const client = requestClient(req, res, config);
      const { error } = await client.auth.verifyOtp({ token_hash: hash, type: "email" });
      if (!error) { res.redirect(303, config.webOrigin + "/listings"); return; }
      if (![400, 401, 403, 422].includes(error.status ?? 0)) {
        throw new HttpError(503, "Sign-in is temporarily unavailable. Try again.");
      }
    }
    res.redirect(303, config.webOrigin + "/?error=That%20sign-in%20link%20is%20invalid%20or%20expired.");
  });
  app.get("/api/session", async (req, res) => {
    const seller = await authenticate(requestClient(req, res, config));
    res.json({ seller });
  });
  app.use("/api/listings", listingRoutes(config));
  app.use((_req, _res, next) => next(new HttpError(404, "Not found.")));
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof HttpError) { res.status(error.status).json({ kind: "error", message: error.message }); return; }
    if (error instanceof SyntaxError && "body" in error) { res.status(400).json({ kind: "error", message: "Malformed JSON." }); return; }
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
      res.status(413).json({ kind: "error", message: "Request body is too large." }); return;
    }
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    console.error(JSON.stringify({ event: "api.unexpected_error", requestId, errorCategory: "unexpected_error" }));
    res.status(500).json({ kind: "error", message: "We could not complete this request. Try again." });
  };
  app.use(handleError);
  return app;
}
