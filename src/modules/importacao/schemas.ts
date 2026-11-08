import { z } from "zod";
import { periodKeySchema, uuidSchema } from "@/lib/schemas";

// Spec 13 (contratos): `.strict()` em todos os níveis; centavos como texto no JSON.
const cents = z.string().regex(/^\d+$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ImportDraftItemSchema = z
  .object({
    idx: z.number().int().min(0),
    line: z.string().optional(),
    date: isoDate.nullable(),
    description: z.string().min(1).max(200),
    amountInCents: cents.nullable(),
    kind: z.enum(["PURCHASE", "FEE", "CREDIT", "PAYMENT"]),
    installment: z.object({ no: z.number().int(), count: z.number().int() }).strict().nullable(),
    selected: z.boolean(),
    group: z.string(),
    categoryId: uuidSchema.nullable(),
    payerMemberId: uuidSchema,
    flags: z.array(
      z.enum([
        "NEEDS_ATTENTION",
        "ALREADY_IMPORTED",
        "ALREADY_POSTED_PARCEL",
        "POSSIBLE_DUPLICATE",
      ]),
    ),
    duplicateOf: uuidSchema.optional(),
  })
  .strict();

export const ImportDraftSchema = z
  .object({
    importToken: z.string().min(1),
    source: z.enum(["CSV", "PDF"]),
    fileHash: z.string().regex(/^[0-9a-f]{64}$/),
    invoiceRef: periodKeySchema,
    declared: z
      .object({
        closingDate: isoDate.optional(),
        dueDate: isoDate.optional(),
        totalInCents: cents.optional(),
      })
      .strict(),
    items: z.array(ImportDraftItemSchema),
    totals: z
      .object({ itemsTotal: z.string(), selectedTotal: z.string(), difference: z.string() })
      .strict(),
    warnings: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
    alreadyImportedAt: z.string().optional(),
  })
  .strict();

export type ImportDraft = z.infer<typeof ImportDraftSchema>;
export type ImportDraftItem = z.infer<typeof ImportDraftItemSchema>;

/** Campos multipart do preview (sem o arquivo): `.strict()` rejeita campo desconhecido. */
export const PreviewFieldsSchema = z
  .object({ invoiceRef: periodKeySchema, password: z.string().max(200).optional() })
  .strict();
