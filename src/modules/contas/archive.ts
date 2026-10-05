import { conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { accountBalances, neverUsedAccountIds } from "@/modules/contas/ledger-queries";
import { contasRepo } from "@/modules/contas/repo";
import type { AccountDTO } from "@/modules/contas/schemas";
import { listAccounts } from "@/modules/contas/service";

type Row = {
  id: string;
  version: number;
  archivedAt: Date | null;
  archivedByMemberId: string | null;
};

/** `FOR UPDATE` da conta (conflita com o FOR SHARE de qualquer postagem em andamento). */
async function lockForUpdate(tx: Tx, ctx: RequestContext, id: string): Promise<Row> {
  const rows = await tx.$queryRaw<Row[]>`
    SELECT id, version, "archivedAt", "archivedByMemberId" FROM bank_accounts
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
  return (m?.user.name ?? m?.user.email.split("@")[0] ?? "outra pessoa").split(" ")[0] as string;
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

/** POST /accounts/:id/archive: saldo zero dentro do lock. */
export async function archiveAccount(tx: Tx, ctx: RequestContext, id: string, version: number) {
  const row = await lockForUpdate(tx, ctx, id);
  await versionGuard(tx, ctx, row, version);
  if (row.archivedAt) throw conflict("ALREADY_ARCHIVED", "Esta conta já está arquivada.");
  const balance = (await accountBalances(tx, ctx.familyId, [id])).get(id) ?? 0;
  if (balance !== 0) {
    throw unprocessable(
      "ACCOUNT_BALANCE_NOT_ZERO",
      "Para arquivar, o saldo precisa ser zero. Transfira ou ajuste o saldo antes.",
      { balanceInCents: balance },
    );
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
  return { deleted: true };
}

export { contasRepo };
