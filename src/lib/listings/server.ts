import "server-only";
import { createClient } from "@/lib/supabase/server";

const dashboardColumns = "id, seller_id, title, description";
const collisionColumns = "id, seller_id";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DraftListing = {
  id: string;
  sellerId: string;
  title: string | null;
  description: string | null;
};

type ListingOwner = Pick<DraftListing, "id" | "sellerId">;

type DraftFields = {
  id: string;
  title: string | null;
  description: string | null;
};

type DraftResult = { ok: true } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseListingOwner(value: unknown): ListingOwner | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !uuidPattern.test(value.id) ||
    typeof value.seller_id !== "string" ||
    !uuidPattern.test(value.seller_id)
  ) {
    return null;
  }

  return { id: value.id, sellerId: value.seller_id };
}

function parseDraftListing(value: unknown): DraftListing | null {
  const owner = parseListingOwner(value);
  if (
    !owner ||
    !isRecord(value) ||
    !(value.title === null || typeof value.title === "string") ||
    !(value.description === null || typeof value.description === "string")
  ) {
    return null;
  }

  return {
    ...owner,
    title: value.title,
    description: value.description,
  };
}

function parseDraftFields(value: unknown): DraftFields | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !uuidPattern.test(value.id) ||
    typeof value.title !== "string" ||
    typeof value.description !== "string"
  ) {
    return null;
  }

  const title = value.title.trim();
  const description = value.description.trim();
  if ([...title].length > 160 || [...description].length > 5000) return null;

  return { id: value.id, title: title || null, description: description || null };
}

export async function createDraft(input: unknown): Promise<DraftResult> {
  const fields = parseDraftFields(input);
  if (!fields) {
    return { ok: false, message: "Check the title and description, then try again." };
  }

  const supabase = await createClient();
  const {
    data: { user: seller },
  } = await supabase.auth.getUser();
  if (!seller) {
    return { ok: false, message: "Sign in to save a draft." };
  }

  const { error } = await supabase
    .from("canonical_listings")
    .insert({ id: fields.id, title: fields.title, description: fields.description });
  if (!error) return { ok: true };

  const { data: existing } = await supabase
    .from("canonical_listings")
    .select(collisionColumns)
    .eq("id", fields.id)
    .maybeSingle();
  const listing = parseListingOwner(existing);
  if (listing?.sellerId === seller.id) return { ok: true };

  return { ok: false, message: "We could not save this draft. Try again." };
}

export async function listDrafts(): Promise<DraftListing[]> {
  const supabase = await createClient();
  const {
    data: { user: seller },
  } = await supabase.auth.getUser();
  if (!seller) return [];

  const { data, error } = await supabase
    .from("canonical_listings")
    .select(dashboardColumns)
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) {
    throw new Error("Could not load canonical listings.");
  }

  return data.flatMap((row: unknown) => {
    const listing = parseDraftListing(row);
    return listing?.sellerId === seller.id ? [listing] : [];
  });
}
