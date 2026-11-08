import { z } from "zod";
import { amountInCentsSchema } from "@/lib/money";
import { versionSchema } from "@/lib/schemas";
import {
  DESCRIPTION_MSG,
  type InstallmentPlanDTO,
  type TransactionDetailDTO,
  type UpdateTransactionParsed,
  UpdateTransactionSchema,
} from "@/modules/transacoes/schemas";

/** US-041 (SDD-014 §4.8): edição de parcela com alcance; data, nº de parcelas e rateio não editam aqui. */
export const EditInstallmentSchema = z
  .object({
    version: versionSchema,
    planVersion: versionSchema,
    scope: z.enum(["ONLY_THIS", "THIS_AND_NEXT"]),
    confirmSettledPeriod: z.boolean().optional(),
    amountInCents: amountInCentsSchema.optional(),
    categoryId: z.uuid({ error: "Escolha uma categoria" }).optional(),
    description: z.string().trim().min(2, DESCRIPTION_MSG).max(100, DESCRIPTION_MSG).optional(),
    note: z
      .string()
      .trim()
      .max(500, "A observação deve ter no máximo 500 caracteres")
      .nullable()
      .optional(),
  })
  .strict();
export type EditInstallmentInput = z.input<typeof EditInstallmentSchema>;
export type EditInstallmentParsed = z.output<typeof EditInstallmentSchema>;

export type EditInstallmentResponse = {
  transactions: TransactionDetailDTO[]; // só as parcelas efetivamente alteradas
  plan: InstallmentPlanDTO;
  card: { id: string; usedInCents: number; availableInCents: number };
};

/** PATCH /transactions/:id: com `scope` é edição de parcela; sem, edição comum. */
export const PatchTransactionSchema = z
  .unknown()
  .transform(
    (raw, ctx): { installment: EditInstallmentParsed } | { plain: UpdateTransactionParsed } => {
      const isInstallment = typeof raw === "object" && raw !== null && "scope" in raw;
      const parsed = isInstallment
        ? EditInstallmentSchema.safeParse(raw)
        : UpdateTransactionSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, code: "custom" });
        return z.NEVER;
      }
      return isInstallment
        ? { installment: parsed.data as EditInstallmentParsed }
        : { plain: parsed.data as UpdateTransactionParsed };
    },
  );
