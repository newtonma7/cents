import { Router } from "express";
import { createDraftSchema, draftFormSchema, invalidFieldsMessage, saveDraftSchema } from "@cents/contracts";
import { requireSession } from "./auth.js";
import type { ApiConfig } from "./config.js";
import { HttpError } from "./errors.js";
import { createDraft, getDraft, listDrafts, saveDraft } from "./listings.js";

export function listingRoutes(config: ApiConfig) {
  const router = Router();
  router.get("/", async (req, res) => {
    const session = await requireSession(req, res, config);
    res.json({ listings: await listDrafts(session) });
  });
  router.get("/:id", async (req, res) => {
    const session = await requireSession(req, res, config);
    const snapshot = await getDraft(session, req.params.id);
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
    res.status(result.kind === "created" ? 201 : 503).json(result);
  });
  router.put("/:id", async (req, res) => {
    const session = await requireSession(req, res, config);
    const existing = await getDraft(session, req.params.id);
    if (!existing) { res.status(404).json({ kind: "missing" }); return; }
    const command = saveDraftSchema.safeParse(req.body);
    if (!command.success) throw new HttpError(422, invalidFieldsMessage);
    const fields = draftFormSchema.safeParse(command.data.fields);
    if (!fields.success) throw new HttpError(422, invalidFieldsMessage);
    const result = await saveDraft(session, {
      id: existing.id, fields: fields.data, expectedRevision: command.data.expectedRevision,
    });
    res.status(result.kind === "conflict" ? 409 : result.kind === "missing" ? 404 : result.kind === "error" ? 503 : 200).json(result);
  });
  return router;
}
