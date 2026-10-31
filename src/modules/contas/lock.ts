import { unprocessable } from "@/lib/api/errors";
import type { Tx } from "@/lib/api/types";

/**
 * Protocolo de lock (SDD-012 §4.1). Postar: `FOR SHARE` das contas em ordem crescente de id (sem deadlock)
 * e checagem de arquivada/excluída DEPOIS do lock. Arquivar: `FOR UPDATE` na conta. Resultado: ou a
 * postagem comita antes (e o arquivamento vê saldo ≠ 0) ou o arquivamento comita antes (e a postagem recusa).
 */
export async function lockAccountsForPosting(
  tx: Tx,
  familyId: string,
  ids: string[],
  path: "accountId" | "fromAccountId" | "toAccountId" | "paymentAccountId" = "accountId",
): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;
  const rows = await tx.$queryRaw<
    Array<{ id: string; archivedAt: Date | null; deletedAt: Date | null }>
  >`
    SELECT id, "archivedAt", "deletedAt" FROM bank_accounts
    WHERE "familyId" = ${familyId}::uuid AND id = ANY(${unique}::uuid[])
    ORDER BY id FOR SHARE`;
  const ok = new Map(rows.map((r) => [r.id, r.archivedAt === null && r.deletedAt === null]));
  for (const id of ids) {
    if (!ok.get(id)) {
      throw unprocessable("INVALID_REFERENCE", "Escolha uma conta", [
        { path, message: "Escolha uma conta" },
      ]);
    }
  }
}

/** Editar/excluir/restaurar lançamento de conta arquivada: recusa (SDD-012 §1). */
export async function assertAccountsEditable(tx: Tx, familyId: string, ids: Array<string | null>) {
  const list = [...new Set(ids.filter((i): i is string => i !== null))].sort();
  if (list.length === 0) return;
  const rows = await tx.$queryRaw<Array<{ archivedAt: Date | null }>>`
    SELECT "archivedAt" FROM bank_accounts
    WHERE "familyId" = ${familyId}::uuid AND id = ANY(${list}::uuid[])
    ORDER BY id FOR SHARE`;
  if (rows.some((r) => r.archivedAt !== null)) {
    throw unprocessable("ACCOUNT_ARCHIVED_LOCKED", "Reative a conta para alterar este lançamento");
  }
}

/**
 * Trava compartilhada SEM checagem de arquivada (SDD-034 §4.1/R2, ordem de travas): quem vai ler o dono com
 * `FOR SHARE` em `members` trava ANTES as contas envolvidas (a mesma ordem de `familia/removal.ts`: conta ➔ membro),
 * para não fechar ciclo com a remoção do membro. Ordem crescente de id.
 */
export async function shareLockAccounts(
  tx: Tx,
  familyId: string,
  ids: Array<string | null | undefined>,
): Promise<void> {
  const unique = [
    ...new Set(ids.filter((i): i is string => typeof i === "string" && i !== "")),
  ].sort();
  if (unique.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM bank_accounts
    WHERE "familyId" = ${familyId}::uuid AND id = ANY(${unique}::uuid[])
    ORDER BY id FOR SHARE`;
}
