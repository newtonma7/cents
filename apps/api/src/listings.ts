import { Context, Data, Effect } from "effect";
import { z } from "zod";
import type { SessionClient } from "./auth.js";
import type { Seller } from "@cents/contracts";
import { HttpError } from "./errors.js";
import {
  draftFieldsSchema, draftIdSchema, revisionSchema, sameDraftFields,
  type DraftFields, type DraftMutationResult, type DraftSnapshot, type DraftSummary, type SaveDraftResult,
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
type ReadOperation = "collection" | "detail";
const saveError = { kind: "error", message: "We could not save this draft. Try again." } satisfies SaveDraftResult;

export class ListingReadUnavailable extends Data.TaggedError("ListingReadUnavailable")<{
  readonly operation: ReadOperation;
}> {}

export class InvalidListingData extends Data.TaggedError("InvalidListingData")<{
  readonly operation: ReadOperation;
}> {}

export type ListingReadFailure = ListingReadUnavailable | InvalidListingData;

export class ListingReads extends Context.Service<ListingReads, {
  readonly list: () => Effect.Effect<Array<DraftSummary>, ListingReadFailure>;
  readonly get: (id: string) => Effect.Effect<DraftSnapshot | null, ListingReadFailure>;
}>()("@cents/api/listings/ListingReads") {}

async function querySnapshot(supabase: SessionClient, id: DraftSnapshot["id"], sellerId: string) {
  const { data, error } = await supabase.from("canonical_listings")
    .select(snapshotColumns).eq("id", id).eq("seller_id", sellerId).maybeSingle();
  return { data, error };
}

async function readSnapshot(supabase: SessionClient, id: DraftSnapshot["id"], sellerId: string) {
  const { data, error } = await querySnapshot(supabase, id, sellerId);
  if (error) throw new HttpError(503, "Could not load this draft.");
  return data === null ? null : snapshotSchema.parse(data);
}

export function makeListingReads({ client: supabase, seller }: ListingSession): ListingReads["Service"] {
  const sellerId = seller.id;

  return {
    list: () => Effect.gen(function* () {
      const { data, error } = yield* Effect.promise(() => supabase.from("canonical_listings")
        .select(dashboardColumns).order("created_at", { ascending: false }));
      if (error) return yield* new ListingReadUnavailable({ operation: "collection" });
      if (!Array.isArray(data)) return yield* new InvalidListingData({ operation: "collection" });

      return data.flatMap((row: unknown) => {
        const listing = dashboardSchema.safeParse(row);
        if (!listing.success || listing.data.seller_id !== sellerId) return [];
        const { id, title, description } = listing.data;
        return [{ id, title, description }];
      });
    }),
    get: (id) => Effect.gen(function* () {
      const parsedId = draftIdSchema.safeParse(id);
      if (!parsedId.success) return null;

      const { data, error } = yield* Effect.promise(() => querySnapshot(supabase, parsedId.data, sellerId));
      if (error) return yield* new ListingReadUnavailable({ operation: "detail" });
      if (data === null) return null;
      return yield* Effect.try({
        try: () => snapshotSchema.parse(data),
        catch: () => new InvalidListingData({ operation: "detail" }),
      });
    }),
  };
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
