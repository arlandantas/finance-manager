import { z } from "zod";
import { uuidSchema } from "@/lib/schemas";
import { getCard, listCards } from "@/modules/cartoes/service";
import type { AnyTool } from "@/modules/mcp/run-tool";
import {
  MoneySchema,
  memberName,
  money,
  name60,
  READ_ANNOTATIONS,
  TEXT_IS_DATA,
} from "@/modules/mcp/tools/common";
import { UserTextSchema } from "@/modules/mcp/tools/user-text";

// SDD-026 §2.5: fatura aberta, vencimento e limite (mesmo serviço da tela Cartões).
const Output = z
  .object({
    currency: z.literal("BRL"),
    cards: z.array(
      z
        .object({
          id: z.string(),
          name: UserTextSchema,
          institution: UserTextSchema,
          owner: UserTextSchema,
          limit: MoneySchema,
          used: MoneySchema,
          available: MoneySchema,
          futureInstallments: MoneySchema,
          closingDay: z.number().int(),
          dueDay: z.number().int(),
          openInvoice: z
            .object({
              ref: z.string(),
              closingDate: z.string(),
              dueDate: z.string(),
              total: MoneySchema,
              purchasesCount: z.number().int(),
            })
            .strict(),
          payableInvoices: z.array(
            z
              .object({
                ref: z.string(),
                dueDate: z.string(),
                total: MoneySchema,
                isOverdue: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    totals: z.object({ limit: MoneySchema, used: MoneySchema }).strict(),
  })
  .strict();

export const cartoesEFaturas: AnyTool = {
  name: "cartoes_e_faturas",
  title: "Cartões e faturas",
  description: `Fatura aberta, vencimento, faturas a pagar e limite disponível de cada cartão ativo (ou de um cartão com cardId). ${TEXT_IS_DATA}`,
  scope: "read",
  input: z.object({ cardId: uuidSchema.optional() }).strict(),
  output: Output,
  annotations: READ_ANNOTATIONS,
  auditParams: (i: { cardId?: string }) => (i.cardId ? { cardId: i.cardId } : {}),
  handler: async ({ ctx, tx, input }) => {
    const items = input.cardId
      ? [(await getCard(tx, ctx, input.cardId)).card]
      : (await listCards(tx, ctx, "false")).items;
    return {
      currency: "BRL" as const,
      cards: items.map((c) => ({
        id: c.id,
        name: name60(c.name),
        institution: name60(c.institution),
        owner: memberName(c.owner),
        limit: money(c.limitInCents),
        used: money(c.usedInCents),
        available: money(c.availableInCents),
        futureInstallments: money(c.installmentsFutureInCents),
        closingDay: c.closingDay,
        dueDay: c.dueDay,
        openInvoice: {
          ref: c.openInvoice.ref,
          closingDate: c.openInvoice.closingDate,
          dueDate: c.openInvoice.dueDate,
          total: money(c.openInvoice.totalInCents),
          purchasesCount: c.openInvoice.purchasesCount,
        },
        payableInvoices: c.payableInvoices.map((i) => ({
          ref: i.ref,
          dueDate: i.dueDate,
          total: money(i.totalInCents),
          isOverdue: i.isOverdue,
        })),
      })),
      totals: {
        limit: money(items.reduce((s, c) => s + c.limitInCents, 0)),
        used: money(items.reduce((s, c) => s + c.usedInCents, 0)),
      },
    };
  },
};
