import { z } from "zod";

export const draftIdSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
).brand<"DraftId">();
export const revisionSchema = z.number().int().positive().max(2147483647);

const garmentTypeSchema = z.enum([
  "top", "shirt", "knitwear", "outerwear", "trousers", "shorts", "skirt",
  "dress", "jumpsuit", "other_apparel",
]);
export const garmentTypeLabels = {
  top: "Top", shirt: "Shirt", knitwear: "Knitwear", outerwear: "Outerwear",
  trousers: "Trousers", shorts: "Shorts", skirt: "Skirt", dress: "Dress",
  jumpsuit: "Jumpsuit", other_apparel: "Other apparel",
} satisfies Record<z.infer<typeof garmentTypeSchema>, string>;
const sizeSystemSchema = z.enum(["US", "UK", "EU", "International", "One size"]);
const conditionSchema = z.enum(["New", "Good", "Fair"]);

function nullableText(max: number) {
  return z.string().refine((value) => [...value].length <= max).nullable();
}

export const draftFieldsSchema = z.object({
  title: nullableText(160),
  description: nullableText(5000),
  garment_type: garmentTypeSchema.nullable(),
  size_system: sizeSystemSchema.nullable(),
  size_label: nullableText(80),
  condition: conditionSchema.nullable(),
  brand: nullableText(160),
  price_usd_cents: z.number().int().min(0).max(2147483647).nullable(),
});
export type DraftFields = z.infer<typeof draftFieldsSchema>;
export type DraftInput = {
  [K in Exclude<keyof DraftFields, "price_usd_cents">]: string;
} & { price_usd: string };

const usdPriceSchema = z.string()
  .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [dollars, fraction = ""] = value.split(".");
    return Number(BigInt(dollars) * BigInt(100) + BigInt(fraction.padEnd(2, "0")));
  })
  .pipe(z.number().int().min(0).max(2147483647))
  .nullable();

const draftFormFieldsSchema = draftFieldsSchema.omit({ price_usd_cents: true }).extend({
  price_usd: usdPriceSchema,
});

export const draftFormSchema = z.preprocess((input) => {
  if (typeof input !== "object" || input === null) return input;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [
    key, typeof value === "string" ? value.trim() || null : value,
  ]));
}, draftFormFieldsSchema).transform(({ price_usd, ...fields }): DraftFields => ({
  ...fields,
  price_usd_cents: price_usd,
}));

const draftFieldNames = draftFieldsSchema.keyof().options;
export const draftInputFieldNames = draftFormFieldsSchema.keyof().options;
export const garmentTypes = garmentTypeSchema.options;
export const sizeSystems = sizeSystemSchema.options;
export const conditions = conditionSchema.options;

export type DraftSnapshot = {
  id: z.infer<typeof draftIdSchema>;
  fields: DraftFields;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type DraftMutationResult =
  | { kind: "created" }
  | { kind: "saved"; snapshot: DraftSnapshot }
  | { kind: "conflict" }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export function draftInput(fields: DraftFields): DraftInput {
  const cents = fields.price_usd_cents;
  return {
    title: fields.title ?? "",
    description: fields.description ?? "",
    garment_type: fields.garment_type ?? "",
    size_system: fields.size_system ?? "",
    size_label: fields.size_label ?? "",
    condition: fields.condition ?? "",
    brand: fields.brand ?? "",
    price_usd: cents === null ? "" : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
  };
}

export const emptyDraftInput = draftInput(draftFieldsSchema.parse({
  title: null, description: null, garment_type: null, size_system: null,
  size_label: null, condition: null, brand: null, price_usd_cents: null,
}));

export function sameDraftFields(left: DraftFields, right: DraftFields): boolean {
  return draftFieldNames.every((key) => left[key] === right[key]);
}
