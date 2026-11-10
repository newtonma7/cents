import { Effect } from "effect";
import { Router } from "express";
import { createDraftSchema, draftFormSchema, draftIdSchema, invalidFieldsMessage, saveDraftSchema } from "@cents/contracts";
import { requireSession } from "./auth.js";
import type { ApiConfig } from "./config.js";
import { HttpError } from "./errors.js";
import {
  createDraft, ListingReads, makeListingReads, saveDraft, type ListingReadFailure,
} from "./listings.js";

async function runListingRead<A>(
  session: Awaited<ReturnType<typeof requireSession>>,
  program: Effect.Effect<A, ListingReadFailure, ListingReads>,
): Promise<A> {
  const provided = Effect.provideService(program, ListingReads, makeListingReads(session));
  return Effect.runPromise(Effect.mapError(provided, (failure) => {
    switch (failure._tag) {
      case "ListingReadUnavailable":
        return new HttpError(503, failure.operation === "collection"
          ? "Could not load canonical listings."
          : "Could not load this draft.");
      case "InvalidListingData":
        return new Error("Invalid listing data.");
      default: {
        const exhaustive: never = failure;
        return exhaustive;
      }
    }
  }));
}

export function listingRoutes(config: ApiConfig) {
  const router = Router();
  router.get("/", async (req, res) => {
    const session = await requireSession(req, res, config);
    const listings = await runListingRead(session, Effect.gen(function* () {
      const reads = yield* ListingReads;
      return yield* reads.list();
    }));
    res.json({ listings });
  });
  router.get("/:id", async (req, res) => {
    const session = await requireSession(req, res, config);
    const snapshot = await runListingRead(session, Effect.gen(function* () {
      const reads = yield* ListingReads;
      return yield* reads.get(req.params.id);
    }));
    if (!snapshot) { res.status(404).json({ kind: "missing" }); return; }
    res.json({ kind: "loaded", snapshot });
  });
  router.post("/", async (req, res) => {
    const session = await requireSession(req, res, config);
    const command = createDraftSchema.safeParse(req.body);
    if (!command.success) throw new HttpError(422, invalidFieldsMessage);
    const fields = draftFormSchema.safeParse(command.data.fields);
    if (!fields.success) throw new HttpError(422, invalidFieldsMessage);
    const result = await createDraft(session, { id: command.data.id, fields: fields.data });
    res.status(result.kind === "created" ? 201 : result.kind === "conflict" ? 409 : 503).json(result);
  });
  router.put("/:id", async (req, res) => {
    const session = await requireSession(req, res, config);
    const id = draftIdSchema.safeParse(req.params.id);
    if (!id.success) { res.status(404).json({ kind: "missing" }); return; }
    const command = saveDraftSchema.safeParse(req.body);
    if (!command.success) throw new HttpError(422, invalidFieldsMessage);
    const fields = draftFormSchema.safeParse(command.data.fields);
    if (!fields.success) throw new HttpError(422, invalidFieldsMessage);
    const result = await saveDraft(session, {
      id: id.data, fields: fields.data,
    });
    res.status(result.kind === "missing" ? 404 : result.kind === "error" ? 503 : 200).json(result);
  });
  return router;
}
