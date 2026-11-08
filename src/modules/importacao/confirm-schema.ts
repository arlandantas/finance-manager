import { z } from "zod";
import { MAX_AMOUNT_IN_CENTS } from "@/lib/money";
import { periodKeySchema, uuidSchema } from "@/lib/schemas";

// Spec 13 (contratos): corpo da confirmação `.strict()` em todos os níveis; centavos como texto no JSON.
// `familyId`, autor, `importBatchId`, `importKey` e `origin` nunca vêm do cliente (invariante 6).
const cents = z
  .string()
  .regex(/^\d+$/)
  .refine((s) => BigInt(s) > 0n && BigInt(s) <= BigInt(MAX_AMOUNT_IN_CENTS), "Valor inválido");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// sem caracteres de controle (o Postgres recusa NUL e o texto vira log/tela)
const noControl = (s: string) => !/[\u0000-\u001f\u007f]/.test(s);

export const ConfirmItemSchema = z
  .object({
    idx: z.number().int().min(0),
    date: isoDate,
    description: z.string().trim().min(2).max(100).refine(noControl, "Descrição inválida"),
    amountInCents: cents,
    kind: z.enum(["PURCHASE", "FEE"]),
    installment: z
      .object({ no: z.number().int().min(1), count: z.number().int().min(2).max(24) })
      .strict()
      .refine((i) => i.no <= i.count, "Parcela fora do plano")
      .nullable(),
    categoryId: uuidSchema,
    payerMemberId: uuidSchema,
  })
  .strict();

export const ConfirmImportBodySchema = z
  .object({
    importToken: z.string().min(1).max(2000),
    invoiceRef: periodKeySchema,
    items: z
      .array(ConfirmItemSchema)
      .min(1)
      .max(300)
      .refine((l) => new Set(l.map((i) => i.idx)).size === l.length, "idx repetido"),
  })
  .strict();

export type ConfirmItem = z.infer<typeof ConfirmItemSchema>;
export type ConfirmImportBody = z.infer<typeof ConfirmImportBodySchema>;
