import { conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { formatInvoiceLabel, openInvoiceRef } from "@/modules/cartoes/cycle";
import {
  cardInvoiceSummaries,
  cardsWithTransactions,
  futureInstallmentsInCents,
} from "@/modules/cartoes/queries";
import { cartoesRepo } from "@/modules/cartoes/repo";
import { listCards } from "@/modules/cartoes/service";
import { memberFirstName } from "@/modules/familia/display-name";

type Row = {
  id: string;
  version: number;
  archivedAt: Date | null;
  archivedByMemberId: string | null;
  closingDay: number;
  dueDay: number;
};

async function lockForUpdate(tx: Tx, ctx: RequestContext, id: string): Promise<Row> {
  const rows = await tx.$queryRaw<Row[]>`
    SELECT id, version, "archivedAt", "archivedByMemberId", "closingDay", "dueDay" FROM credit_cards
    WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound("Cartão não encontrado.");
  return row;
}

async function guard(tx: Tx, ctx: RequestContext, row: Row, version: number) {
  if (row.version === version) return;
  const m = row.archivedByMemberId
    ? await cartoesRepo(tx, ctx.familyId).member(row.archivedByMemberId)
    : null;
  const name = m ? memberFirstName(m) : "outra pessoa";
  throw conflict(
    "VERSION_CONFLICT",
    `Este cartão foi alterado por ${name}. Recarregue para continuar.`,
    {
      currentVersion: row.version,
    },
  );
}

async function dto(tx: Tx, ctx: RequestContext, id: string) {
  const all = await listCards(tx, ctx, "all");
  const card = all.items.find((c) => c.id === id);
  if (!card) throw notFound("Cartão não encontrado.");
  return card;
}

export type ArchiveBlocker = {
  code: string;
  message: string;
  amountInCents?: number;
  ref?: string;
};

/**
 * Impedimentos de arquivamento (SDD-012 §1, US-054), em ordem: faturas fechadas/vencidas não pagas;
 * fatura aberta com compras; parcelas futuras. Fonte única de `archive` e de `GET archive-check`.
 */
export async function cardArchiveBlockers(
  tx: Tx,
  ctx: RequestContext,
  row: { id: string; closingDay: number; dueDay: number },
): Promise<ArchiveBlocker[]> {
  const today = todayInFamilyTz(ctx.clock);
  const inv = (await cardInvoiceSummaries(tx, ctx.familyId, [row], today)).get(row.id);
  const out: ArchiveBlocker[] = (inv?.payable ?? []).map((u) => ({
    code: "CARD_HAS_UNPAID_INVOICE",
    message: "Pague a fatura antes de arquivar o cartão",
    amountInCents: u.totalInCents,
    ref: u.ref,
  }));
  if (inv && inv.open.totalInCents > 0) {
    out.push({
      code: "CARD_HAS_OPEN_PURCHASES",
      message: "Há compras na fatura aberta. Pague a fatura quando ela fechar para arquivar.",
      amountInCents: inv.open.totalInCents,
    });
  }
  // SDD-014 §4.9: parcelas ativas em faturas futuras (sem pagamento: futura não se paga) também bloqueiam
  const future = await futureInstallmentsInCents(
    tx,
    ctx.familyId,
    row.id,
    openInvoiceRef(today, row.closingDay),
  );
  if (future > 0) {
    out.push({
      code: "CARD_HAS_FUTURE_INSTALLMENTS",
      message: "Este cartão tem parcelas futuras. Exclua as compras parceladas antes de arquivar",
      amountInCents: future,
    });
  }
  return out;
}

/** GET /cards/:id/archive-check: leitura, sem escrita. */
export async function cardArchiveCheck(tx: Tx, ctx: RequestContext, id: string) {
  const row = await tx.creditCard.findFirst({
    where: { id, familyId: ctx.familyId, deletedAt: null },
    select: { id: true, closingDay: true, dueDay: true },
  });
  if (!row) throw notFound("Cartão não encontrado.");
  return { blockers: await cardArchiveBlockers(tx, ctx, row) };
}

export async function archiveCard(tx: Tx, ctx: RequestContext, id: string, version: number) {
  const row = await lockForUpdate(tx, ctx, id);
  await guard(tx, ctx, row, version);
  if (row.archivedAt) throw conflict("ALREADY_ARCHIVED", "Este cartão já está arquivado.");
  const first = (await cardArchiveBlockers(tx, ctx, row))[0];
  if (first) {
    throw unprocessable(
      first.code,
      first.message,
      first.ref ? { ref: first.ref, label: formatInvoiceLabel(first.ref) } : undefined,
    );
  }
  await tx.creditCard.updateMany({
    where: { id, familyId: ctx.familyId },
    data: {
      archivedAt: ctx.clock.now(),
      archivedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  return { card: await dto(tx, ctx, id) };
}

export async function unarchiveCard(tx: Tx, ctx: RequestContext, id: string, version: number) {
  const row = await lockForUpdate(tx, ctx, id);
  await guard(tx, ctx, row, version);
  if (!row.archivedAt) throw conflict("NOT_ARCHIVED", "Este cartão não está arquivado.");
  await tx.creditCard.updateMany({
    where: { id, familyId: ctx.familyId },
    data: { archivedAt: null, archivedByMemberId: null, version: { increment: 1 } },
  });
  return { card: await dto(tx, ctx, id) };
}

/** Exclusão lógica terminal: só ADMIN e só cartão sem nenhuma compra. */
export async function deleteCard(tx: Tx, ctx: RequestContext, id: string, version: number) {
  if (ctx.role !== "ADMIN") throw forbidden();
  const row = await lockForUpdate(tx, ctx, id);
  await guard(tx, ctx, row, version);
  if ((await cardsWithTransactions(tx, ctx.familyId, [id])).has(id)) {
    throw unprocessable("CARD_HAS_HISTORY", "Este cartão tem compras e só pode ser arquivado");
  }
  await tx.creditCard.updateMany({
    where: { id, familyId: ctx.familyId },
    data: {
      deletedAt: ctx.clock.now(),
      deletedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  return { deleted: true };
}
