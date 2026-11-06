import { z } from "zod";
import { draftFieldsSchema, draftIdSchema, draftInputSchema, draftSnapshotSchema } from "./draft.js";
export const createDraftSchema = z.strictObject({ id: draftIdSchema, fields: draftInputSchema });
export const saveDraftSchema = z.strictObject({ fields: draftInputSchema });
export const magicLinkSchema = z.strictObject({ email: z.email().max(254) });
export const passwordLoginSchema = z.strictObject({
  email: z.email().max(254), password: z.string().min(1).max(1024),
});
export type PasswordLogin = z.infer<typeof passwordLoginSchema>;
const newPassword = z.string().min(12).max(1024);
export const passwordChangeSchema = z.strictObject({
  password: newPassword,
  confirmPassword: newPassword,
}).refine((value) => value.password === value.confirmPassword);
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
export const passwordUpdatedSchema = z.strictObject({ kind: z.literal("password-updated") });
export const signedInSchema = z.strictObject({ kind: z.literal("signed-in") });
export const sellerSchema = z.strictObject({ id: z.uuid(), email: z.email() });
export type Seller = z.infer<typeof sellerSchema>;
export const sessionSchema = z.strictObject({ seller: sellerSchema });
export const draftSummarySchema = z.strictObject({
  id: draftIdSchema, ...draftFieldsSchema.pick({ title: true, description: true }).shape,
});
export const listingsSchema = z.strictObject({ listings: z.array(draftSummarySchema) });
export type DraftSummary = z.infer<typeof draftSummarySchema>;
export const loadedDraftSchema = z.strictObject({ kind: z.literal("loaded"), snapshot: draftSnapshotSchema });
export const sentSchema = z.strictObject({ kind: z.literal("sent") });
export const errorSchema = z.strictObject({ kind: z.literal("error"), message: z.string() });
export const invalidFieldsMessage = "Check the draft fields. Use a USD price from 0 to 21474836.47 with at most two decimal places.";
