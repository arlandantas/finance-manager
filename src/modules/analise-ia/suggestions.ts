import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodOf } from "@/lib/period";
import { windowPeriods } from "@/modules/analise-ia/aggregates";
import type { CategorySuggestionDTO } from "@/modules/analise-ia/dto";
import { normalizeDescription } from "@/modules/analise-ia/recurring";
import {
  computeSuggestions,
  dismissKey,
  MAX_SUGGESTIONS,
  type SuggestionRow,
} from "@/modules/analise-ia/rules-category-suggestion";
import type { AcceptSuggestionInput, DismissSuggestionInput } from "@/modules/analise-ia/schemas";
import { recordRevision } from "@/modules/contas/ledger";
import { splitRepo } from "@/modules/split/repo";
import { periodPredicate } from "@/modules/transacoes/ledger-where";
import { assertCanWriteTransaction, canWriteTransaction } from "@/modules/transacoes/ownership";
import { transacoesRepo } from "@/modules/transacoes/repo";
import { getTransaction } from "@/modules/transacoes/service";

// SDD-023 §4.6 / ADR-029 §4: sugestão de categoria por REGRA LOCAL (sem IA, sem consentimento).
// Aplicar = edição NÃO financeira da categoria: vale em fatura paga e conta arquivada (D-PO-46).

export async function listCategorySuggestions(
  tx: Tx,
  ctx: RequestContext,
): Promise<{ items: CategorySuggestionDTO[] }> {
  const cutDay = await splitRepo(tx, ctx.familyId).cutDay();
  const current = periodOf(todayInFamilyTz(ctx.clock), cutDay);
  const periods = windowPeriods(current.key, cutDay);
  const first = periods[0];
  if (!first) return { items: [] };

  const raw = await tx.$queryRaw<
    Array<{
      id: string;
      version: number;
      description: string;
      occurredOn: Date;
      amountInCents: bigint;
      categoryId: string;
      kind: string;
      isSharedExpense: boolean;
      payerMemberId: string | null;
      authorMemberId: string;
    }>
  >`
    SELECT t.id::text AS id, t.version, t.description, t."occurredOn", t."amountInCents",
           t."categoryId"::text AS "categoryId", t.kind::text AS kind,
           t."isSharedExpense", t."payerMemberId"::text AS "payerMemberId",
           t."authorMemberId"::text AS "authorMemberId"
    FROM transactions t
    WHERE t."familyId" = ${ctx.familyId}::uuid AND t."deletedAt" IS NULL AND t.kind = 'EXPENSE'
      AND t."installmentPlanId" IS NULL AND t."categoryId" IS NOT NULL
      AND ${periodPredicate("t", first.start, current.end)}`;
  const removed = new Set(
    (
      await tx.member.findMany({
        where: { familyId: ctx.familyId, removedAt: { not: null } },
        select: { id: true },
      })
    ).map((m) => m.id),
  );
  const rows: SuggestionRow[] = [];
  for (const r of raw) {
    const key = normalizeDescription(r.description);
    if (!key) continue;
    // SEC-021: não sugere (nem deixa aceitar) mudança em "Só meu" de outro membro
    const owner = r.payerMemberId ?? r.authorMemberId;
    if (!canWriteTransaction(r, ctx, removed.has(owner))) continue;
    rows.push({
      id: r.id,
      version: r.version,
      description: r.description,
      descriptionKey: key,
      occurredOn: fromDbDate(r.occurredOn),
      amountInCents: toCents(r.amountInCents),
      categoryId: r.categoryId,
    });
  }
  const cats = await tx.category.findMany({
    where: { familyId: ctx.familyId },
    select: { id: true, name: true, kind: true, archivedAt: true },
  });
  const eligible = new Set(
    cats.filter((c) => c.kind === "EXPENSE" && c.archivedAt === null).map((c) => c.id),
  );
  const nameOf = new Map(cats.map((c) => [c.id, c.name] as const));
  const dismissedRows = await tx.categorySuggestionDismissal.findMany({
    where: { familyId: ctx.familyId },
    select: { descriptionKey: true, toCategoryId: true },
  });
  const dismissed = new Set(dismissedRows.map((d) => dismissKey(d.descriptionKey, d.toCategoryId)));
  const found = computeSuggestions(rows, {
    eligibleCategoryIds: eligible,
    dismissed,
    limit: MAX_SUGGESTIONS,
  });
  return {
    items: found.map((s) => ({
      transactionId: s.row.id,
      version: s.row.version,
      description: s.row.description,
      descriptionKey: s.row.descriptionKey,
      occurredOn: s.row.occurredOn,
      amountInCents: s.row.amountInCents,
      from: { id: s.row.categoryId, name: nameOf.get(s.row.categoryId) ?? "Categoria" },
      to: { id: s.toCategoryId, name: nameOf.get(s.toCategoryId) ?? "Categoria" },
      why: `${s.countInTarget} de ${s.total} lançamentos de "${s.row.descriptionKey}" estão em ${nameOf.get(s.toCategoryId) ?? "outra categoria"}`,
    })),
  };
}

/**
 * POST /category-suggestions/accept: muda SÓ a categoria (valor, data, divisão e conta intactos).
 * `undo` reverte um aceite (mesma rotina, sem exigir categoria ativa e com origem própria no histórico).
 */
export async function acceptCategorySuggestion(
  tx: Tx,
  ctx: RequestContext,
  input: AcceptSuggestionInput,
) {
  const repo = transacoesRepo(tx, ctx.familyId);
  const row = await repo.findById(input.transactionId);
  if (!row) throw notFound("Lançamento não encontrado.");
  await assertCanWriteTransaction(tx, ctx, row); // SEC-021
  if (row.kind !== "EXPENSE") {
    throw unprocessable("NOT_EDITABLE", "Só despesas recebem sugestão de categoria");
  }
  if (row.deletedAt) {
    throw unprocessable("TRANSACTION_DELETED", "Este lançamento foi excluído.");
  }
  if (row.version !== input.version) {
    throw conflict(
      "VERSION_CONFLICT",
      "Este lançamento foi alterado por outra pessoa. Recarregue para continuar.",
      { currentVersion: row.version },
    );
  }
  if (row.categoryId !== input.fromCategoryId) {
    throw conflict("SUGGESTION_STALE", "A categoria deste lançamento já mudou. Atualize a lista.");
  }
  const target = await tx.category.findFirst({
    where: { id: input.toCategoryId, familyId: ctx.familyId },
    select: { kind: true, archivedAt: true },
  });
  if (!target || target.kind !== "EXPENSE" || (!input.undo && target.archivedAt !== null)) {
    throw unprocessable("INVALID_REFERENCE", "Escolha uma categoria de despesa ativa", [
      { path: "toCategoryId", message: "Categoria inválida ou arquivada" },
    ]);
  }
  if (input.toCategoryId === input.fromCategoryId) {
    throw unprocessable("INVALID_REFERENCE", "A categoria sugerida já é a atual");
  }
  const res = await repo.updateVersioned(row.id, input.version, {
    categoryId: input.toCategoryId,
    updatedByMemberId: ctx.memberId,
  });
  if (res.count === 0) {
    throw conflict(
      "VERSION_CONFLICT",
      "Este lançamento foi alterado por outra pessoa. Recarregue para continuar.",
    );
  }
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: row.id,
    revision: input.version + 1,
    action: "UPDATE",
    actorMemberId: ctx.memberId,
    changes: [
      {
        field: "categoryId",
        from: input.fromCategoryId,
        to: input.toCategoryId,
        source: input.undo ? "CATEGORY_SUGGESTION_UNDO" : "CATEGORY_SUGGESTION",
      },
    ],
  });
  return getTransaction(tx, ctx, row.id);
}

/** POST /category-suggestions/dismiss: "Recusar" (vale para a família; idempotente). */
export async function dismissCategorySuggestion(
  tx: Tx,
  ctx: RequestContext,
  input: DismissSuggestionInput,
): Promise<{ dismissed: true }> {
  const target = await tx.category.findFirst({
    where: { id: input.toCategoryId, familyId: ctx.familyId },
    select: { id: true },
  });
  if (!target) throw unprocessable("INVALID_REFERENCE", "Categoria inválida");
  await tx.categorySuggestionDismissal.upsert({
    where: {
      familyId_descriptionKey_toCategoryId: {
        familyId: ctx.familyId,
        descriptionKey: input.descriptionKey,
        toCategoryId: input.toCategoryId,
      },
    },
    create: {
      familyId: ctx.familyId,
      descriptionKey: input.descriptionKey,
      toCategoryId: input.toCategoryId,
      byMemberId: ctx.memberId,
      createdAt: ctx.clock.now(),
    },
    update: {},
  });
  return { dismissed: true };
}
