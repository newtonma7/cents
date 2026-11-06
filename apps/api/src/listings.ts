import { z } from "zod";
import type { SessionClient } from "./auth.js";
import type { Seller } from "@cents/contracts";
import { HttpError } from "./errors.js";
import {
  draftFieldsSchema, draftIdSchema, revisionSchema, sameDraftFields,
  type DraftFields, type DraftMutationResult, type DraftSnapshot, type SaveDraftResult,
} from "@cents/contracts";

const dashboardColumns = "id, seller_id, title, description";
const snapshotColumns = `id, seller_id, ${Object.keys(draftFieldsSchema.shape).join(", ")}, revision, created_at, updated_at`;
const listingOwnerSchema = z.object({ id: draftIdSchema, seller_id: z.string().uuid() });
const dashboardSchema = listingOwnerSchema.extend(draftFieldsSchema.pick({
  title: true, description: true,
}).shape);
const snapshotSchema = listingOwnerSchema.extend(draftFieldsSchema.shape).extend({
  revision: revisionSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).transform((row): DraftSnapshot => ({
  id: row.id,
  fields: draftFieldsSchema.parse(row),
  revision: row.revision,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

type ListingSession = { client: SessionClient; seller: Seller };
const saveError = { kind: "error", message: "We could not save this draft. Try again." } satisfies SaveDraftResult;

async function readSnapshot(supabase: SessionClient, id: DraftSnapshot["id"], sellerId: string) {
  const { data, error } = await supabase.from("canonical_listings")
    .select(snapshotColumns).eq("id", id).eq("seller_id", sellerId).maybeSingle();
  if (error) throw new HttpError(503, "Could not load this draft.");
  return data === null ? null : snapshotSchema.parse(data);
}

export async function getDraft({ client: supabase, seller }: ListingSession, id: string): Promise<DraftSnapshot | null> {
  const parsedId = draftIdSchema.safeParse(id);
  if (!parsedId.success) return null;
  return readSnapshot(supabase, parsedId.data, seller.id);
}

export async function createDraft({ client: supabase, seller }: ListingSession, input: {
  id: z.infer<typeof draftIdSchema>;
  fields: DraftFields;
}): Promise<DraftMutationResult> {
  const { error } = await supabase.from("canonical_listings")
    .insert({ id: input.id, ...input.fields });
  if (!error) return { kind: "created" };

  const existing = await readSnapshot(supabase, input.id, seller.id);
  if (!existing) return saveError;
  return existing.revision === 1 && sameDraftFields(existing.fields, input.fields)
    ? { kind: "created" } : { kind: "conflict" };
}

export async function saveDraft({ client: supabase, seller }: ListingSession, input: {
  id: z.infer<typeof draftIdSchema>;
  fields: DraftFields;
}): Promise<SaveDraftResult> {
  const { data, error } = await supabase.from("canonical_listings")
    .update(input.fields).eq("id", input.id).eq("seller_id", seller.id)
    .select(snapshotColumns).maybeSingle();
  if (!error && data !== null) return { kind: "saved", snapshot: snapshotSchema.parse(data) };
  if (!error) return { kind: "missing" };

  const current = await readSnapshot(supabase, input.id, seller.id);
  if (current && sameDraftFields(current.fields, input.fields)) {
    return { kind: "saved", snapshot: current };
  }
  return saveError;
}

export async function listDrafts({ client: supabase, seller }: ListingSession) {
  const { data, error } = await supabase.from("canonical_listings")
    .select(dashboardColumns).order("created_at", { ascending: false });
  if (error) throw new HttpError(503, "Could not load canonical listings.");
  if (!Array.isArray(data)) throw new Error("Invalid canonical listings response.");

  return data.flatMap((row: unknown) => {
    const listing = dashboardSchema.safeParse(row);
    if (!listing.success || listing.data.seller_id !== seller.id) return [];
    const { id, title, description } = listing.data;
    return [{ id, title, description }];
  });
}
