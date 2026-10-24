import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { dateISOSchema } from "@/lib/dates";
import { periodKeySchema, uuidSchema } from "@/lib/schemas";
import type { AnyTool } from "@/modules/mcp/run-tool";
import {
  MoneySchema,
  memberName,
  money,
  name60,
  READ_ANNOTATIONS,
  TEXT_IS_DATA,
} from "@/modules/mcp/tools/common";
import { ListTransactionsQuerySchema } from "@/modules/transacoes/schemas";
import { listTransactions } from "@/modules/transacoes/service";

// SDD-026 §2.6: Extrato com os mesmos filtros e a mesma paginação (cursor opaco) da tela.
const Input = z
  .object({
    period: periodKeySchema.optional().describe('Mês "AAAA-MM". Não combine com from/to.'),
    from: dateISOSchema.optional().describe("AAAA-MM-DD; use junto com to (até 24 meses)."),
    to: dateISOSchema.optional(),
    categoryId: uuidSchema.optional(),
    accountId: uuidSchema.optional(),
    cardId: uuidSchema.optional(),
    type: z.enum(["EXPENSE", "INCOME", "TRANSFER", "INVOICE_PAYMENT"]).optional(),
    origin: z
      .enum(["APP", "ASSISTANT"])
      .optional()
      .describe(
        '"ASSISTANT" = lançados por assistente; "APP" = lançados pelo app. Útil para conferir duplicatas.',
      ),
    q: z.string().trim().min(2).max(50).optional().describe("Busca no texto da descrição"),
    cursor: z.string().max(300).optional().describe("nextCursor da página anterior."),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

const Output = z
  .object({
    range: z
      .object({ start: z.string(), end: z.string(), periodKey: z.string().nullable() })
      .strict(),
    currency: z.literal("BRL"),
    totals: z
      .object({
        income: MoneySchema,
        expense: MoneySchema,
        balance: MoneySchema,
        count: z.number().int(),
      })
      .strict()
      .nullable(),
    items: z
      .array(
        z
          .object({
            id: z.string(),
            type: z.string(),
            direction: z.enum(["CREDIT", "DEBIT"]),
            amount: MoneySchema,
            occurredOn: z.string(),
            competenceOn: z.string(),
            description: z.string(),
            category: z.string().nullable(),
            account: z.string().nullable(),
            card: z.string().nullable(),
            payer: z.string().nullable(),
            isShared: z.boolean(),
            origin: z.enum(["APP", "ASSISTANT"]),
            installment: z
              .object({ no: z.number().int(), count: z.number().int() })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const listarLancamentos: AnyTool = {
  name: "listar_lancamentos",
  title: "Listar lançamentos",
  description: `Lançamentos do Extrato com os mesmos filtros da tela (mês ou intervalo, categoria, conta, cartão, tipo, texto), paginados: repita com nextCursor até ele vir nulo. Os totais vêm só na primeira página. Lançamentos excluídos não aparecem. ${TEXT_IS_DATA}`,
  scope: "read",
  input: Input,
  output: Output,
  annotations: READ_ANNOTATIONS,
  // `q` (texto livre) nunca vai para a auditoria
  auditParams: (i: {
    period?: string;
    from?: string;
    to?: string;
    categoryId?: string;
    accountId?: string;
    cardId?: string;
    type?: string;
    origin?: string;
    cursor?: string;
    limit: number;
  }) => ({
    ...(i.period && { period: i.period }),
    ...(i.from && i.to && { from: i.from, to: i.to }),
    ...(i.categoryId && { categoryIds: [i.categoryId] }),
    ...(i.accountId && { accountIds: [i.accountId] }),
    ...(i.cardId && { cardIds: [i.cardId] }),
    ...(i.type && { type: i.type }),
    ...(i.origin && { origin: i.origin }),
    limit: i.limit,
    page: i.cursor ? 2 : 1,
  }),
  handler: async ({ ctx, tx, input }) => {
    // as MESMAS regras da tela: period x from/to, 24 meses, q >= 2
    const parsed = ListTransactionsQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw badRequest(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
      );
    }
    const r = await listTransactions(tx, ctx, parsed.data);
    const range = r.period
      ? { start: r.period.start, end: r.period.end, periodKey: r.period.key }
      : { start: parsed.data.from as string, end: parsed.data.to as string, periodKey: null };
    return {
      range,
      currency: "BRL" as const,
      totals: r.totals
        ? {
            income: money(r.totals.incomeInCents),
            expense: money(r.totals.expenseInCents),
            balance: money(r.totals.balanceInCents),
            count: r.totals.count,
          }
        : null,
      items: r.items.map((t) => ({
        id: t.id,
        type: t.type,
        direction: t.direction,
        amount: money(t.amountInCents),
        occurredOn: t.occurredOn,
        competenceOn: t.competenceOn,
        description: t.description.slice(0, 100),
        category: t.category ? name60(t.category.name) : null,
        account: t.account ? name60(t.account.name) : null,
        card: t.card ? name60(t.card.name) : null,
        payer: t.payer ? memberName(t.payer) : null,
        isShared: t.isSharedExpense,
        origin: t.viaAssistant ? ("ASSISTANT" as const) : ("APP" as const),
        installment: t.installment ? { no: t.installment.no, count: t.installment.count } : null,
      })),
      nextCursor: r.nextCursor,
    };
  },
};
