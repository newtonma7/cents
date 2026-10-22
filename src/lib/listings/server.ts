import "server-only";
import { createClient } from "@/lib/supabase/server";

const listingColumns =
  "id, seller_id, title, description, garment_type, size_system, size_label, condition, brand, price_usd_cents, revision, created_at, updated_at";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CanonicalListing = {
  id: string;
  sellerId: string;
  title: string | null;
  description: string | null;
  garmentType: string | null;
  sizeSystem: string | null;
  sizeLabel: string | null;
  condition: "New" | "Good" | "Fair" | null;
  brand: string | null;
  priceUsdCents: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

type DraftFields = {
  id: string;
  title: string | null;
  description: string | null;
};

type DraftResult = { ok: true } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCondition(value: unknown): value is CanonicalListing["condition"] {
  return value === null || value === "New" || value === "Good" || value === "Fair";
}

function isPrice(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 2147483647)
  );
}

function parseListing(value: unknown): CanonicalListing | null {
  if (!isRecord(value)) return null;

  if (
    typeof value.id !== "string" ||
    !uuidPattern.test(value.id) ||
    typeof value.seller_id !== "string" ||
    !uuidPattern.test(value.seller_id) ||
    !nullableString(value.title) ||
    (typeof value.title === "string" && value.title.length > 160) ||
    !nullableString(value.description) ||
    (typeof value.description === "string" && value.description.length > 5000) ||
    !nullableString(value.garment_type) ||
    !nullableString(value.size_system) ||
    !nullableString(value.size_label) ||
    !isCondition(value.condition) ||
    !nullableString(value.brand) ||
    !isPrice(value.price_usd_cents) ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.created_at !== "string" ||
    Number.isNaN(Date.parse(value.created_at)) ||
    typeof value.updated_at !== "string" ||
    Number.isNaN(Date.parse(value.updated_at))
  ) {
    return null;
  }

  return {
    id: value.id,
    sellerId: value.seller_id,
    title: value.title,
    description: value.description,
    garmentType: value.garment_type,
    sizeSystem: value.size_system,
    sizeLabel: value.size_label,
    condition: value.condition,
    brand: value.brand,
    priceUsdCents:
      typeof value.price_usd_cents === "number" ? value.price_usd_cents : null,
    revision: value.revision,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
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
  if (title.length > 160 || description.length > 5000) return null;

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
    .select(listingColumns)
    .eq("id", fields.id)
    .maybeSingle();
  const listing = parseListing(existing);
  if (listing?.sellerId === seller.id) return { ok: true };

  return { ok: false, message: "We could not save this draft. Try again." };
}

export async function listDrafts(): Promise<CanonicalListing[]> {
  const supabase = await createClient();
  const {
    data: { user: seller },
  } = await supabase.auth.getUser();
  if (!seller) return [];

  const { data, error } = await supabase
    .from("canonical_listings")
    .select(listingColumns)
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) {
    throw new Error("Could not load canonical listings.");
  }

  return data.flatMap((row: unknown) => {
    const listing = parseListing(row);
    return listing?.sellerId === seller.id ? [listing] : [];
  });
}
