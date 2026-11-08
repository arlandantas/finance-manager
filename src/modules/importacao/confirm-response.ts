import type { ImportBatch } from "@/generated/prisma/client";
import type { RequestContext, Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import type { MemberRef } from "@/lib/schemas";
import type { InvoiceRow } from "@/modules/cartoes/invoices";
import { cardUsage, invoiceTotals } from "@/modules/cartoes/queries";
import { categoryRefOf, toTransactionDTO } from "@/modules/transacoes/service";
import type { ConfirmItem } from "./confirm-schema";
import type { Written } from "./confirm-write";
import { reconcileTotal } from "./total";

/** Resposta 201 (spec 13): lote, lançamentos da fatura alvo (parcela n de cada item), cartão e fatura recalculados. */
export async function buildResponse(
  tx: Tx,
  ctx: RequestContext,
  a: {
    batch: ImportBatch;
    card: { id: string; name: string; color: never | string; limitInCents: bigint };
    target: InvoiceRow;
    written: Map<string, Written>;
    items: ConfirmItem[];
    members: Map<string, MemberRef>;
  },
) {
  const categories = await tx.category.findMany({
    where: { familyId: ctx.familyId, id: { in: [...new Set(a.items.map((i) => i.categoryId))] } },
  });
  const catById = new Map(categories.map((c) => [c.id, categoryRefOf(c)] as const));
  const transactions = [...a.written.values()].map((w) =>
    toTransactionDTO(
      { ...w.row, splits: [] },
      {
        tags: [],
        account: null,
        card: { id: a.card.id, name: a.card.name, color: a.card.color as never },
        invoice: {
          ref: a.target.ref,
          closingDate: a.target.closingDate,
          dueDate: a.target.dueDate,
        },
        category: catById.get(w.row.categoryId as string) ?? null,
        members: a.members,
      },
    ),
  );
  const used = (await cardUsage(tx, ctx.familyId, [a.card.id])).get(a.card.id) ?? 0;
  const totals = (await invoiceTotals(tx, ctx.familyId, [a.target.id])).get(a.target.id);
  const rec = reconcileTotal(a.items.map((i) => ({ ...i, selected: true })));
  return {
    batch: {
      id: a.batch.id,
      cardId: a.batch.cardId,
      invoiceId: a.batch.invoiceId,
      invoiceRef: a.target.ref,
      source: a.batch.source,
      itemCount: a.batch.itemCount,
      totalInCents: toCents(a.batch.totalInCents),
      importedAt: a.batch.importedAt.toISOString(),
      importedByMemberId: a.batch.importedByMemberId,
    },
    transactions,
    card: {
      id: a.card.id,
      usedInCents: used,
      availableInCents: toCents(a.card.limitInCents) - used,
    },
    invoice: {
      id: a.target.id,
      ref: a.target.ref,
      closingDate: a.target.closingDate,
      dueDate: a.target.dueDate,
      totalInCents: totals?.totalInCents ?? 0,
    },
    reconcileTotal: {
      itemsTotal: String(rec.itemsTotal),
      selectedTotal: String(rec.selectedTotal),
      difference: String(rec.difference),
    },
  };
}
