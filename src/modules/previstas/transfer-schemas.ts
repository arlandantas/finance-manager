import { z } from "zod";
import { type DateISO, dateISOSchema } from "@/lib/dates";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, periodKeySchema, uuidSchema, versionSchema } from "@/lib/schemas";
import { endSchema, monthISOSchema } from "@/modules/previstas/recurring-schemas";

// US-100 (ADR-037): transferência prevista entre contas.
const descriptionSchema = z
  .string()
  .trim()
  .min(2, "A descrição deve ter no mínimo 2 caracteres")
  .max(100, "A descrição deve ter no máximo 100 caracteres");

export const CreatePlannedTransferSchema = z
  .object({
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amountInCents: amountInCentsSchema,
    dueOn: dateISOSchema,
    description: descriptionSchema.optional(),
  })
  .strict()
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ["toAccountId"],
    message: "Escolha contas diferentes",
  });
export type CreatePlannedTransferInput = z.input<typeof CreatePlannedTransferSchema>;
export type CreatePlannedTransferParsed = z.output<typeof CreatePlannedTransferSchema>;

export const UpdatePlannedTransferSchema = z
  .object({
    version: versionSchema,
    fromAccountId: uuidSchema.optional(),
    toAccountId: uuidSchema.optional(),
    amountInCents: amountInCentsSchema.optional(),
    dueOn: dateISOSchema.optional(),
    description: descriptionSchema.nullable().optional(),
  })
  .strict();
export type UpdatePlannedTransferParsed = z.output<typeof UpdatePlannedTransferSchema>;

export const DeletePlannedTransferSchema = z.object({ version: versionSchema }).strict();

export const RealizeSchema = z
  .object({
    version: versionSchema,
    amountInCents: amountInCentsSchema.optional(),
    occurredOn: dateISOSchema.optional(),
  })
  .strict();
export type RealizeParsed = z.output<typeof RealizeSchema>;

export const ListPlannedTransfersQuerySchema = z
  .object({
    status: z.enum(["PREVISTA", "EFETIVADA"]).optional(),
    period: periodKeySchema.optional(),
  })
  .strict();
export type ListPlannedTransfersQuery = z.output<typeof ListPlannedTransfersQuerySchema>;

type AccountRef = { id: string; name: string; archived: boolean };

export type PlannedTransferDTO = {
  id: string;
  from: AccountRef;
  to: AccountRef;
  amountInCents: number;
  dueOn: DateISO;
  description: string | null;
  status: "PREVISTA" | "EFETIVADA";
  isOverdue: boolean;
  transferGroupId: string | null;
  seriesId: string | null; // US-101
  isException: boolean;
  version: number;
  author: MemberRef;
};

// US-101 (ADR-037 §5): série mensal de transferência prevista.
const dayOfMonthSchema = z
  .number({ error: "Informe o dia do mês" })
  .int("Informe o dia do mês")
  .min(1, "O dia deve ser de 1 a 31")
  .max(31, "O dia deve ser de 1 a 31");

export const CreateTransferSeriesSchema = z
  .object({
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amountInCents: amountInCentsSchema,
    description: descriptionSchema.optional(),
    dayOfMonth: dayOfMonthSchema,
    startMonth: monthISOSchema,
    end: endSchema,
  })
  .strict()
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ["toAccountId"],
    message: "Escolha contas diferentes",
  });
export type CreateTransferSeriesParsed = z.output<typeof CreateTransferSeriesSchema>;

export const UpdateTransferSeriesSchema = z
  .object({
    version: versionSchema,
    effectiveFrom: monthISOSchema.optional(),
    fromAccountId: uuidSchema.optional(),
    toAccountId: uuidSchema.optional(),
    amountInCents: amountInCentsSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    dayOfMonth: dayOfMonthSchema.optional(),
    end: endSchema.optional(),
  })
  .strict();
export type UpdateTransferSeriesParsed = z.output<typeof UpdateTransferSeriesSchema>;

export const EndTransferSeriesSchema = z.object({ version: versionSchema }).strict();

export const TransferSeriesQuerySchema = z
  .object({ impactFrom: monthISOSchema.optional() })
  .strict();

export type TransferSeriesDTO = {
  id: string;
  from: AccountRef;
  to: AccountRef;
  amountInCents: number;
  description: string | null;
  dayOfMonth: number;
  startMonth: string; // YYYY-MM
  endMonth: string | null;
  endedAt: string | null;
  version: number;
  author: MemberRef;
  updatedAt: string;
};

export type TransferSeriesImpactDTO = {
  affectedCount: number;
  keptRealizedCount: number;
  keptExceptionCount: number;
  endCount: number;
};
