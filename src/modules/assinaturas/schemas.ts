import { z } from "zod";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, uuidSchema } from "@/lib/schemas";
import { monthISOSchema } from "@/modules/previstas/recurring-schemas";

// US-096 (ADR-036, spec 12). Zod 4, `.strict()`: família, autor e datas de cobrança nunca vêm do cliente.
const description = z
  .string({ error: "Informe a descrição" })
  .trim()
  .min(2, "A descrição deve ter no mínimo 2 caracteres")
  .max(100, "A descrição deve ter no máximo 100 caracteres");

const endSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NONE") }).strict(),
  z
    .object({
      type: z.literal("COUNT"),
      count: z
        .number({ error: "Informe quantas cobranças" })
        .int("Informe quantas cobranças")
        .min(1, "Informe ao menos 1 cobrança")
        .max(120, "No máximo 120 cobranças"),
    })
    .strict(),
]);

export const CreateSubscriptionSchema = z
  .object({
    cardId: z.uuid({ error: "Escolha um cartão" }),
    description,
    amountInCents: amountInCentsSchema,
    categoryId: z.uuid({ error: "Escolha uma categoria" }),
    payerMemberId: uuidSchema.optional(),
    dayOfMonth: z
      .number({ error: "Informe o dia do mês" })
      .int("Informe o dia do mês")
      .min(1, "O dia deve ser de 1 a 31")
      .max(31, "O dia deve ser de 1 a 31"),
    startMonth: monthISOSchema.optional(),
    end: endSchema,
  })
  .strict();
export type CreateSubscriptionInput = z.input<typeof CreateSubscriptionSchema>;
export type CreateSubscriptionParsed = z.output<typeof CreateSubscriptionSchema>;

export const ListSubscriptionsQuerySchema = z
  .object({
    status: z.enum(["active", "ended"]).default("active"),
    cardId: z.uuid().optional(),
  })
  .strict();
export type ListSubscriptionsQuery = z.output<typeof ListSubscriptionsQuerySchema>;

export type SubscriptionSkipReason = "INVOICE_PAID" | "CARD_ARCHIVED";

export type SubscriptionDTO = {
  id: string;
  card: { id: string; name: string; archived: boolean };
  description: string;
  category: { id: string; name: string };
  payer: MemberRef;
  dayOfMonth: number;
  currentAmountInCents: number;
  firstChargeOn: string;
  nextChargeOn: string | null;
  endMonth: string | null;
  endedOn: string | null;
  version: number;
  recentSkips: Array<{ month: string; reason: SubscriptionSkipReason }>; // últimos 3, mais recente primeiro
};
