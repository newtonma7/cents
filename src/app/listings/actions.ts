"use server";

import { z } from "zod";
import { createDraft, getDraft, saveDraft } from "@/lib/listings/server";
import {
  draftFormSchema, draftIdSchema, revisionSchema,
  type DraftMutationResult, type DraftSnapshot,
} from "@/lib/listings/draft";

const mutationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), id: draftIdSchema }),
  z.object({
    mode: z.literal("edit"), id: draftIdSchema,
    expectedRevision: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(revisionSchema),
  }),
]);

export async function submitDraft(formData: FormData): Promise<DraftMutationResult> {
  const raw = Object.fromEntries(formData);
  const fields = draftFormSchema.safeParse(raw);
  const mutation = mutationSchema.safeParse(raw);
  if (!fields.success || !mutation.success) {
    return { kind: "error", message: "Check the draft fields. Use a USD price from 0 to 21474836.47 with at most two decimal places." };
  }

  try {
    const input = { ...mutation.data, fields: fields.data };
    return input.mode === "create" ? await createDraft(input) : await saveDraft(input);
  } catch {
    return { kind: "error", message: "We could not save this draft. Your changes are still here. Try again." };
  }
}

type LoadDraftResult =
  | { kind: "loaded"; snapshot: DraftSnapshot }
  | { kind: "error"; message: string };

export async function loadDraft(id: string): Promise<LoadDraftResult> {
  try {
    const snapshot = await getDraft(id);
    return snapshot ? { kind: "loaded", snapshot } : { kind: "error", message: "This draft is no longer available." };
  } catch {
    return { kind: "error", message: "We could not load this draft. Your changes are still here. Try again." };
  }
}
