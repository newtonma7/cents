import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { magicLinkSchema, passwordChangeSchema, passwordLoginSchema } from "@cents/contracts";
import { authenticate, requireSession, requestClient, type SessionClient } from "./auth.js";
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
  app.post("/api/auth/password", async (req, res) => {
    const parsed = passwordLoginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, "Enter a valid email address and password.");
    let result: Awaited<ReturnType<ReturnType<typeof requestClient>["auth"]["signInWithPassword"]>>;
    try {
      result = await requestClient(req, res, config).auth.signInWithPassword(parsed.data);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "Provider connection failed.") {
        throw new HttpError(503, "Sign-in is temporarily unavailable. Try again.");
      }
      throw error;
    }
    if (result.error) {
      const accountRejectionCodes = new Set([
        "invalid_credentials", "email_not_confirmed", "user_banned", "user_not_found",
      ]);
      if (result.error.code && accountRejectionCodes.has(result.error.code)) {
        throw new HttpError(401, "Email or password is incorrect.");
      }
      throw new HttpError(503, "Sign-in is temporarily unavailable. Try again.");
    }
    res.json({ kind: "signed-in" });
  });
  app.put("/api/account/password", async (req, res) => {
    const parsed = passwordChangeSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, "Enter matching passwords of at least 12 characters.");
    let client: SessionClient;
    try {
      ({ client } = await requireSession(req, res, config));
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status === 401) {
        throw new HttpError(401, "Sign in to change your password.");
      }
      throw error;
    }
    let error: Awaited<ReturnType<SessionClient["auth"]["updateUser"]>>["error"];
    try {
      ({ error } = await client.auth.updateUser({ password: parsed.data.password }));
    } catch {
      throw new HttpError(503, "We could not change your password. Try again.");
    }
    if (error) {
      if (error.status === 401 || error.code === "bad_jwt") {
        throw new HttpError(401, "Your session is no longer valid. Sign in again before changing your password.");
      }
      if (error.code === "weak_password" || error.code === "same_password") {
        throw new HttpError(422, "Choose a different password that meets the account requirements.");
      }
      if (["reauthentication_needed", "reauthentication_not_valid"].includes(error.code ?? "")) {
        throw new HttpError(403, "Sign out, then sign in again with a fresh magic link. Complete any additional verification if prompted.");
      }
      if (["insufficient_aal", "mfa_verification_failed"].includes(error.code ?? "")) {
        throw new HttpError(403, "Sign out, then sign in again with a fresh magic link. Complete any additional verification if prompted.");
      }
      throw new HttpError(503, "We could not change your password. Try again.");
    }
    res.json({ kind: "password-updated" });
  });
  app.post("/api/auth/logout", async (req, res) => {
    const { error } = await requestClient(req, res, config).auth.signOut({ scope: "local" });
    if (error) throw new HttpError(503, "We could not complete sign out. Try again.");
    res.status(204).end();
  });
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
    const { token_hash: hash, type, code, sb_flow_id: flowId } = req.query;
    const validCode = typeof code === "string" && code.length > 0 && code.length <= 2048
      && (flowId === undefined || (typeof flowId === "string" && flowId.length > 0 && flowId.length <= 128))
      && hash === undefined && type === undefined;
    const validHash = code === undefined && flowId === undefined
      && typeof hash === "string" && hash.length > 0 && hash.length <= 2048 && type === "email";
    const proof: { kind: "code"; value: string } | { kind: "hash"; value: string } | null =
      validCode ? { kind: "code", value: code } : validHash ? { kind: "hash", value: hash } : null;
    if (proof) {
      const client = requestClient(req, res, config);
      const { error } = proof.kind === "code"
        ? await client.auth.exchangeCodeForSession(proof.value, typeof flowId === "string" ? { flowId } : undefined)
        : await client.auth.verifyOtp({ token_hash: proof.value, type: "email" });
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
