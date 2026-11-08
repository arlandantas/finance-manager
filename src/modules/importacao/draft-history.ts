import type { Prisma } from "@/generated/prisma/client";
import type { RequestContext, Tx } from "@/lib/api/types";
import { addDays, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { normalizeDescription } from "@/modules/analise-ia/recurring";
import { periodFilter } from "@/modules/transacoes/ledger-where";

// Leituras do rascunho (US-067). Sempre com `familyId` da sessão; só lançamentos ativos. Nada é gravado.

/** "Só meu" alheio nunca alimenta sugestão nem link de duplicado: só o que o membro enxerga entra. */
const visibleTo = (memberId: string): Prisma.TransactionWhereInput => ({
  OR: [
    { isSharedExpense: true },
    { splitMode: { not: "NONE" } },
    { authorMemberId: memberId },
    { payerMemberId: memberId },
  ],
});

/** Regra 12: categoria majoritária (≥ 50 %) por descrição normalizada nos últimos 12 meses. Parcelas ficam fora. */
export async function categoryHistory(
  tx: Tx,
  ctx: RequestContext,
  descriptions: readonly string[],
): Promise<Map<string, string>> {
  const wanted = new Set(descriptions.map(normalizeDescription).filter((k) => k !== ""));
  const out = new Map<string, string>();
  if (wanted.size === 0) return out;
  const today = todayInFamilyTz(ctx.clock);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const since = fromDbDate(new Date(Date.UTC(y - 1, m - 1, d)));
  const rows = await tx.transaction.findMany({
    where: {
      familyId: ctx.familyId,
      kind: "EXPENSE",
      deletedAt: null,
      installmentPlanId: null,
      categoryId: { not: null },
      ...periodFilter(since, today),
      category: { archivedAt: null, kind: "EXPENSE" },
      ...visibleTo(ctx.memberId),
    },
    select: { description: true, categoryId: true },
    take: 20000,
  });
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = normalizeDescription(r.description);
    if (!wanted.has(key) || !r.categoryId) continue;
    const byCat = counts.get(key) ?? new Map<string, number>();
    byCat.set(r.categoryId, (byCat.get(r.categoryId) ?? 0) + 1);
    counts.set(key, byCat);
  }
  for (const [key, byCat] of counts) {
    const total = [...byCat.values()].reduce((s, n) => s + n, 0);
    const [best, n] = [...byCat.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0] ?? ["", 0];
    if (best && n * 2 >= total) out.set(key, best);
  }
  return out;
}

/** Categoria ativa de despesa "Outros" (regra 12); `null` = a família não tem. */
export async function fallbackCategoryId(tx: Tx, ctx: RequestContext): Promise<string | null> {
  const c = await tx.category.findFirst({
    where: { familyId: ctx.familyId, kind: "EXPENSE", name: "Outros", archivedAt: null },
    select: { id: true },
  });
  return c?.id ?? null;
}

export type Candidate = {
  id: string;
  date: string;
  amountInCents: bigint;
  description: string;
  invoiceId: string | null;
  installmentNo: number | null;
  installmentCount: number | null;
};

/** Lançamentos ativos do cartão na janela [from-3d, to+3d] visíveis ao membro (regra 13). */
export async function cardCandidates(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  from: string,
  to: string,
): Promise<Candidate[]> {
  const lo = addDays(from, -3);
  const hi = addDays(to, 3);
  const rows = await tx.transaction.findMany({
    where: {
      familyId: ctx.familyId,
      cardId,
      kind: "EXPENSE",
      deletedAt: null,
      installmentPlanId: null, // parcelas têm regra própria (`postedParcels`)
      ...periodFilter(lo, hi),
      ...visibleTo(ctx.memberId),
    },
    select: {
      id: true,
      occurredOn: true,
      amountInCents: true,
      description: true,
      invoiceId: true,
      installmentNo: true,
      installmentCount: true,
    },
  });
  return rows.map((r) => ({ ...r, date: fromDbDate(r.occurredOn) }));
}

/** Parcelas de planos futuros têm `occurredOn` fora da janela: busca à parte por (fatura, n/N, valor). */
export async function postedParcels(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  invoiceId: string,
): Promise<Candidate[]> {
  const rows = await tx.transaction.findMany({
    where: {
      familyId: ctx.familyId,
      cardId,
      invoiceId,
      deletedAt: null,
      installmentPlanId: { not: null },
      ...visibleTo(ctx.memberId),
    },
    select: {
      id: true,
      occurredOn: true,
      amountInCents: true,
      description: true,
      invoiceId: true,
      installmentNo: true,
      installmentCount: true,
    },
  });
  return rows.map((r) => ({ ...r, date: fromDbDate(r.occurredOn) }));
}

/** `ALREADY_IMPORTED`: chaves já usadas por lançamento ativo da família. */
export async function activeImportKeys(
  tx: Tx,
  ctx: RequestContext,
  keys: readonly string[],
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, deletedAt: null, importKey: { in: [...keys] } },
    select: { importKey: true },
  });
  return new Set(rows.flatMap((r) => (r.importKey ? [r.importKey] : [])));
}

/** Regra 13: lote ativo do mesmo arquivo no cartão. */
export async function activeBatchAt(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  fileHash: string,
): Promise<Date | null> {
  const b = await tx.importBatch.findFirst({
    where: { familyId: ctx.familyId, cardId, fileHash, revertedAt: null },
    select: { importedAt: true },
  });
  return b?.importedAt ?? null;
}
