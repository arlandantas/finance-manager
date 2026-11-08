import { z } from "zod";
import { MAX_LINES } from "./redact";

// ADR-042 §5: saída do LLM, `.strict()` em todos os níveis. Centavos inteiros > 0; o sinal vive em `kind`.
const line = z.string().regex(/^L\d{1,3}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ExtractedItemSchema = z
  .object({
    line,
    date: isoDate,
    description: z.string().min(1).max(200),
    amountInCents: z.number().int().positive(),
    kind: z.enum(["PURCHASE", "FEE", "CREDIT", "PAYMENT"]),
    installment: z
      .object({ no: z.number().int().min(1), count: z.number().int().max(24) })
      .strict()
      .refine((i) => i.no <= i.count)
      .nullable(),
  })
  .strict();

const declared = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({ line, ...shape })
    .strict()
    .nullable();

export const InvoiceExtractionSchema = z
  .object({
    isInvoice: z.boolean(),
    closingDate: declared({ date: isoDate }),
    dueDate: declared({ date: isoDate }),
    totalInCents: declared({ amountInCents: z.number().int().positive() }),
    items: z.array(ExtractedItemSchema).max(MAX_LINES),
  })
  .strict();

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
