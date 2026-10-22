import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  conditions, draftFormSchema, emptyDraftInput, garmentTypes, sizeSystems,
} from "../src/lib/listings/draft";

const migrations = [
  "supabase/migrations/20261022000000_create_canonical_listings.sql",
  "supabase/migrations/20261023000000_edit_canonical_listing_drafts.sql",
].map((path) => readFileSync(path, "utf8")).join("\n");

test("form vocabularies match database constraints", () => {
  for (const [column, values] of [
    ["garment_type", garmentTypes], ["size_system", sizeSystems], ["condition", conditions],
  ] satisfies [string, readonly string[]][]) {
    const match = migrations.match(new RegExp(`${column} is null or ${column} in \\(([^)]+)\\)`));
    expect(match, `SQL constraint for ${column}`).not.toBeNull();
    const sqlValues = [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map((item) => item[1]);
    expect(sqlValues.sort()).toEqual([...values].sort());
  }
});

test("USD strings parse to exact integer cents or null", () => {
  for (const [price, cents] of [
    ["", null], ["  ", null], ["0", 0], ["0.00", 0], ["0.29", 29],
    ["0001.1", 110], ["21474836.47", 2147483647],
  ] satisfies [string, number | null][]) {
    expect(draftFormSchema.parse({ ...emptyDraftInput, price_usd: price }).price_usd_cents).toBe(cents);
  }
});

test("overlong leading-zero dollar strings are rejected before numeric conversion", () => {
  for (const price_usd of ["000000000", "0".repeat(500_000)]) {
    expect(draftFormSchema.safeParse({ ...emptyDraftInput, price_usd }).success).toBe(false);
  }
});

test("text limits count codepoints and agree with SQL", () => {
  for (const [field, max] of [
    ["title", 160], ["description", 5000], ["size_label", 80], ["brand", 160],
  ] satisfies [keyof typeof emptyDraftInput, number][]) {
    expect(migrations).toContain(`char_length(${field}) <= ${max}`);
    expect(draftFormSchema.safeParse({ ...emptyDraftInput, [field]: "🧥".repeat(max) }).success).toBe(true);
    expect(draftFormSchema.safeParse({ ...emptyDraftInput, [field]: "🧥".repeat(max + 1) }).success).toBe(false);
  }
});
