import { z } from "zod";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, uuidSchema, versionSchema } from "@/lib/schemas";

// SDD-019 §3.5 (Zod 4).
export const monthISOSchema = z
  .string({ error: "Informe o mês" })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido");

const descriptionRequired = z
  .string({ error: "Informe a descrição" })
  .trim()
  .min(1, "Informe a descrição")
  .min(2, "A descrição deve ter no mínimo 2 caracteres")
  .max(100, "A descrição deve ter no máximo 100 caracteres");

const endSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("NONE") }),
  z.object({
    kind: z.literal("COUNT"),
    months: z
      .number({ error: "Informe quantos meses" })
      .int("Informe quantos meses")
      .min(1, "Informe ao menos 1 mês")
      .max(120, "No máximo 120 meses"),
  }),
]);

export const CreateRecurringExpenseSchema = z
  .object({
    description: descriptionRequired,
    amountInCents: amountInCentsSchema,
    categoryId: z.uuid({ error: "Escolha uma categoria" }),
    responsibleMemberId: uuidSchema.optional(),
    isSharedExpense: z.boolean().default(false),
    paymentAccountId: z.uuid({ error: "Escolha de qual conta vai sair" }), // US-059 (conta bancária)
    dayOfMonth: z
      .number({ error: "Informe o dia do mês" })
      .int("Informe o dia do mês")
      .min(1, "O dia deve ser de 1 a 31")
      .max(31, "O dia deve ser de 1 a 31"),
    startMonth: monthISOSchema,
    end: endSchema,
  })
  .strict();
export type CreateRecurringExpenseInput = z.input<typeof CreateRecurringExpenseSchema>;
export type CreateRecurringExpenseParsed = z.output<typeof CreateRecurringExpenseSchema>;

export const UpdateRecurringExpenseSchema = z
  .object({
    version: versionSchema,
    effectiveFrom: monthISOSchema.optional(),
    description: descriptionRequired.optional(),
    amountInCents: amountInCentsSchema.optional(),
    categoryId: z.uuid({ error: "Escolha uma categoria" }).optional(),
    responsibleMemberId: uuidSchema.optional(),
    isSharedExpense: z.boolean().optional(),
    paymentAccountId: z.uuid({ error: "Escolha de qual conta vai sair" }).optional(),
    dayOfMonth: z.number().int().min(1, "O dia deve ser de 1 a 31").max(31).optional(),
    end: endSchema.optional(),
  })
  .strict();
export type UpdateRecurringExpenseInput = z.input<typeof UpdateRecurringExpenseSchema>;
export type UpdateRecurringExpenseParsed = z.output<typeof UpdateRecurringExpenseSchema>;

export const EndRecurringExpenseSchema = z.object({ version: versionSchema }).strict();

export const SeriesImpactQuerySchema = z
  .object({ effectiveFrom: monthISOSchema.optional() })
  .strict();

// ── DTOs ──
export type RecurringExpenseDTO = {
  id: string;
  description: string;
  amountInCents: number;
  category: { id: string; name: string; icon: string; archived: boolean };
  responsible: MemberRef;
  isSharedExpense: boolean;
  paymentAccount: { id: string; name: string; archived: boolean } | null;
  dayOfMonth: number;
  startMonth: string; // YYYY-MM
  endMonth: string | null; // YYYY-MM; null = sem fim
  endedAt: string | null;
  version: number;
  updatedAt: string;
};

export type SeriesImpactDTO = {
  affectedCount: number; // pendentes futuras sem exceção a partir de effectiveFrom
  keptPaidCount: number; // baixadas (preservadas)
  keptExceptionCount: number; // alteradas só naquela ocorrência (preservadas na edição da série)
  endCount: number; // pendentes futuras (inclui exceções) que "Encerrar" removeria
};
