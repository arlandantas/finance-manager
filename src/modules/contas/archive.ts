import { conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { accountBalances, neverUsedAccountIds } from "@/modules/contas/ledger-queries";
import { contasRepo } from "@/modules/contas/repo";
import type { AccountDTO } from "@/modules/contas/schemas";
import { listAccounts } from "@/modules/contas/service";
import { memberFirstName } from "@/modules/familia/display-name";

type Row = {
  id: string;
  name: string;
  version: number;
  archivedAt: Date | null;
  archivedByMemberId: string | null;
};

/** `FOR UPDATE` da conta (conflita com o FOR SHARE de qualquer postagem em andamento). */
async function lockForUpdate(tx: Tx, ctx: RequestContext, id: string): Promise<Row> {
  const rows = await tx.$queryRaw<Row[]>`
    SELECT id, name, version, "archivedAt", "archivedByMemberId" FROM bank_accounts
    WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound("Conta não encontrada.");
  return row;
}

async function whoChanged(tx: Tx, ctx: RequestContext, row: Row): Promise<string> {
  if (!row.archivedByMemberId) return "outra pessoa";
  const m = await tx.member.findFirst({
    where: { id: row.archivedByMemberId, familyId: ctx.familyId },
    include: { user: true },
  });
  return m ? memberFirstName(m) : "outra pessoa";
}

async function versionGuard(tx: Tx, ctx: RequestContext, row: Row, version: number) {
  if (row.version !== version) {
    throw conflict(
      "VERSION_CONFLICT",
      `Esta conta foi alterada por ${await whoChanged(tx, ctx, row)}. Recarregue para continuar.`,
      { currentVersion: row.version },
    );
  }
}

async function dto(tx: Tx, ctx: RequestContext, id: string): Promise<AccountDTO> {
  const all = await listAccounts(tx, ctx, "all");
  const found = all.items.find((a) => a.id === id);
  if (!found) throw notFound("Conta não encontrada.");
  return found;
}

export type AccountArchiveBlocker = {
  code: string;
  message: string;
  amountInCents?: number;
};

/** Impedimentos de arquivar conta (fonte única de `archive` e `archive-check`). */
async function accountArchiveBlockers(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<AccountArchiveBlocker[]> {
  const out: AccountArchiveBlocker[] = [];
  const balance = (await accountBalances(tx, ctx.familyId, [id])).get(id) ?? 0;
  if (balance !== 0) {
    out.push({
      code: "ACCOUNT_BALANCE_NOT_ZERO",
      message: "Para arquivar, o saldo precisa ser zero. Transfira ou ajuste o saldo antes.",
      amountInCents: balance,
    });
  }
  // US-100b (ADR-037 §4): transferência prevista pendente usa a conta; lida dentro do FOR UPDATE da conta
  const planned = await tx.plannedTransfer.count({
    where: {
      familyId: ctx.familyId,
      deletedAt: null,
      status: "PREVISTA",
      OR: [{ fromAccountId: id }, { toAccountId: id }],
    },
  });
  // US-101b: série ativa (não encerrada e com mês final futuro) também usa a conta; a mensagem da série vence,
  // pois excluir as ocorrências não adianta (a série gera de novo).
  const month = todayInFamilyTz(ctx.clock).slice(0, 7);
  const activeSeries = await tx.recurringTransfer.count({
    where: {
      familyId: ctx.familyId,
      endedAt: null,
      OR: [{ endMonth: null }, { endMonth: { gte: new Date(`${month}-01T00:00:00Z`) } }],
      AND: [{ OR: [{ fromAccountId: id }, { toAccountId: id }] }],
    },
  });
  if (activeSeries > 0) {
    out.push({
      code: "ACCOUNT_HAS_PLANNED_TRANSFERS",
      message: "Encerre a transferência mensal ou troque a conta",
    });
  } else if (planned > 0) {
    out.push({
      code: "ACCOUNT_HAS_PLANNED_TRANSFERS",
      message: "Exclua ou efetive as transferências previstas desta conta",
    });
  }
  return out;
}

/** GET /accounts/:id/archive-check: leitura, sem escrita. */
export async function accountArchiveCheck(tx: Tx, ctx: RequestContext, id: string) {
  const found = await tx.bankAccount.findFirst({
    where: { id, familyId: ctx.familyId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound("Conta não encontrada.");
  return { blockers: await accountArchiveBlockers(tx, ctx, id) };
}

/** POST /accounts/:id/archive: saldo zero dentro do lock. */
export async function archiveAccount(tx: Tx, ctx: RequestContext, id: string, version: number) {
  const row = await lockForUpdate(tx, ctx, id);
  await versionGuard(tx, ctx, row, version);
  if (row.archivedAt) throw conflict("ALREADY_ARCHIVED", "Esta conta já está arquivada.");
  const first = (await accountArchiveBlockers(tx, ctx, id))[0];
  if (first) {
    throw unprocessable(first.code, first.message, { balanceInCents: first.amountInCents });
  }
  await tx.bankAccount.updateMany({
    where: { id, familyId: ctx.familyId },
    data: {
      archivedAt: ctx.clock.now(),
      archivedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  return { account: await dto(tx, ctx, id) };
}

export async function unarchiveAccount(tx: Tx, ctx: RequestContext, id: string, version: number) {
  const row = await lockForUpdate(tx, ctx, id);
  await versionGuard(tx, ctx, row, version);
  if (!row.archivedAt) throw conflict("NOT_ARCHIVED", "Esta conta não está arquivada.");
  await tx.bankAccount.updateMany({
    where: { id, familyId: ctx.familyId },
    data: { archivedAt: null, archivedByMemberId: null, version: { increment: 1 } },
  });
  return { account: await dto(tx, ctx, id) };
}

/**
 * US-089 (SDD-030 §4.4, D-TL-U8-3): excluir a conta limpa o vínculo dos cartões que a usam, na mesma transação
 * (`version + 1` e um evento por cartão). Prisma direto: `contas` não importa `cartoes` (ciclo).
 */
async function clearCardPayers(
  tx: Tx,
  ctx: RequestContext,
  accountId: string,
  accountName: string,
) {
  const cards = await tx.creditCard.findMany({
    where: { familyId: ctx.familyId, paymentAccountId: accountId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  if (cards.length === 0) return;
  await tx.creditCard.updateMany({
    where: { familyId: ctx.familyId, paymentAccountId: accountId, deletedAt: null },
    data: {
      paymentAccountId: null,
      version: { increment: 1 },
      updatedByMemberId: ctx.memberId,
    },
  });
  for (const c of cards) {
    await tx.familyEvent.create({
      data: {
        familyId: ctx.familyId,
        type: "CARD_PAYER_ACCOUNT_CHANGED",
        actorMemberId: ctx.memberId,
        changes: {
          cardId: c.id,
          cardName: c.name,
          fromAccountId: accountId,
          fromAccountName: accountName,
          toAccountId: null,
          toAccountName: null,
          reason: "ACCOUNT_DELETED",
        },
      },
    });
  }
}

/** Exclusão lógica terminal (só ADMIN; só conta nunca usada): some de tudo e libera o nome. */
export async function deleteAccount(tx: Tx, ctx: RequestContext, id: string, version: number) {
  if (ctx.role !== "ADMIN") throw forbidden();
  const row = await lockForUpdate(tx, ctx, id);
  await versionGuard(tx, ctx, row, version);
  if (!(await neverUsedAccountIds(tx, ctx.familyId)).has(id)) {
    throw unprocessable("ACCOUNT_HAS_HISTORY", "Esta conta tem histórico e só pode ser arquivada");
  }
  await tx.bankAccount.updateMany({
    where: { id, familyId: ctx.familyId },
    data: {
      deletedAt: ctx.clock.now(),
      deletedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  await clearCardPayers(tx, ctx, id, row.name);
  return { deleted: true };
}

export { contasRepo };
