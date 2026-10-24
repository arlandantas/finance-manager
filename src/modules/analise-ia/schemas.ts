import { z } from "zod";
import { periodKeySchema, uuidSchema } from "@/lib/schemas";

export const PreviewQuerySchema = z.object({ period: periodKeySchema.optional() });
export type PreviewQuery = z.output<typeof PreviewQuerySchema>;

export const RequestAnalysisSchema = z
  .object({ period: periodKeySchema, previewHash: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();
export type RequestAnalysisInput = z.output<typeof RequestAnalysisSchema>;

export const CreateDismissalSchema = z
  .object({
    analysisId: uuidSchema,
    key: z.string().regex(/^[CR]\d{1,2}$/),
    reason: z.string().trim().max(140).optional(),
  })
  .strict();
export type CreateDismissalInput = z.output<typeof CreateDismissalSchema>;

export const AcceptSuggestionSchema = z
  .object({
    transactionId: uuidSchema,
    version: z.number().int().min(1),
    fromCategoryId: uuidSchema,
    toCategoryId: uuidSchema,
    undo: z.boolean().optional(),
  })
  .strict();
export type AcceptSuggestionInput = z.output<typeof AcceptSuggestionSchema>;

export const DismissSuggestionSchema = z
  .object({ descriptionKey: z.string().min(1).max(40), toCategoryId: uuidSchema })
  .strict();
export type DismissSuggestionInput = z.output<typeof DismissSuggestionSchema>;
