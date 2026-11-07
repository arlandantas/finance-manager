import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";
import type { MonthISO } from "@/modules/previstas/recurrence";

const include = {
  card: { select: { id: true, name: true, archivedAt: true, deletedAt: true } },
  category: { select: { id: true, name: true } },
} as const;

/** Assinaturas sempre escopadas por `familyId` (ADR-013). */
export function assinaturasRepo(tx: Tx, familyId: string) {
  return {
    /** Trava consultiva por família: SEGUNDA trava (depois de `lockFamilySplit`), antes de cartão/fatura. */
    lockSubscriptions: async () => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscriptions:${familyId}`}))`;
    },
    /** Cartão ATIVO da família, travado `FOR SHARE` (arquivar concorrente espera); null = inexistente/arquivado/excluído. */
    lockActiveCard: async (id: string) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM credit_cards
        WHERE id = ${id}::uuid AND "familyId" = ${familyId}::uuid AND "archivedAt" IS NULL AND "deletedAt" IS NULL
        FOR SHARE`;
      return rows[0] ?? null;
    },
    /** Estado do cartão (inclusive arquivado) para decidir `SKIPPED_CARD_ARCHIVED`; trava `FOR SHARE`. */
    lockCardState: async (id: string) => {
      const rows = await tx.$queryRaw<Array<{ id: string; closingDay: number; archived: boolean }>>`
        SELECT id, "closingDay", ("archivedAt" IS NOT NULL OR "deletedAt" IS NOT NULL) AS archived
        FROM credit_cards WHERE id = ${id}::uuid AND "familyId" = ${familyId}::uuid FOR SHARE`;
      return rows[0] ?? null;
    },
    insert: async (d: {
      cardId: string;
      description: string;
      categoryId: string;
      payerMemberId: string;
      dayOfMonth: number;
      firstChargeOn: string;
      endMonth: MonthISO | null;
      authorMemberId: string;
      amountInCents: number;
      fromMonth: MonthISO;
    }) => {
      const row = await tx.cardSubscription.create({
        data: {
          familyId,
          cardId: d.cardId,
          description: d.description,
          categoryId: d.categoryId,
          payerMemberId: d.payerMemberId,
          dayOfMonth: d.dayOfMonth,
          firstChargeOn: toDbDate(d.firstChargeOn),
          nextChargeOn: toDbDate(d.firstChargeOn),
          endMonth: d.endMonth ? toDbDate(`${d.endMonth}-01`) : null,
          authorMemberId: d.authorMemberId,
        },
        select: { id: true },
      });
      await tx.cardSubscriptionAmount.create({
        data: {
          familyId,
          subscriptionId: row.id,
          fromMonth: toDbDate(`${d.fromMonth}-01`),
          amountInCents: fromCents(d.amountInCents),
          authorMemberId: d.authorMemberId,
        },
      });
      return row;
    },
    findById: (id: string) => tx.cardSubscription.findFirst({ where: { id, familyId }, include }),
    list: (status: "active" | "ended", cardId?: string) =>
      tx.cardSubscription.findMany({
        where: {
          familyId,
          endedAt: status === "active" ? null : { not: null },
          ...(cardId ? { cardId } : {}),
        },
        include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    amountsOf: (subscriptionIds: string[]) =>
      tx.cardSubscriptionAmount.findMany({
        where: { familyId, subscriptionId: { in: subscriptionIds } },
        select: { subscriptionId: true, fromMonth: true, amountInCents: true, createdAt: true },
      }),
    recentSkips: (subscriptionIds: string[]) =>
      tx.subscriptionCharge.findMany({
        where: { familyId, subscriptionId: { in: subscriptionIds }, status: { not: "POSTED" } },
        select: { subscriptionId: true, chargeMonth: true, status: true },
        orderBy: { chargeMonth: "desc" },
      }),
    /** Atalho sem trava: existe assinatura ativa vencida? (índice `(familyId, endedAt, nextChargeOn)`). */
    dueIds: async (today: string, onlyId?: string): Promise<string[]> => {
      const rows = await tx.cardSubscription.findMany({
        where: {
          familyId,
          endedAt: null,
          nextChargeOn: { lte: toDbDate(today) },
          ...(onlyId ? { id: onlyId } : {}),
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => r.id);
    },
    findManyByIds: (ids: string[]) =>
      tx.cardSubscription.findMany({
        where: { familyId, id: { in: ids }, endedAt: null },
        orderBy: { id: "asc" },
      }),
    chargeMonths: async (subscriptionId: string): Promise<Set<string>> => {
      const rows = await tx.subscriptionCharge.findMany({
        where: { familyId, subscriptionId },
        select: { chargeMonth: true },
      });
      return new Set(rows.map((r) => r.chargeMonth.toISOString().slice(0, 7)));
    },
    invoiceId: async (cardId: string, ref: string) =>
      (
        await tx.cardInvoice.findFirst({
          where: { familyId, cardId, referenceMonth: ref },
          select: { id: true },
        })
      )?.id ?? null,
    insertCharge: (d: {
      subscriptionId: string;
      month: MonthISO;
      chargeOn: string;
      status: "POSTED" | "SKIPPED_INVOICE_PAID" | "SKIPPED_CARD_ARCHIVED";
      transactionId: string | null;
    }) =>
      tx.subscriptionCharge.create({
        data: {
          familyId,
          subscriptionId: d.subscriptionId,
          chargeMonth: toDbDate(`${d.month}-01`),
          chargeOn: toDbDate(d.chargeOn),
          status: d.status,
          transactionId: d.transactionId,
        },
      }),
    setNext: (id: string, next: string | null) =>
      tx.cardSubscription.updateMany({
        where: { id, familyId },
        data: { nextChargeOn: next ? toDbDate(next) : null },
      }),
  };
}
