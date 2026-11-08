import type { Prisma } from "@/generated/prisma/client";
import type { RequestContext, Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import type { InvoiceRow } from "@/modules/cartoes/invoices";
import type { PlanDraft, SingleDraft } from "./confirm-map";

// Gravação do lote (US-068): só INSERTs, sempre com o `familyId` da sessão. Itens nascem "Só meu" (`splitMode`
// NONE por padrão, sem linhas de rateio), `origin = INVOICE_IMPORT`, `accountId` nulo.

type Row = Prisma.TransactionGetPayload<object>;

export type Snapshot = Record<string, unknown>;
export type Written = { row: Row; snapshot: Snapshot };

const base = (ctx: RequestContext, batchId: string, cardId: string) => ({
  familyId: ctx.familyId,
  kind: "EXPENSE" as const,
  direction: "DEBIT" as const,
  accountId: null,
  cardId,
  isSharedExpense: false,
  origin: "INVOICE_IMPORT" as const,
  importBatchId: batchId,
  authorMemberId: ctx.memberId,
});

const snapshotOf = (
  cardId: string,
  ref: string,
  d: SingleDraft | PlanDraft,
  amount: bigint,
  occurredOn: string,
  batchId: string,
): Snapshot => ({
  kind: "EXPENSE",
  accountId: null,
  cardId,
  invoiceRef: ref,
  categoryId: d.item.categoryId,
  amountInCents: Number(amount),
  occurredOn,
  description: d.item.description,
  payerMemberId: d.item.payerMemberId,
  isSharedExpense: false,
  origin: "INVOICE_IMPORT",
  importBatchId: batchId,
});

/** Compras à vista: um INSERT só; devolve as linhas na ordem dos rascunhos. */
export async function insertSingles(
  tx: Tx,
  ctx: RequestContext,
  a: { batchId: string; cardId: string; invoice: InvoiceRow },
  singles: readonly SingleDraft[],
): Promise<Written[]> {
  if (singles.length === 0) return [];
  const rows = await tx.transaction.createManyAndReturn({
    data: singles.map((s) => ({
      ...base(ctx, a.batchId, a.cardId),
      invoiceId: a.invoice.id,
      categoryId: s.item.categoryId,
      amountInCents: s.amountInCents,
      occurredOn: toDbDate(s.item.date),
      description: s.item.description,
      payerMemberId: s.item.payerMemberId,
      importKey: s.key,
    })),
  });
  const byKey = new Map(rows.map((r) => [r.importKey, r] as const));
  return singles.map((s) => {
    const row = byKey.get(s.key) as (typeof rows)[number];
    return {
      row,
      snapshot: snapshotOf(a.cardId, a.invoice.ref, s, s.amountInCents, s.item.date, a.batchId),
    };
  });
}

/** Plano `n/N` (regra 15): parcela n com `importKey`, n+1..N sem; cada parcela na sua fatura. */
export async function insertPlan(
  tx: Tx,
  ctx: RequestContext,
  a: { batchId: string; cardId: string; invoices: Map<string, InvoiceRow> },
  p: PlanDraft,
): Promise<{ planId: string; written: Written[] }> {
  const plan = await tx.installmentPlan.create({
    data: {
      familyId: ctx.familyId,
      cardId: a.cardId,
      totalInCents: p.totalInCents,
      installmentCount: p.item.installment?.count as number,
      paidBeforeAppCount: p.paidBeforeApp,
      purchaseOn: toDbDate(p.anchorOn),
      description: p.item.description,
      note: null,
      categoryId: p.item.categoryId,
      payerMemberId: p.item.payerMemberId,
      authorMemberId: ctx.memberId,
      importBatchId: a.batchId,
    },
  });
  const count = p.item.installment?.count as number;
  const rows = await tx.transaction.createManyAndReturn({
    data: p.parcels.map((d) => ({
      ...base(ctx, a.batchId, a.cardId),
      invoiceId: (a.invoices.get(d.invoiceRef) as InvoiceRow).id,
      categoryId: p.item.categoryId,
      amountInCents: BigInt(d.amountInCents),
      occurredOn: toDbDate(d.occurredOn),
      description: p.item.description,
      payerMemberId: p.item.payerMemberId,
      installmentPlanId: plan.id,
      installmentNo: d.no,
      installmentCount: count,
      importKey: d.no === p.item.installment?.no ? p.key : null,
    })),
  });
  rows.sort((x, y) => (x.installmentNo as number) - (y.installmentNo as number));
  const written = rows.map((row, i) => {
    const d = p.parcels[i] as (typeof p.parcels)[number];
    return {
      row,
      snapshot: {
        ...snapshotOf(a.cardId, d.invoiceRef, p, BigInt(d.amountInCents), d.occurredOn, a.batchId),
        installment: { planId: plan.id, no: d.no, count, paidBeforeApp: p.paidBeforeApp },
      },
    };
  });
  return { planId: plan.id, written };
}

/** Revisão `CREATE` (revision = 1) de cada lançamento do grupo, num INSERT só. */
export async function insertRevisions(
  tx: Tx,
  ctx: RequestContext,
  written: readonly Written[],
): Promise<void> {
  if (written.length === 0) return;
  await tx.transactionRevision.createMany({
    data: written.map((w) => ({
      familyId: ctx.familyId,
      transactionId: w.row.id,
      revision: 1,
      action: "CREATE" as const,
      actorMemberId: ctx.memberId,
      changes: [{ field: "*", from: null, to: w.snapshot }] as unknown as Prisma.InputJsonValue,
    })),
  });
}
